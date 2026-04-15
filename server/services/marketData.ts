// server/services/marketData.ts
// Market Data Service with caching and request coalescing - Multi-chain support

import type { Chain } from '@shared/schema';

interface TokenData {
  tokenAddress: string;
  name: string;
  symbol: string;
  priceNative: bigint;        // Price in native token (lamports for Solana, wei for Base)
  priceUsd: number;
  marketCap: number;
  volume24h: number;
  liquidity: number;
  priceChange24h: number;
  decimals: number;
  chain: Chain;
  icon?: string;
  pairCreatedAt?: number;
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
  price: bigint;              // Price in native token
  marketCap: number;
  volume24h: number;
  priceChange24h: number;
  decimals: number;
  chain: Chain;
  icon?: string;
}

// TTL Configuration (in milliseconds)
const TTL = {
  TOKEN_HOT: 3_000,       // 3s for active tokens
  TOKEN_WARM: 10_000,     // 10s for less active
  TOKEN_COLD: 30_000,     // 30s for inactive
  TRENDING: 30_000,       // 30s for trending list
  SEARCH: 60_000,         // 60s for search results
};

// Chain configuration
const CHAIN_CONFIG = {
  solana: {
    decimals: 9,          // Lamports
    dexScreenerChainId: 'solana',
    defaultTokenDecimals: 6,
  },
  base: {
    decimals: 18,         // Wei
    dexScreenerChainId: 'base',
    defaultTokenDecimals: 18, // Most ERC-20 tokens use 18 decimals
  },
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
  async getToken(address: string, chain: Chain = 'solana'): Promise<TokenData | null> {
    const cacheKey = `token:${chain}:${address}`;

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
    const promise = this.fetchTokenFromUpstream(address, chain);
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
  async getTokensBatch(addresses: string[], chain: Chain = 'solana'): Promise<Map<string, TokenData>> {
    const results = new Map<string, TokenData>();
    const uncached: string[] = [];

    // 1. Get what we can from cache
    for (const addr of addresses) {
      const cached = this.getFromCache<TokenData>(`token:${chain}:${addr}`);
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
          batch.map(addr => this.getToken(addr, chain))
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
   * Get trending tokens for a specific chain
   */
  async getTrending(limit: number = 20, chain: Chain = 'solana'): Promise<TokenData[]> {
    const cacheKey = `trending:${chain}:${limit}`;

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

    const promise = this.fetchTrendingFromUpstream(limit, chain);
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
   * Search tokens on a specific chain
   */
  async search(query: string, chain: Chain = 'solana'): Promise<SearchResult[]> {
    const normalizedQuery = query.toLowerCase().trim();
    const cacheKey = `search:${chain}:${normalizedQuery}`;

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

    const promise = this.fetchSearchFromUpstream(normalizedQuery, chain);
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
  async getTokenSWR(address: string, chain: Chain = 'solana'): Promise<TokenData | null> {
    const cacheKey = `token:${chain}:${address}`;
    const cached = this.cache.get(cacheKey);

    if (cached) {
      // Check if expired
      if (Date.now() > cached.expiresAt) {
        // Trigger background refresh (don't await)
        this.getToken(address, chain).catch(() => {});
      }
      return cached.data;
    }

    // No cache - must wait
    return this.getToken(address, chain);
  }

  /**
   * Get new pairs for a specific chain (filtered by age)
   */
  async getNewPairs(ageHours: number = 24, chain: Chain = 'solana'): Promise<TokenData[]> {
    const cacheKey = `newpairs:${chain}:${ageHours}`;

    const cached = this.getFromCache<TokenData[]>(cacheKey);
    if (cached) {
      this.stats.cacheHits++;
      return cached;
    }

    this.stats.cacheMisses++;

    const existing = this.inFlight.get(cacheKey);
    if (existing) {
      this.stats.coalescedRequests++;
      return existing;
    }

    const promise = this.fetchNewPairsFromUpstream(ageHours, chain);
    this.inFlight.set(cacheKey, promise);

    try {
      const data = await promise;
      this.setCache(cacheKey, data, TTL.TOKEN_COLD);
      return data;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  /**
   * Get hot tokens by volume/liquidity momentum
   */
  async getHotTokens(limit: number = 20, chain: Chain = 'solana'): Promise<TokenData[]> {
    const cacheKey = `hot:${chain}:${limit}`;

    const cached = this.getFromCache<TokenData[]>(cacheKey);
    if (cached) {
      this.stats.cacheHits++;
      return cached;
    }

    this.stats.cacheMisses++;

    const existing = this.inFlight.get(cacheKey);
    if (existing) {
      this.stats.coalescedRequests++;
      return existing;
    }

    const promise = this.fetchHotFromUpstream(limit, chain);
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

  private async fetchTokenFromUpstream(address: string, chain: Chain): Promise<TokenData | null> {
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

      const config = CHAIN_CONFIG[chain];
      const chainId = config.dexScreenerChainId;

      // Find pairs for the specified chain
      const pairs = data.pairs || [];
      const chainPairs = pairs.filter((p: any) => p.chainId === chainId);

      if (chainPairs.length === 0) {
        console.warn(`No ${chain} pairs found for ${address}`);
        return null;
      }

      // Get highest liquidity pair
      const bestPair = chainPairs.reduce((best: any, current: any) => {
        const bestLiq = best?.liquidity?.usd || 0;
        const currentLiq = current?.liquidity?.usd || 0;
        return currentLiq > bestLiq ? current : best;
      }, chainPairs[0]);

      if (!bestPair) return null;

      // Parse price to native units (lamports/wei)
      const priceNative = this.parseDecimalToNative(bestPair.priceNative || '0', chain);
      const tokenDecimals = bestPair.baseToken?.decimals || config.defaultTokenDecimals;

      return {
        tokenAddress: address,
        name: bestPair.baseToken?.name || 'Unknown',
        symbol: bestPair.baseToken?.symbol || '???',
        priceNative,
        priceUsd: parseFloat(bestPair.priceUsd || '0'),
        marketCap: bestPair.marketCap || bestPair.fdv || 0,
        volume24h: bestPair.volume?.h24 || 0,
        liquidity: bestPair.liquidity?.usd || 0,
        priceChange24h: bestPair.priceChange?.h24 || 0,
        decimals: tokenDecimals,
        chain,
        icon: bestPair.info?.imageUrl,
        pairCreatedAt: bestPair.pairCreatedAt,
        lastUpdated: Date.now(),
      };
    } catch (error: any) {
      this.recordFailure('dexscreener');
      console.warn(`❌ Failed to fetch token ${address} on ${chain}:`, error.message);
      return null;
    }
  }

  private async fetchTrendingFromUpstream(limit: number, chain: Chain): Promise<TokenData[]> {
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

      const config = CHAIN_CONFIG[chain];

      // Filter for the specified chain
      const chainTokens = (data || [])
        .filter((t: any) => t.chainId === config.dexScreenerChainId)
        .slice(0, limit);

      // Fetch full data for each
      const results: TokenData[] = [];
      for (const token of chainTokens) {
        const fullData = await this.getToken(token.tokenAddress, chain);
        if (fullData) {
          results.push(fullData);
        }
      }

      return results;
    } catch (error: any) {
      this.recordFailure('dexscreener');
      console.warn(`❌ Failed to fetch trending for ${chain}:`, error.message);
      return [];
    }
  }

  private async fetchNewPairsFromUpstream(ageHours: number, chain: Chain): Promise<TokenData[]> {
    if (this.isCircuitOpen('dexscreener')) {
      return [];
    }

    this.stats.upstreamCalls++;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      // Use latest token profiles as a proxy for new token launches
      const response = await fetch(
        'https://api.dexscreener.com/token-profiles/latest/v1',
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (!response.ok) {
        this.recordFailure('dexscreener');
        return [];
      }

      const data = await response.json();
      this.recordSuccess('dexscreener');

      const config = CHAIN_CONFIG[chain];
      const cutoff = Date.now() - (ageHours * 60 * 60 * 1000);

      // Filter for specified chain
      const chainTokens = (data || [])
        .filter((t: any) => t.chainId === config.dexScreenerChainId)
        .slice(0, 40);

      // Fetch full details and filter by pair creation time
      const results: TokenData[] = [];
      for (const token of chainTokens) {
        const fullData = await this.getToken(token.tokenAddress, chain);
        if (fullData) {
          // Include if pairCreatedAt is within age window OR if no creation time but very fresh profile
          const createdAt = fullData.pairCreatedAt || 0;
          if (createdAt >= cutoff || (createdAt === 0 && ageHours >= 24)) {
            results.push(fullData);
          }
        }
      }

      return results
        .sort((a, b) => (b.pairCreatedAt || 0) - (a.pairCreatedAt || 0))
        .slice(0, 30);
    } catch (error: any) {
      this.recordFailure('dexscreener');
      console.warn(`❌ Failed to fetch new pairs for ${chain}:`, error.message);
      return [];
    }
  }

  private async fetchHotFromUpstream(limit: number, chain: Chain): Promise<TokenData[]> {
    // Hot = highest volume-to-liquidity ratio from trending + top boosted
    const trending = await this.getTrending(limit * 3, chain);

    const scored = trending.map((t) => ({
      ...t,
      hotScore: t.liquidity > 1000 ? t.volume24h / t.liquidity : 0,
    }));

    return scored
      .sort((a, b) => b.hotScore - a.hotScore)
      .slice(0, limit);
  }

  private async fetchSearchFromUpstream(query: string, chain: Chain): Promise<SearchResult[]> {
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

      const config = CHAIN_CONFIG[chain];

      // Filter for the specified chain and dedupe by token address
      const seen = new Set<string>();
      const results: SearchResult[] = [];

      for (const pair of (data.pairs || [])) {
        if (pair.chainId !== config.dexScreenerChainId) continue;

        const addr = pair.baseToken?.address;
        if (!addr || seen.has(addr)) continue;
        seen.add(addr);

        const tokenDecimals = pair.baseToken?.decimals || config.defaultTokenDecimals;

        results.push({
          tokenAddress: addr,
          name: pair.baseToken?.name || 'Unknown',
          symbol: pair.baseToken?.symbol || '???',
          price: this.parseDecimalToNative(pair.priceNative || '0', chain),
          marketCap: pair.marketCap || pair.fdv || 0,
          volume24h: pair.volume?.h24 || 0,
          priceChange24h: pair.priceChange?.h24 || 0,
          decimals: tokenDecimals,
          chain,
          icon: pair.info?.imageUrl,
        });

        if (results.length >= 20) break;
      }

      return results;
    } catch (error: any) {
      this.recordFailure('dexscreener');
      console.warn(`❌ Failed to search on ${chain}:`, error.message);
      return [];
    }
  }

  // =========================================================================
  // PRIVATE - HELPERS
  // =========================================================================

  /**
   * Parse decimal string to native units (lamports for Solana, wei for Base)
   */
  private parseDecimalToNative(decimalString: string, chain: Chain): bigint {
    if (!decimalString || decimalString === '0') return 0n;

    const config = CHAIN_CONFIG[chain];
    const nativeDecimals = config.decimals;

    const parts = decimalString.split('.');
    const wholePart = parts[0] || '0';
    let fracPart = parts[1] || '';

    // Pad/truncate to native decimals
    if (fracPart.length > nativeDecimals) {
      fracPart = fracPart.slice(0, nativeDecimals);
    } else {
      fracPart = fracPart.padEnd(nativeDecimals, '0');
    }

    const cleanWhole = wholePart.replace(/^0+/, '') || '0';
    const nativeUnits = BigInt(cleanWhole + fracPart);

    return nativeUnits > 0n ? nativeUnits : 1n; // Return at least 1 for valid non-zero prices
  }

  /**
   * Get chain configuration
   */
  getChainConfig(chain: Chain) {
    return CHAIN_CONFIG[chain];
  }
}

// Export singleton instance
export const marketDataService = new MarketDataService();
export type { TokenData, SearchResult };
