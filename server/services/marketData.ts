// server/services/marketData.ts
// Multi-chain Market Data Service with caching and request coalescing

import type { Chain } from "@shared/schema";
import { CHAIN_CONFIG, parsePriceToBaseUnits, isValidChain } from "../lib/chain-utils";

interface TokenData {
  tokenAddress: string;
  name: string;
  symbol: string;
  // Price in chain's base units (lamports for Solana, wei for Base)
  priceNative: bigint;
  priceUsd: number;
  marketCap: number;
  volume24h: number;
  liquidity: number;
  priceChange24h: number;
  decimals: number;
  icon?: string;
  lastUpdated: number;
  chain: Chain;
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
  price: bigint; // Native units
  marketCap: number;
  volume24h: number;
  priceChange24h: number;
  icon?: string;
  chain: Chain;
}

// TTL Configuration (in milliseconds)
const TTL = {
  TOKEN_HOT: 3_000,       // 3s for active tokens
  TOKEN_WARM: 10_000,     // 10s for less active
  TOKEN_COLD: 30_000,     // 30s for inactive
  TRENDING: 30_000,       // 30s for trending list
  SEARCH: 60_000,         // 60s for search results
  NATIVE_PRICE: 30_000,   // 30s for native token price (SOL/ETH)
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
   * Get token data with caching and coalescing for a specific chain
   */
  async getToken(address: string, chain: Chain): Promise<TokenData | null> {
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
  async getTokensBatch(addresses: string[], chain: Chain): Promise<Map<string, TokenData>> {
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
  async getTrending(chain: Chain, limit: number = 20): Promise<TokenData[]> {
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

    const promise = this.fetchTrendingFromUpstream(chain, limit);
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
   * Search tokens for a specific chain
   */
  async search(query: string, chain: Chain): Promise<SearchResult[]> {
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
  async getTokenSWR(address: string, chain: Chain): Promise<TokenData | null> {
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

      // Get DexScreener chain ID for filtering
      const dexChainId = CHAIN_CONFIG[chain].dexScreenerChainId;
      
      // Find best pair for the specified chain
      const pairs = data.pairs || [];
      const chainPairs = pairs.filter((p: any) => p.chainId === dexChainId);

      if (chainPairs.length === 0) {
        console.warn(`No ${chain} pairs found for token ${address}`);
        return null;
      }

      // Get highest liquidity pair
      const bestPair = chainPairs.reduce((best: any, current: any) => {
        const bestLiq = best?.liquidity?.usd || 0;
        const currentLiq = current?.liquidity?.usd || 0;
        return currentLiq > bestLiq ? current : best;
      }, chainPairs[0]);

      if (!bestPair) return null;

      // Parse price to chain's base units using chain-utils
      const priceNative = parsePriceToBaseUnits(chain, bestPair.priceNative || '0');

      return {
        tokenAddress: address,
        name: bestPair.baseToken?.name || 'Unknown',
        symbol: bestPair.baseToken?.symbol || '???',
        priceNative: BigInt(priceNative),
        priceUsd: parseFloat(bestPair.priceUsd || '0'),
        marketCap: bestPair.marketCap || bestPair.fdv || 0,
        volume24h: bestPair.volume?.h24 || 0,
        liquidity: bestPair.liquidity?.usd || 0,
        priceChange24h: bestPair.priceChange?.h24 || 0,
        decimals: bestPair.baseToken?.decimals || (chain === 'base' ? 18 : 6),
        icon: bestPair.info?.imageUrl,
        lastUpdated: Date.now(),
        chain,
      };
    } catch (error: any) {
      this.recordFailure('dexscreener');
      console.warn(`❌ Failed to fetch token ${address} on ${chain}:`, error.message);
      return null;
    }
  }

  private async fetchTrendingFromUpstream(chain: Chain, limit: number): Promise<TokenData[]> {
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

      // Get DexScreener chain ID
      const dexChainId = CHAIN_CONFIG[chain].dexScreenerChainId;
      
      // Filter for specified chain tokens
      const chainTokens = (data || [])
        .filter((t: any) => t.chainId === dexChainId)
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

      // Get DexScreener chain ID
      const dexChainId = CHAIN_CONFIG[chain].dexScreenerChainId;
      
      // Filter for specified chain pairs and dedupe by token address
      const seen = new Set<string>();
      const results: SearchResult[] = [];

      for (const pair of (data.pairs || [])) {
        if (pair.chainId !== dexChainId) continue;

        const addr = pair.baseToken?.address;
        if (!addr || seen.has(addr)) continue;
        seen.add(addr);

        const priceNative = parsePriceToBaseUnits(chain, pair.priceNative || '0');

        results.push({
          tokenAddress: addr,
          name: pair.baseToken?.name || 'Unknown',
          symbol: pair.baseToken?.symbol || '???',
          price: BigInt(priceNative),
          marketCap: pair.marketCap || pair.fdv || 0,
          volume24h: pair.volume?.h24 || 0,
          priceChange24h: pair.priceChange?.h24 || 0,
          icon: pair.info?.imageUrl,
          chain,
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
}

// Export singleton instance
export const marketDataService = new MarketDataService();
export type { TokenData, SearchResult };
