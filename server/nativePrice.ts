// server/nativePrice.ts
// Multi-chain native token price service (SOL, ETH, etc.)
// Circuit-breaker protected, no hardcoded fallbacks.

import type { Chain } from "@shared/schema";
import { CHAIN_CONFIG } from "./lib/chain-utils";

interface PriceCache {
  price: number;
  timestamp: number;
  source: string;
}

interface CircuitState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

// Per-chain price caches
const priceCaches: Map<Chain, PriceCache> = new Map();

// Circuit breaker state per source name (e.g. "coingecko-solana")
const circuits: Map<string, CircuitState> = new Map();

// Config
const PRICE_CACHE_TTL = 30_000;        // 30 seconds - fresh cache
const PRICE_STALE_TTL = 5 * 60_000;    // 5 minutes - stale but usable
const API_TIMEOUT = 5000;              // 5 second timeout per source
const CIRCUIT_THRESHOLD = 3;           // 3 failures
const CIRCUIT_WINDOW_MS = 60_000;      // within 60 seconds
const CIRCUIT_RESET_MS = 90_000;       // skip for 90 seconds

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
    {
      name: 'dexscreener',
      url: 'https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112',
      extract: (data: any) => {
        const pairs = data?.pairs;
        if (!Array.isArray(pairs) || pairs.length === 0) return null;
        // Filter for SOL pairs on Solana chain with valid price
        const matched = pairs.filter((p: any) =>
          p.chainId === 'solana' &&
          p.baseToken?.address === 'So11111111111111111111111111111111111111112' &&
          p.priceUsd
        );
        if (matched.length === 0) return null;
        // Sort by liquidity (highest first) for most accurate price
        matched.sort((a: any, b: any) => {
          const liqA = parseFloat(a.liquidity?.usd || '0');
          const liqB = parseFloat(b.liquidity?.usd || '0');
          return liqB - liqA;
        });
        return parseFloat(matched[0].priceUsd);
      },
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
    {
      name: 'dexscreener',
      url: 'https://api.dexscreener.com/latest/dex/tokens/0x4200000000000000000000000000000000000006',
      extract: (data: any) => {
        const pairs = data?.pairs;
        if (!Array.isArray(pairs) || pairs.length === 0) return null;
        // Filter for WETH pairs on Base chain with valid price
        const matched = pairs.filter((p: any) =>
          p.chainId === 'base' &&
          p.baseToken?.address === '0x4200000000000000000000000000000000000006' &&
          p.priceUsd
        );
        if (matched.length === 0) return null;
        // Sort by liquidity (highest first) for most accurate price
        matched.sort((a: any, b: any) => {
          const liqA = parseFloat(a.liquidity?.usd || '0');
          const liqB = parseFloat(b.liquidity?.usd || '0');
          return liqB - liqA;
        });
        return parseFloat(matched[0].priceUsd);
      },
    },
  ],
};

// ============================================================================
// Circuit breaker helpers
// ============================================================================

function getCircuitKey(sourceName: string, chain: Chain): string {
  return `${sourceName}-${chain}`;
}

function isCircuitOpen(sourceName: string, chain: Chain): boolean {
  const key = getCircuitKey(sourceName, chain);
  const circuit = circuits.get(key);
  if (!circuit || !circuit.isOpen) return false;

  if (Date.now() - circuit.lastFailure > CIRCUIT_RESET_MS) {
    circuit.isOpen = false;
    circuit.failures = 0;
    return false;
  }
  return true;
}

function recordSuccess(sourceName: string, chain: Chain): void {
  const key = getCircuitKey(sourceName, chain);
  const circuit = circuits.get(key);
  if (circuit) {
    circuit.failures = 0;
    circuit.isOpen = false;
  }
}

function recordFailure(sourceName: string, chain: Chain): void {
  const key = getCircuitKey(sourceName, chain);
  let circuit = circuits.get(key);
  if (!circuit) {
    circuit = { failures: 0, lastFailure: 0, isOpen: false };
    circuits.set(key, circuit);
  }

  // Only count failures within the window
  const now = Date.now();
  if (now - circuit.lastFailure > CIRCUIT_WINDOW_MS) {
    circuit.failures = 1;
  } else {
    circuit.failures++;
  }
  circuit.lastFailure = now;

  if (circuit.failures >= CIRCUIT_THRESHOLD) {
    circuit.isOpen = true;
    console.warn(`⚠️ Circuit OPEN for ${key}`);
  }
}

// ============================================================================
// Fetch helpers
// ============================================================================

/**
 * Fetch price from a single source with timeout and circuit-breaker protection
 */
async function fetchFromSource(
  source: typeof PRICE_SOURCES[Chain][0],
  chain: Chain
): Promise<number | null> {
  if (isCircuitOpen(source.name, chain)) {
    console.log(`⏸️ ${source.name} circuit open for ${chain}, skipping`);
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);

    const response = await fetch(source.url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      recordFailure(source.name, chain);
      return null;
    }

    const data = await response.json();
    const price = source.extract(data);

    if (price && typeof price === 'number' && price > 0 && isFinite(price)) {
      recordSuccess(source.name, chain);
      return price;
    }
    recordFailure(source.name, chain);
    return null;
  } catch (error) {
    recordFailure(source.name, chain);
    return null;
  }
}

// ============================================================================
// Public API
// ============================================================================

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
    const price = await fetchFromSource(source, chain);

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

/**
 * Get all supported chains' prices with full metadata (source, timestamp)
 */
export function getAllNativePricesDetailed(): Record<string, { usd: number | null; source: string | null; timestamp: number | null }> {
  const chains = Object.keys(PRICE_SOURCES) as Chain[];
  const result: Record<string, { usd: number | null; source: string | null; timestamp: number | null }> = {};

  for (const chain of chains) {
    const status = getNativePriceCacheStatus(chain);
    result[chain === 'solana' ? 'sol' : 'eth'] = {
      usd: status.price,
      source: status.source,
      timestamp: status.price ? Date.now() - status.ageMs : null,
    };
  }

  return result;
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

// ============================================================================
// Backward Compatibility - ETH price functions (matching solPrice.ts exports)
// ============================================================================

/** @deprecated Use getNativePrice('base') instead */
export async function getEthPrice(): Promise<number | null> {
  return getNativePrice('base');
}

/** @deprecated Use getNativePrice('base') instead */
export async function fetchEthPrice(): Promise<number | null> {
  return getNativePrice('base');
}
