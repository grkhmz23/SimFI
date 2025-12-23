// server/services/marketData.ts
// Market Data Service with caching and request coalescing

interface TokenData {
  tokenAddress: string;
  name: string;
  symbol: string;
  priceLamports: number;
  priceUsd: number;
  marketCap: number;
  volume24h: number;
  liquidity: number;
  priceChange24h: number;
  decimals: number;
  icon?: string;
  lastUpdated: number;
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
  expiresAt: number;
}

interface SearchResult {
  tokenAddress: string;
  name: string;
  symbol: string;
  price: number;
  marketCap: number;
  volume24h: number;
  priceChange24h: number;
  icon?: string;
}

// TTL Configuration (in milliseconds)
const TTL = {
  TOKEN_HOT: 3_000,       // 3s for active tokens
  TOKEN_WARM: 10_000,     // 10s for less active
  TOKEN_COLD: 30_000,     // 30s for inactive
  TRENDING: 30_000,       // 30s for trending list
  SEARCH: 60_000,         // 60s for search results
  SOL_PRICE: 30_000,      // 30s for SOL/USD price
};

// Circuit breaker for external APIs
interface CircuitState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

class MarketDataService {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private inFlight: Map<string, Promise<any>> = new Map();
  private circuits: Map<string, CircuitState> = new Map();

  private CIRCUIT_THRESHOLD = 5;
  private CIRCUIT_RESET_MS = 30_000;

  // Stats for monitoring
  private stats = {
    cacheHits: 0,
    cacheMisses: 0,
    coalescedRequests: 0,
    upstreamCalls: 0,
  };

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  /**
   * Get token data with caching and coalescing
   */
  async getToken(address: string): Promise<TokenData | null> {
    const cacheKey = `token:${address}`;

    // 1. Check cache
    const cached = this.getFromCache<TokenData>(cacheKey);
    if (cached) {
      this.stats.cacheHits++;
      return cached;
    }

    this.stats.cacheMisses++;

    // 2. Check if request already in-flight (COALESCING)
    const existing = this.inFlight.get(cacheKey);
    if (existing) {
      this.stats.coalescedRequests++;
      return existing;
    }

    // 3. Make new request
    const promise = this.fetchTokenFromUpstream(address);
    this.inFlight.set(cacheKey, promise);

    try {
      const data = await promise;

      if (data) {
        // 4. Cache result
        this.setCache(cacheKey, data, TTL.TOKEN_HOT);
      }

      return data;
    } finally {
      // 5. Clear in-flight
      this.inFlight.delete(cacheKey);
    }
  }

