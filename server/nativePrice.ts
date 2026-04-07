// server/nativePrice.ts
// Multi-chain native token price service (SOL, ETH, etc.)

import type { Chain } from "@shared/schema";
import { CHAIN_CONFIG } from "./lib/chain-utils";

interface PriceCache {
  price: number;
  timestamp: number;
  source: string;
}

// Per-chain price caches
const priceCaches: Map<Chain, PriceCache> = new Map();

// Config
const PRICE_CACHE_TTL = 30_000;        // 30 seconds - fresh cache
const PRICE_STALE_TTL = 5 * 60_000;    // 5 minutes - stale but usable
const API_TIMEOUT = 5000;              // 5 second timeout per source

// Price sources per chain
const PRICE_SOURCES: Record<Chain, Array<{
  name: string;
  url: string;
  extract: (data: any) => number | null | undefined;
}>> = {
  solana: [
    {
      name: 'coingecko',
      url: 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      extract: (data: any) => data?.solana?.usd,
    },
    {
      name: 'binance',
      url: 'https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT',
      extract: (data: any) => parseFloat(data?.price),
    },
    {
      name: 'jupiter',
      url: 'https://price.jup.ag/v6/price?ids=SOL',
      extract: (data: any) => data?.data?.SOL?.price,
    },
  ],
  base: [
    {
      name: 'coingecko',
      url: 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
      extract: (data: any) => data?.ethereum?.usd,
    },
    {
      name: 'binance',
      url: 'https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT',
      extract: (data: any) => parseFloat(data?.price),
    },
  ],
};

/**
 * Fetch price from a single source with timeout
 */
async function fetchFromSource(source: typeof PRICE_SOURCES[Chain][0]): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);

    const response = await fetch(source.url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = await response.json();
    const price = source.extract(data);

    if (price && typeof price === 'number' && price > 0 && isFinite(price)) {
      return price;
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Get current native token price for a chain with caching
 * Returns null if price is truly unavailable
 */
export async function getNativePrice(chain: Chain): Promise<number | null> {
  const now = Date.now();
  const cached = priceCaches.get(chain);
  const symbol = CHAIN_CONFIG[chain].nativeSymbol;

  // Return fresh cached price if available
  if (cached && (now - cached.timestamp) < PRICE_CACHE_TTL) {
    return cached.price;
  }

  const sources = PRICE_SOURCES[chain];
  if (!sources || sources.length === 0) {
    console.error(`❌ No price sources configured for ${chain}`);
    return null;
  }

  // Try each price source in order
  for (const source of sources) {
    const price = await fetchFromSource(source);

    if (price !== null) {
      priceCaches.set(chain, { price, timestamp: now, source: source.name });
      console.log(`✅ ${symbol} price from ${source.name}: $${price.toFixed(2)}`);
      return price;
    }

    console.warn(`⚠️ Failed to fetch ${symbol} price from ${source.name}`);
  }

  // All sources failed - return stale cache if within stale TTL
  if (cached && (now - cached.timestamp) < PRICE_STALE_TTL) {
    const ageSeconds = Math.round((now - cached.timestamp) / 1000);
    console.warn(`⚠️ Using stale ${symbol} price from ${cached.source} (${ageSeconds}s old): $${cached.price.toFixed(2)}`);
    return cached.price;
  }

  // No price available at all
  console.error(`❌ ${symbol} price unavailable from all sources`);
  return null;
}

/**
 * Get cached native price synchronously
 */
export function getCachedNativePrice(chain: Chain): number | null {
  const cached = priceCaches.get(chain);
  if (!cached) return null;

  const now = Date.now();
  if ((now - cached.timestamp) < PRICE_STALE_TTL) {
    return cached.price;
  }

  return null;
}

/**
 * Get detailed cache status for a chain
 */
export function getNativePriceCacheStatus(chain: Chain): {
  price: number | null;
  available: boolean;
  source: string | null;
  ageMs: number;
  isFresh: boolean;
  isStale: boolean;
} {
  const now = Date.now();
  const cached = priceCaches.get(chain);

  if (!cached) {
    return {
      price: null,
      available: false,
      source: null,
      ageMs: -1,
      isFresh: false,
      isStale: true,
    };
  }

  const ageMs = now - cached.timestamp;

  return {
    price: cached.price,
    available: ageMs < PRICE_STALE_TTL,
    source: cached.source,
    ageMs,
    isFresh: ageMs < PRICE_CACHE_TTL,
    isStale: ageMs >= PRICE_CACHE_TTL,
  };
}

/**
 * Force refresh the native price cache for a chain
 */
export async function refreshNativePrice(chain: Chain): Promise<boolean> {
  const price = await getNativePrice(chain);
  return price !== null;
}

/**
 * Get all supported chains' prices
 */
export async function getAllNativePrices(): Promise<Record<Chain, number | null>> {
  const chains = Object.keys(PRICE_SOURCES) as Chain[];
  const results = await Promise.all(
    chains.map(async (chain) => ({
      chain,
      price: await getNativePrice(chain),
    }))
  );

  return results.reduce((acc, { chain, price }) => {
    acc[chain] = price;
    return acc;
  }, {} as Record<Chain, number | null>);
}

// ============================================================================
// Backward Compatibility - SOL price functions
// ============================================================================

/**
 * @deprecated Use getNativePrice('solana') instead
 */
export async function getSolPrice(): Promise<number | null> {
  return getNativePrice('solana');
}

/**
 * @deprecated Use getCachedNativePrice('solana') instead
 */
export function getCachedSolPrice(): number | null {
  return getCachedNativePrice('solana');
}

/**
 * @deprecated Use getNativePriceCacheStatus('solana') instead
 */
export function getSolPriceCacheStatus(): ReturnType<typeof getNativePriceCacheStatus> {
  return getNativePriceCacheStatus('solana');
}

/**
 * @deprecated Use refreshNativePrice('solana') instead
 */
export async function refreshSolPrice(): Promise<boolean> {
  return refreshNativePrice('solana');
}
