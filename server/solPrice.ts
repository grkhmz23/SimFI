// server/solPrice.ts
// ✅ FIX #6: Multiple price sources, no hardcoded fallback

interface PriceCache {
  price: number;
  timestamp: number;
  source: string;
}

let cachedSolPrice: PriceCache | null = null;
let cachedEthPrice: PriceCache | null = null;

// Config
const PRICE_CACHE_TTL = 30_000;        // 30 seconds - fresh cache
const PRICE_STALE_TTL = 5 * 60_000;    // 5 minutes - stale but usable
const API_TIMEOUT = 5000;               // 5 second timeout per source

// SOL Price sources in order of preference
const SOL_PRICE_SOURCES = [
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
];

// ETH Price sources in order of preference
const ETH_PRICE_SOURCES = [
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
];

/**
 * Fetch price from a single source with timeout
 */
async function fetchFromSource(source: { name: string; url: string; extract: (data: any) => number }): Promise<number | null> {
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
 * Get current SOL price with caching and multiple fallback sources
 * Returns null if price is truly unavailable (no hardcoded fallback!)
 */
export async function getSolPrice(): Promise<number | null> {
  const now = Date.now();

  // Return fresh cached price if available
  if (cachedSolPrice && (now - cachedSolPrice.timestamp) < PRICE_CACHE_TTL) {
    return cachedSolPrice.price;
  }

  // Try each price source in order
  for (const source of SOL_PRICE_SOURCES) {
    const price = await fetchFromSource(source);

    if (price !== null) {
      cachedSolPrice = { price, timestamp: now, source: source.name };
      console.log(`✅ SOL price from ${source.name}: $${price.toFixed(2)}`);
      return price;
    }

    console.warn(`⚠️ Failed to fetch SOL price from ${source.name}`);
  }

  // All sources failed - return stale cache if within stale TTL
  if (cachedSolPrice && (now - cachedSolPrice.timestamp) < PRICE_STALE_TTL) {
    const ageSeconds = Math.round((now - cachedSolPrice.timestamp) / 1000);
    console.warn(`⚠️ Using stale SOL price from ${cachedSolPrice.source} (${ageSeconds}s old): $${cachedSolPrice.price.toFixed(2)}`);
    return cachedSolPrice.price;
  }

  // No price available at all
  console.error('❌ SOL price unavailable from all sources');
  return null;
}

/**
 * Get current ETH price with caching and multiple fallback sources
 * Returns null if price is truly unavailable
 */
export async function getEthPrice(): Promise<number | null> {
  const now = Date.now();

  // Return fresh cached price if available
  if (cachedEthPrice && (now - cachedEthPrice.timestamp) < PRICE_CACHE_TTL) {
    return cachedEthPrice.price;
  }

  // Try each price source in order
  for (const source of ETH_PRICE_SOURCES) {
    const price = await fetchFromSource(source);

    if (price !== null) {
      cachedEthPrice = { price, timestamp: now, source: source.name };
      console.log(`✅ ETH price from ${source.name}: $${price.toFixed(2)}`);
      return price;
    }

    console.warn(`⚠️ Failed to fetch ETH price from ${source.name}`);
  }

  // All sources failed - return stale cache if within stale TTL
  if (cachedEthPrice && (now - cachedEthPrice.timestamp) < PRICE_STALE_TTL) {
    const ageSeconds = Math.round((now - cachedEthPrice.timestamp) / 1000);
    console.warn(`⚠️ Using stale ETH price from ${cachedEthPrice.source} (${ageSeconds}s old): $${cachedEthPrice.price.toFixed(2)}`);
    return cachedEthPrice.price;
  }

  // No price available at all
  console.error('❌ ETH price unavailable from all sources');
  return null;
}

/**
 * Get cached SOL price synchronously
 * Returns null if no cached price available (no hardcoded fallback!)
 */
export function getCachedSolPrice(): number | null {
  if (!cachedSolPrice) return null;

  // Return even stale cache for sync access
  const now = Date.now();
  if ((now - cachedSolPrice.timestamp) < PRICE_STALE_TTL) {
    return cachedSolPrice.price;
  }

  return null;
}

/**
 * Get cached ETH price synchronously
 * Returns null if no cached price available
 */
export function getCachedEthPrice(): number | null {
  if (!cachedEthPrice) return null;

  // Return even stale cache for sync access
  const now = Date.now();
  if ((now - cachedEthPrice.timestamp) < PRICE_STALE_TTL) {
    return cachedEthPrice.price;
  }

  return null;
}

/**
 * Get detailed cache status for API responses and debugging
 */
export function getSolPriceCacheStatus(): {
  price: number | null;
  available: boolean;
  source: string | null;
  ageMs: number;
  isFresh: boolean;
  isStale: boolean;
} {
  const now = Date.now();

  if (!cachedSolPrice) {
    return {
      price: null,
      available: false,
      source: null,
      ageMs: -1,
      isFresh: false,
      isStale: true,
    };
  }

  const ageMs = now - cachedSolPrice.timestamp;

  return {
    price: cachedSolPrice.price,
    available: ageMs < PRICE_STALE_TTL,
    source: cachedSolPrice.source,
    ageMs,
    isFresh: ageMs < PRICE_CACHE_TTL,
    isStale: ageMs >= PRICE_CACHE_TTL,
  };
}

/**
 * Get detailed ETH cache status for API responses and debugging
 */
export function getEthPriceCacheStatus(): {
  price: number | null;
  available: boolean;
  source: string | null;
  ageMs: number;
  isFresh: boolean;
  isStale: boolean;
} {
  const now = Date.now();

  if (!cachedEthPrice) {
    return {
      price: null,
      available: false,
      source: null,
      ageMs: -1,
      isFresh: false,
      isStale: true,
    };
  }

  const ageMs = now - cachedEthPrice.timestamp;

  return {
    price: cachedEthPrice.price,
    available: ageMs < PRICE_STALE_TTL,
    source: cachedEthPrice.source,
    ageMs,
    isFresh: ageMs < PRICE_CACHE_TTL,
    isStale: ageMs >= PRICE_CACHE_TTL,
  };
}

/**
 * Force refresh the SOL price cache
 * Useful for health checks or manual refresh
 */
export async function refreshSolPrice(): Promise<boolean> {
  const price = await getSolPrice();
  return price !== null;
}

/**
 * Force refresh the ETH price cache
 * Useful for health checks or manual refresh
 */
export async function refreshEthPrice(): Promise<boolean> {
  const price = await getEthPrice();
  return price !== null;
}

// Alias for backward compatibility
export { getSolPrice as fetchSolPrice, getEthPrice as fetchEthPrice };