  /**
   * Get multiple tokens in batch (for positions page)
   */
  async getTokensBatch(addresses: string[]): Promise<Map<string, TokenData>> {
    const results = new Map<string, TokenData>();
    const uncached: string[] = [];

    // 1. Get what we can from cache
    for (const addr of addresses) {
      const cached = this.getFromCache<TokenData>(`token:${addr}`);
      if (cached) {
        results.set(addr, cached);
        this.stats.cacheHits++;
      } else {
        uncached.push(addr);
      }
    }

    // 2. Fetch uncached in parallel (with concurrency limit)
    if (uncached.length > 0) {
      const BATCH_SIZE = 5;
      for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
        const batch = uncached.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(addr => this.getToken(addr))
        );

        batch.forEach((addr, idx) => {
          if (batchResults[idx]) {
            results.set(addr, batchResults[idx]!);
          }
        });
      }
    }

    return results;
  }

  /**
   * Get trending tokens
   */
  async getTrending(limit: number = 20): Promise<TokenData[]> {
    const cacheKey = `trending:${limit}`;

    const cached = this.getFromCache<TokenData[]>(cacheKey);
    if (cached) {
      this.stats.cacheHits++;
      return cached;
    }

    this.stats.cacheMisses++;

    // Coalesce
    const existing = this.inFlight.get(cacheKey);
    if (existing) {
      this.stats.coalescedRequests++;
      return existing;
    }

    const promise = this.fetchTrendingFromUpstream(limit);
    this.inFlight.set(cacheKey, promise);

    try {
      const data = await promise;
      this.setCache(cacheKey, data, TTL.TRENDING);
      return data;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  /**
   * Search tokens
   */
  async search(query: string): Promise<SearchResult[]> {
    const normalizedQuery = query.toLowerCase().trim();
    const cacheKey = `search:${normalizedQuery}`;

    const cached = this.getFromCache<SearchResult[]>(cacheKey);
    if (cached) {
      this.stats.cacheHits++;
      return cached;
    }

    this.stats.cacheMisses++;

    // Coalesce
    const existing = this.inFlight.get(cacheKey);
    if (existing) {
      this.stats.coalescedRequests++;
      return existing;
    }

    const promise = this.fetchSearchFromUpstream(normalizedQuery);
    this.inFlight.set(cacheKey, promise);

    try {
      const data = await promise;
      this.setCache(cacheKey, data, TTL.SEARCH);
      return data;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  /**
   * Get with stale-while-revalidate pattern
   * Returns cached data immediately (even if stale), refreshes in background
   */
  async getTokenSWR(address: string): Promise<TokenData | null> {
    const cacheKey = `token:${address}`;
    const cached = this.cache.get(cacheKey);

    if (cached) {
      // Check if expired
      if (Date.now() > cached.expiresAt) {
        // Trigger background refresh (don't await)
        this.getToken(address).catch(() => {});
      }
      return cached.data;
    }

    // No cache - must wait
    return this.getToken(address);
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.stats.cacheHits + this.stats.cacheMisses > 0
      ? (this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) * 100).toFixed(1)
      : '0';

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      cacheSize: this.cache.size,
      inFlightRequests: this.inFlight.size,
    };
  }

  /**
   * Clear all caches (for testing)
   */
  clearCache(): void {
    this.cache.clear();
    this.inFlight.clear();
    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      coalescedRequests: 0,
      upstreamCalls: 0,
    };
  }

  // =========================================================================
  // PRIVATE - CACHE HELPERS
  // =========================================================================

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  private setCache(key: string, data: any, ttlMs: number): void {
    this.cache.set(key, {
      data,
      fetchedAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    });
  }

  // =========================================================================
  // PRIVATE - CIRCUIT BREAKER
  // =========================================================================

  private isCircuitOpen(apiName: string): boolean {
    const circuit = this.circuits.get(apiName);
    if (!circuit || !circuit.isOpen) return false;

    // Check if reset time passed
    if (Date.now() - circuit.lastFailure > this.CIRCUIT_RESET_MS) {
      circuit.isOpen = false;
      circuit.failures = 0;
      return false;
    }

    return true;
  }

  private recordSuccess(apiName: string): void {
    const circuit = this.circuits.get(apiName);
    if (circuit) {
      circuit.failures = 0;
      circuit.isOpen = false;
    }
  }

  private recordFailure(apiName: string): void {
    let circuit = this.circuits.get(apiName);
    if (!circuit) {
      circuit = { failures: 0, lastFailure: 0, isOpen: false };
      this.circuits.set(apiName, circuit);
    }

    circuit.failures++;
    circuit.lastFailure = Date.now();

    if (circuit.failures >= this.CIRCUIT_THRESHOLD) {
      circuit.isOpen = true;
      console.warn(`⚠️ Circuit OPEN for ${apiName}`);
    }
  }

  // =========================================================================
  // PRIVATE - UPSTREAM FETCHERS
  // =========================================================================

  private async fetchTokenFromUpstream(address: string): Promise<TokenData | null> {
    if (this.isCircuitOpen('dexscreener')) {
      console.log(`⏸️ DexScreener circuit open, skipping`);
      return null;
    }

    this.stats.upstreamCalls++;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${address}`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (!response.ok) {
        this.recordFailure('dexscreener');
        return null;
      }

      const data = await response.json();
      this.recordSuccess('dexscreener');

      // Find best Solana pair
      const pairs = data.pairs || [];
      const solanaPairs = pairs.filter((p: any) => p.chainId === 'solana');

      if (solanaPairs.length === 0) return null;

      // Get highest liquidity pair
      const bestPair = solanaPairs.reduce((best: any, current: any) => {
        const bestLiq = best?.liquidity?.usd || 0;
        const currentLiq = current?.liquidity?.usd || 0;
        return currentLiq > bestLiq ? current : best;
      }, solanaPairs[0]);

      if (!bestPair) return null;

      // Parse price to lamports (9 decimal places)
      const priceLamports = this.parseDecimalToLamports(bestPair.priceNative || '0');

      return {
        tokenAddress: address,
        name: bestPair.baseToken?.name || 'Unknown',
        symbol: bestPair.baseToken?.symbol || '???',
        priceLamports,
        priceUsd: parseFloat(bestPair.priceUsd || '0'),
        marketCap: bestPair.marketCap || bestPair.fdv || 0,
        volume24h: bestPair.volume?.h24 || 0,
        liquidity: bestPair.liquidity?.usd || 0,
        priceChange24h: bestPair.priceChange?.h24 || 0,
        decimals: 6, // Default for Solana tokens
        icon: bestPair.info?.imageUrl,
        lastUpdated: Date.now(),
      };
    } catch (error: any) {
      this.recordFailure('dexscreener');
      console.warn(`❌ Failed to fetch token ${address}:`, error.message);
      return null;
    }
  }

  private async fetchTrendingFromUpstream(limit: number): Promise<TokenData[]> {
    // For now, use DexScreener boosted tokens as "trending"
    // You can replace this with your own trending logic

    if (this.isCircuitOpen('dexscreener')) {
      return [];
    }

    this.stats.upstreamCalls++;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(
        'https://api.dexscreener.com/token-boosts/top/v1',
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (!response.ok) {
        this.recordFailure('dexscreener');
        return [];
      }

      const data = await response.json();
      this.recordSuccess('dexscreener');

      // Filter for Solana tokens
      const solanaTokens = (data || [])
        .filter((t: any) => t.chainId === 'solana')
        .slice(0, limit);

      // Fetch full data for each
      const results: TokenData[] = [];
      for (const token of solanaTokens) {
        const fullData = await this.getToken(token.tokenAddress);
        if (fullData) {
          results.push(fullData);
        }
      }

      return results;
    } catch (error: any) {
      this.recordFailure('dexscreener');
      console.warn('❌ Failed to fetch trending:', error.message);
      return [];
    }
  }

  private async fetchSearchFromUpstream(query: string): Promise<SearchResult[]> {
    if (this.isCircuitOpen('dexscreener')) {
      return [];
    }

    this.stats.upstreamCalls++;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(
        `https://api.dexscreener.com/latest/dex/search/?q=${encodeURIComponent(query)}`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (!response.ok) {
        this.recordFailure('dexscreener');
        return [];
      }

      const data = await response.json();
      this.recordSuccess('dexscreener');

      // Filter for Solana pairs and dedupe by token address
      const seen = new Set<string>();
      const results: SearchResult[] = [];

      for (const pair of (data.pairs || [])) {
        if (pair.chainId !== 'solana') continue;

        const addr = pair.baseToken?.address;
        if (!addr || seen.has(addr)) continue;
        seen.add(addr);

        results.push({
          tokenAddress: addr,
          name: pair.baseToken?.name || 'Unknown',
          symbol: pair.baseToken?.symbol || '???',
          price: this.parseDecimalToLamports(pair.priceNative || '0'),
          marketCap: pair.marketCap || pair.fdv || 0,
          volume24h: pair.volume?.h24 || 0,
          priceChange24h: pair.priceChange?.h24 || 0,
          icon: pair.info?.imageUrl,
        });

        if (results.length >= 20) break;
      }

      return results;
    } catch (error: any) {
      this.recordFailure('dexscreener');
      console.warn('❌ Failed to search:', error.message);
      return [];
    }
  }

  // =========================================================================
  // PRIVATE - HELPERS
  // =========================================================================

  private parseDecimalToLamports(decimalString: string): number {
    if (!decimalString || decimalString === '0') return 0;

    const parts = decimalString.split('.');
    const wholePart = parts[0] || '0';
    let fracPart = parts[1] || '';

    // Pad/truncate to 9 decimals (lamports)
    if (fracPart.length > 9) {
      fracPart = fracPart.slice(0, 9);
    } else {
      fracPart = fracPart.padEnd(9, '0');
    }

    const cleanWhole = wholePart.replace(/^0+/, '') || '0';
    const lamports = parseInt(cleanWhole + fracPart, 10);

    return isNaN(lamports) ? 0 : Math.max(1, lamports);
  }
}

// Export singleton instance
export const marketDataService = new MarketDataService();
export type { TokenData, SearchResult };