import type { Express } from "express";
import { createServer, type Server } from "http";
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { sql } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { db } from "./db";
import { positions, tradeHistory } from "@shared/schema";
import { storage } from "./storage";
import { authenticateToken } from "./middleware/auth";
import { fetchDexScreenerProfiles } from "./pumpportal";
import { leaderboardService } from "./leaderboardService";
import { heliusService } from "./helius-enhanced";
import { insertUserSchema, solToLamports, type LoginRequest, type RegisterRequest, type BuyRequest, type SellRequest, type Chain } from "@shared/schema";
import { isValidChain, isValidEvmAddress, CHAIN_CONFIG, getAddressExplorerUrl } from "./lib/chain-utils";

import { getNativePrice, getCachedNativePrice, getSolPrice, getCachedSolPrice } from './nativePrice';
import { parseToBaseUnits, formatFromBaseUnits } from './lib/chain-utils';
import { marketDataService } from "./services/marketData";
import { registerMarketRoutes } from "./services/marketRoutes";
import { registerRewardsRoutes } from "./services/rewardsRoutes";
import { rewardsEngine } from "./services/rewardsEngine";

// ============================================================================
// RATE LIMITING WITH REDIS STORE (for multi-instance deployments)
// ============================================================================

// Skip function to exclude health checks from rate limiting
const skipHealthCheck = (req: any) => req.path === '/api/health';

// Redis store for rate limiting (shared across instances)
// Falls back to in-memory if Redis unavailable
let rateLimitStore: any = undefined; // undefined = use default MemoryStore

async function initializeRateLimitStore() {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    console.log('ℹ️  REDIS_URL not set - using in-memory rate limiting');
    console.log('   ⚠️  Rate limits will NOT be shared across instances');
    return;
  }

  try {
    // Dynamic import to avoid requiring redis packages in dev/test
    // These packages are optional - install with: npm install ioredis rate-limit-redis
    // Using Function constructor to bypass TypeScript module resolution
    const dynamicImport = new Function('modulePath', 'return import(modulePath)');

    let RedisStore: any;
    let Redis: any;

    try {
      const RedisStoreModule = await dynamicImport('rate-limit-redis');
      const IoRedisModule = await dynamicImport('ioredis');
      RedisStore = RedisStoreModule.default;
      Redis = IoRedisModule.default || IoRedisModule.Redis;
    } catch (importError) {
      console.warn('⚠️  Redis packages not installed. Run: npm install ioredis rate-limit-redis');
      console.log('   Falling back to in-memory rate limiting');
      return;
    }

    const redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      retryStrategy: (times: number) => {
        if (times > 3) {
          console.warn('⚠️  Redis connection failed - falling back to in-memory rate limiting');
          return null; // Stop retrying
        }
        return Math.min(times * 100, 1000);
      },
    });

    redisClient.on('error', (err: Error) => {
      console.warn('⚠️  Redis error:', err.message);
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis connected for rate limiting');
    });

    // Test connection
    await redisClient.ping();

    rateLimitStore = new RedisStore({
      sendCommand: (...args: string[]) => redisClient.call(...args),
      prefix: 'simfi:rl:', // Prefix for rate limit keys
    });

    console.log('✅ Rate limiting using Redis store (shared across instances)');
  } catch (error: any) {
    console.warn('⚠️  Failed to initialize Redis store:', error.message);
    console.log('   Falling back to in-memory rate limiting');
    console.log('   ⚠️  Rate limits will NOT be shared across instances');
  }
}

// Initialize Redis store (non-blocking)
initializeRateLimitStore().catch(console.error);

// ✅ FIX: Two-tier rate limiting with shared store
// Tier 1: IP-based backstop (runs first, catches abuse before auth)
// Tier 2: User-based (runs after auth, for granular per-user limits)

// Helper to create rate limiters with optional Redis store
// Store is added dynamically after initialization
function createRateLimiter(options: Parameters<typeof rateLimit>[0]) {
  return rateLimit({
    ...options,
    // Store is undefined initially (uses MemoryStore), then Redis once connected
    // This is safe because express-rate-limit handles undefined gracefully
    store: rateLimitStore,
  });
}

// IP-based backstop limiter - prevents auth spam and general abuse
const ipBackstopLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute per IP (generous, but stops floods)
  message: { error: 'Too many requests from this IP' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipHealthCheck,
});

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per window for login/register
  message: { error: 'Too many attempts, please try again in 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipHealthCheck,
});

// Per-user trade limiter - requires auth to run first
const userTradeLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 trades per minute per user
  message: { error: 'Too many trade requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipHealthCheck,
  keyGenerator: (req: any) => {
    // This runs AFTER auth, so userId should be set
    if (req.userId) return `user:${req.userId}`;
    // Fallback: use a generic key (IP handled by default if no keyGenerator)
    return 'anon';
  },
});

const searchLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute  
  max: 20, // 20 searches per minute (protect external APIs)
  message: { error: 'Too many search requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipHealthCheck,
});

// ✅ FIX Issue #27: Rate limiter for public endpoints (trending, quotes, leaderboard)
const publicApiLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute per IP (generous for browsing)
  message: { error: 'Too many requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipHealthCheck,
});

// Bot endpoints - keyed by bot secret header
const botLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // 200 requests per minute for bot
  message: { error: 'Too many bot requests' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => `bot:${req.headers['x-bot-secret'] || 'unknown'}`,
});

// Require JWT_SECRET or SESSION_SECRET environment variable
const JWT_SECRET: string = (() => {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('FATAL: JWT_SECRET or SESSION_SECRET environment variable must be set');
  }
  return secret;
})();

// ✅ PRECISION FIX: Parse native token amount to base units
// This avoids issues like 0.1 * 1e9 = 99999999.99999999
// Now chain-aware - supports both SOL (9 decimals) and ETH (18 decimals)
function parseNativeAmount(chain: Chain, amount: string | number): bigint {
  return parseToBaseUnits(chain, amount);
}

// Backward compatibility - defaults to Solana
function parseSolToLamports(solAmount: string | number): bigint {
  return parseToBaseUnits('solana', solAmount);
}

// Input validation for trade amounts
const MIN_TRADE_LAMPORTS = 1_000_000n; // 0.001 SOL minimum
const MAX_TRADE_LAMPORTS = 100_000_000_000n; // 100 SOL maximum

function validateTradeAmount(lamports: bigint): void {
  if (lamports <= 0n) {
    throw new Error('Trade amount must be positive');
  }
  if (lamports < MIN_TRADE_LAMPORTS) {
    throw new Error('Trade amount too small (minimum 0.001 SOL)');
  }
  if (lamports > MAX_TRADE_LAMPORTS) {
    throw new Error('Trade amount too large (maximum 100 SOL)');
  }
}

// Validate Solana address format
function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

// ✅ PRECISION FIX: Parse decimal price string to lamports without float math
// Handles strings like "0.000000123" from DexScreener API
// Returns integer lamports (minimum 1 for valid prices)
function parseDecimalToLamports(decimalString: string): number {
  if (!decimalString || decimalString === '0') return 0;

  // Remove any whitespace
  const str = decimalString.trim();

  // Validate format
  if (!/^\d*\.?\d+$/.test(str)) {
    console.warn(`Invalid price format: ${str}`);
    return 0;
  }

  // Split on decimal point
  const parts = str.split('.');
  const wholePart = parts[0] || '0';
  let fracPart = parts[1] || '';

  // Lamports = 9 decimal places
  // Pad or truncate fractional part to exactly 9 digits
  if (fracPart.length > 9) {
    fracPart = fracPart.slice(0, 9);
  } else {
    fracPart = fracPart.padEnd(9, '0');
  }

  // Remove leading zeros from whole part (but keep at least one digit)
  const cleanWhole = wholePart.replace(/^0+/, '') || '0';

  // Combine and parse
  const lamportsStr = cleanWhole + fracPart;
  const lamports = parseInt(lamportsStr, 10);

  // Return at least 1 for any valid non-zero price (sub-lamport tokens)
  if (isNaN(lamports)) return 0;
  if (lamports > 0) return lamports;
  // If we parsed 0 but input wasn't "0", return 1 (sub-lamport price)
  return str !== '0' && parseFloat(str) > 0 ? 1 : 0;
}

// ============================================================================
// EXTERNAL API PROTECTION: Timeouts + Circuit Breaker
// ============================================================================

// Circuit breaker state for each API
interface CircuitState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
  successCount: number;
}

const circuitBreakers = new Map<string, CircuitState>();

// Circuit breaker config
const CIRCUIT_CONFIG = {
  failureThreshold: 5,      // Open circuit after 5 failures
  resetTimeMs: 30_000,      // Try again after 30 seconds
  successThreshold: 2,      // Close circuit after 2 successes
};

function getCircuitState(apiName: string): CircuitState {
  let state = circuitBreakers.get(apiName);
  if (!state) {
    state = { failures: 0, lastFailure: 0, isOpen: false, successCount: 0 };
    circuitBreakers.set(apiName, state);
  }
  return state;
}

function recordSuccess(apiName: string): void {
  const state = getCircuitState(apiName);
  state.successCount++;
  if (state.isOpen && state.successCount >= CIRCUIT_CONFIG.successThreshold) {
    console.log(`✅ Circuit CLOSED for ${apiName} after ${state.successCount} successes`);
    state.isOpen = false;
    state.failures = 0;
    state.successCount = 0;
  }
}

function recordFailure(apiName: string): void {
  const state = getCircuitState(apiName);
  state.failures++;
  state.lastFailure = Date.now();
  state.successCount = 0;

  if (state.failures >= CIRCUIT_CONFIG.failureThreshold && !state.isOpen) {
    state.isOpen = true;
    console.warn(`⚠️ Circuit OPEN for ${apiName} after ${state.failures} failures`);
  }
}

function isCircuitOpen(apiName: string): boolean {
  const state = getCircuitState(apiName);

  if (!state.isOpen) return false;

  // Check if reset time has passed
  if (Date.now() - state.lastFailure > CIRCUIT_CONFIG.resetTimeMs) {
    console.log(`🔄 Circuit HALF-OPEN for ${apiName} - allowing test request`);
    return false; // Allow a test request
  }

  return true;
}

// Default timeouts for different API types
const API_TIMEOUTS = {
  dexscreener: 5000,    // 5s - primary price source
  birdeye: 3000,        // 3s - metadata fallback
  jupiter: 8000,        // 8s - quote API (can be slow)
  coingecko: 5000,      // 5s - OHLCV data
  helius: 5000,         // 5s - RPC calls
};

// Enhanced fetch with timeout and circuit breaker
async function fetchWithTimeout(
  url: string, 
  timeoutMs: number = 5000,
  options: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { 
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response;
  } catch (error: any) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

// Fetch with circuit breaker protection
async function fetchWithCircuitBreaker(
  apiName: string,
  url: string,
  timeoutMs: number,
  options: RequestInit = {}
): Promise<Response | null> {
  // Check circuit breaker
  if (isCircuitOpen(apiName)) {
    console.log(`⏸️ ${apiName} circuit is OPEN - skipping request`);
    return null;
  }

  try {
    const response = await fetchWithTimeout(url, timeoutMs, options);

    if (response.ok) {
      recordSuccess(apiName);
    } else if (response.status >= 500 || response.status === 429) {
      // Server error or rate limited
      recordFailure(apiName);
    }

    return response;
  } catch (error: any) {
    recordFailure(apiName);
    console.warn(`❌ ${apiName} request failed: ${error.message}`);
    return null;
  }
}

// Convenience functions for each API
async function fetchDexScreener(endpoint: string): Promise<Response | null> {
  return fetchWithCircuitBreaker(
    'dexscreener',
    `https://api.dexscreener.com${endpoint}`,
    API_TIMEOUTS.dexscreener
  );
}

async function fetchJupiter(endpoint: string): Promise<Response | null> {
  return fetchWithCircuitBreaker(
    'jupiter',
    `https://quote-api.jup.ag${endpoint}`,
    API_TIMEOUTS.jupiter
  );
}

async function fetchBirdeye(endpoint: string): Promise<Response | null> {
  return fetchWithCircuitBreaker(
    'birdeye',
    `https://public-api.birdeye.so${endpoint}`,
    API_TIMEOUTS.birdeye,
    {
      headers: {
        'accept': 'application/json',
        'x-chain': 'solana',
      },
    }
  );
}

async function fetchCoinGecko(endpoint: string): Promise<Response | null> {
  return fetchWithCircuitBreaker(
    'coingecko',
    `https://api.coingecko.com${endpoint}`,
    API_TIMEOUTS.coingecko
  );
}

// ============================================================================
// IDEMPOTENCY: Prevent duplicate trades on retry
// ============================================================================

interface IdempotencyEntry {
  response: any;
  statusCode: number;
  timestamp: number;
}

// Cache for idempotency keys: Map<"userId:key", IdempotencyEntry>
const idempotencyCache = new Map<string, IdempotencyEntry>();

// Idempotency config
const IDEMPOTENCY_CONFIG = {
  ttlMs: 5 * 60 * 1000,       // 5 minutes - keys expire after this
  cleanupIntervalMs: 60_000,   // Clean expired entries every minute
  maxEntries: 10_000,          // Prevent memory bloat
};

// ✅ FIX: Store interval reference and unref() so it doesn't block shutdown
const idempotencyCleanupInterval = setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, entry] of idempotencyCache.entries()) {
    if (now - entry.timestamp > IDEMPOTENCY_CONFIG.ttlMs) {
      idempotencyCache.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`🧹 Idempotency cache cleanup: removed ${cleaned} expired entries`);
  }
}, IDEMPOTENCY_CONFIG.cleanupIntervalMs);

// Don't prevent process exit on shutdown
idempotencyCleanupInterval.unref();

// Get cached response for idempotency key
function getIdempotentResponse(userId: number | string, idempotencyKey: string): IdempotencyEntry | null {
  if (!idempotencyKey) return null;

  const cacheKey = `${userId}:${idempotencyKey}`;
  const entry = idempotencyCache.get(cacheKey);

  if (!entry) return null;

  // Check if expired
  if (Date.now() - entry.timestamp > IDEMPOTENCY_CONFIG.ttlMs) {
    idempotencyCache.delete(cacheKey);
    return null;
  }

  console.log(`♻️ Idempotency hit: returning cached response for key ${idempotencyKey.slice(0, 8)}...`);
  return entry;
}

// Store response for idempotency key
function setIdempotentResponse(
  userId: number | string, 
  idempotencyKey: string, 
  response: any, 
  statusCode: number
): void {
  if (!idempotencyKey) return;

  // Prevent memory bloat
  if (idempotencyCache.size >= IDEMPOTENCY_CONFIG.maxEntries) {
    // Remove oldest entries (first 10%)
    const toRemove = Math.floor(IDEMPOTENCY_CONFIG.maxEntries * 0.1);
    const keys = Array.from(idempotencyCache.keys()).slice(0, toRemove);
    keys.forEach(k => idempotencyCache.delete(k));
    console.log(`🧹 Idempotency cache full: evicted ${toRemove} oldest entries`);
  }

  const cacheKey = `${userId}:${idempotencyKey}`;
  idempotencyCache.set(cacheKey, {
    response,
    statusCode,
    timestamp: Date.now(),
  });
}

// Helper to extract and validate idempotency key from request
// ✅ FIX: Validate key format and length to prevent abuse
function getIdempotencyKey(req: any): string | null {
  const key = req.headers['x-idempotency-key'] || req.headers['idempotency-key'];

  if (!key) return null;

  // Validate length (max 256 chars)
  if (key.length > 256) {
    console.warn('⚠️ Idempotency key too long, ignoring');
    return null;
  }

  // Validate format (alphanumeric, dashes, underscores only)
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
    console.warn('⚠️ Invalid idempotency key format, ignoring');
    return null;
  }

  return key;
}

// Helper to serialize BigInt values for JSON responses
function serializeBigInts(obj: any): any {
  if (typeof obj === 'bigint') return obj.toString();
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(serializeBigInts);
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, serializeBigInts(v)])
  );
}

// ✅ MEDIUM FIX: Use centralized SOL price module
// Alias for backward compatibility
// Alias for backward compatibility
const fetchSolPrice = () => getNativePrice('solana');

// Helper to find the best (highest liquidity) Solana pair from DexScreener pairs array
// This ensures we get the most accurate price from the most liquid market
function findBestSolanaPair(pairs: any[], tokenAddress: string): any | null {
  if (!pairs || pairs.length === 0) return null;

  // Filter for Solana pairs matching this token
  const solanaPairs = pairs.filter((pair: any) => 
    pair.chainId === 'solana' && 
    pair.baseToken?.address === tokenAddress &&
    pair.priceNative
  );

  if (solanaPairs.length === 0) return null;

  // Sort by liquidity (USD) descending - highest liquidity = most accurate price
  solanaPairs.sort((a: any, b: any) => {
    const liquidityA = parseFloat(a.liquidity?.usd || '0');
    const liquidityB = parseFloat(b.liquidity?.usd || '0');
    return liquidityB - liquidityA;
  });

  return solanaPairs[0]; // Return highest liquidity pair
}

// ✅ FIX: Request coalescing for DexScreener
// Prevents multiple concurrent requests for the same token
interface PriceCache {
  priceLamports: number;
  decimals: number;
  liquidityUsd: number;
  volume24hUsd: number;
  fetchedAt: number;
}

const dexScreenerCache = new Map<string, PriceCache>();
const pendingRequests = new Map<string, Promise<PriceCache | null>>();
const PRICE_CACHE_TTL_MS = 5000; // 5 second TTL - balance between freshness and rate limiting

// Minimum liquidity for leaderboard-eligible trades (prevents manipulation)
const MIN_LIQUIDITY_USD = 1000; // $1000 minimum liquidity
const MIN_VOLUME_24H_USD = 500; // $500 minimum 24h volume

async function fetchDexScreenerPriceInternal(tokenAddress: string): Promise<PriceCache | null> {
  try {
    const dexResponse = await fetchWithTimeout(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, 3000);
    if (dexResponse.ok) {
      const dexData = await dexResponse.json();
      const solanaPair = findBestSolanaPair(dexData.pairs, tokenAddress);

      if (solanaPair && solanaPair.priceNative) {
        // ✅ PRECISION FIX: Parse without float math
        const priceLamports = Math.max(1, parseDecimalToLamports(solanaPair.priceNative));
        const decimals = solanaPair.baseToken?.decimals || 6;
        const liquidityUsd = parseFloat(solanaPair.liquidity?.usd || '0');
        const volume24hUsd = parseFloat(solanaPair.volume?.h24 || '0');

        return {
          priceLamports,
          decimals,
          liquidityUsd,
          volume24hUsd,
          fetchedAt: Date.now(),
        };
      }
    }
    return null;
  } catch (error) {
    console.error(`DexScreener fetch error for ${tokenAddress}:`, error);
    return null;
  }
}

// ✅ FIX: Coalesced price fetch - one request per token per TTL
async function fetchDexScreenerPrice(tokenAddress: string): Promise<{ 
  priceLamports: number; 
  decimals?: number;
  liquidityUsd?: number;
  volume24hUsd?: number;
  isCached?: boolean;
} | null> {
  // Check cache first
  const cached = dexScreenerCache.get(tokenAddress);
  if (cached && (Date.now() - cached.fetchedAt) < PRICE_CACHE_TTL_MS) {
    return { ...cached, isCached: true };
  }

  // Check if there's already a pending request for this token
  const pending = pendingRequests.get(tokenAddress);
  if (pending) {
    // Wait for the pending request instead of making a new one
    const result = await pending;
    return result ? { ...result, isCached: false } : null;
  }

  // Create new request and store promise
  const requestPromise = fetchDexScreenerPriceInternal(tokenAddress);
  pendingRequests.set(tokenAddress, requestPromise);

  try {
    const result = await requestPromise;

    if (result) {
      // Update cache
      dexScreenerCache.set(tokenAddress, result);
    }

    return result ? { ...result, isCached: false } : null;
  } finally {
    // Clean up pending request
    pendingRequests.delete(tokenAddress);
  }
}

// Helper to check if token meets minimum liquidity requirements
function meetsLiquidityRequirements(liquidityUsd: number, volume24hUsd: number): boolean {
  return liquidityUsd >= MIN_LIQUIDITY_USD && volume24hUsd >= MIN_VOLUME_24H_USD;
}

// Legacy function signature for backward compatibility
async function fetchDexScreenerPriceLegacy(tokenAddress: string): Promise<{ priceLamports: number; decimals?: number } | null> {
  const result = await fetchDexScreenerPrice(tokenAddress);
  if (!result) return null;
  return { priceLamports: result.priceLamports, decimals: result.decimals };
}

// Helper to fetch token metadata from multiple APIs with fallbacks
async function fetchTokenMetadata(tokenAddress: string): Promise<{ icon?: string; name?: string; symbol?: string } | null> {
  let dexMetadata: { icon?: string; name?: string; symbol?: string } | null = null;

  // Try DexScreener first (free, no API key needed)
  try {
    const dexResponse = await fetchWithTimeout(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, 3000);
    if (dexResponse.ok) {
      const dexData = await dexResponse.json();
      const solanaPair = findBestSolanaPair(dexData.pairs, tokenAddress);

      if (solanaPair) {
        dexMetadata = {
          icon: solanaPair.info?.imageUrl,
          name: solanaPair.baseToken?.name,
          symbol: solanaPair.baseToken?.symbol,
        };

        // If DexScreener has icon, return immediately
        if (dexMetadata.icon) {
          console.log(`✅ DexScreener metadata for ${tokenAddress}: icon=Yes`);
          return dexMetadata;
        }

        console.log(`⚠️ DexScreener has metadata for ${tokenAddress} but NO icon, trying Birdeye...`);
      }
    }
  } catch (error) {
    console.log(`⚠️ DexScreener metadata fetch failed for ${tokenAddress}`);
  }

  // Try Birdeye API v3 (free tier available, no API key required for basic calls)
  try {
    console.log(`🔍 Trying Birdeye v3 for ${tokenAddress.slice(0, 8)}...`);
    // ✅ FIX: Use circuit breaker protected fetch
    const birdeyeResponse = await fetchBirdeye(`/defi/v3/token/meta-data/single?address=${tokenAddress}`);

    if (birdeyeResponse?.ok) {
      const birdeyeData = await birdeyeResponse.json();
      console.log(`📊 Birdeye v3 response for ${tokenAddress.slice(0, 8)}: success=${birdeyeData.success}`);

      if (birdeyeData.success && birdeyeData.data) {
        const birdeyeIcon = birdeyeData.data.logoURI || birdeyeData.data.icon;
        console.log(`✅ Birdeye v3 metadata for ${tokenAddress.slice(0, 8)}: icon=${birdeyeIcon ? 'Yes' : 'No'}`);

        return {
          icon: birdeyeIcon || dexMetadata?.icon,
          name: birdeyeData.data.name || dexMetadata?.name,
          symbol: birdeyeData.data.symbol || dexMetadata?.symbol,
        };
      }
    }
  } catch (error: any) {
    console.log(`⚠️ Birdeye v3 metadata fetch failed for ${tokenAddress.slice(0, 8)}: ${error.message}`);
  }

  // Fallback to older Birdeye token_overview endpoint
  try {
    console.log(`🔍 Trying Birdeye token_overview for ${tokenAddress.slice(0, 8)}...`);
    // ✅ FIX: Use circuit breaker protected fetch
    const birdeyeResponse = await fetchBirdeye(`/defi/token_overview?address=${tokenAddress}`);

    if (birdeyeResponse?.ok) {
      const birdeyeData = await birdeyeResponse.json();
      console.log(`📊 Birdeye token_overview response for ${tokenAddress.slice(0, 8)}: has data=${!!birdeyeData.data}`);

      if (birdeyeData.data) {
        const birdeyeIcon = birdeyeData.data.logoURI || birdeyeData.data.icon;
        console.log(`✅ Birdeye token_overview metadata for ${tokenAddress.slice(0, 8)}: icon=${birdeyeIcon ? 'Yes' : 'No'}`);

        return {
          icon: birdeyeIcon || dexMetadata?.icon,
          name: birdeyeData.data.name || dexMetadata?.name,
          symbol: birdeyeData.data.symbol || dexMetadata?.symbol,
        };
      }
    }
  } catch (error: any) {
    console.log(`⚠️ Birdeye token_overview fetch failed for ${tokenAddress.slice(0, 8)}: ${error.message}`);
  }

  // Return DexScreener metadata if we got it (even without icon)
  if (dexMetadata) {
    console.log(`📌 Returning DexScreener metadata for ${tokenAddress.slice(0, 8)} (no Birdeye data available)`);
    return dexMetadata;
  }

  console.log(`❌ No metadata found for ${tokenAddress.slice(0, 8)} from any source`);
  return null;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // ============================================================================
  // Health Check Endpoint (for load balancers and monitoring)
  // ============================================================================

  app.get('/api/health', async (req, res) => {
    try {
      // Check database connectivity
      await db.execute(sql`SELECT 1`);

      // ✅ Minimal response - don't leak environment details
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('Health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // ============================================================================
  // Auth Routes
  // ============================================================================

  app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
      const data = insertUserSchema.parse(req.body);

      // Check if user already exists
      const existingEmail = await storage.getUserByEmail(data.email);
      if (existingEmail) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      const existingUsername = await storage.getUserByUsername(data.username);
      if (existingUsername) {
        return res.status(400).json({ error: 'Username already taken' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(data.password, 10);

      // Create user
      const user = await storage.createUser({
        ...data,
        password: hashedPassword,
      });

      // Generate token
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

      // Set HttpOnly cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      console.log('✅ User registered, cookie set for:', user.username);

      // Return user without password
      const { password, ...userWithoutPassword } = user;
      res.status(201).json(serializeBigInts({ user: userWithoutPassword }));
    } catch (error: any) {
      console.error('Registration error:', error);
      res.status(400).json({ error: error.message || 'Registration failed' });
    }
  });

  app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
      const { email, username } = req.body;
      console.log('🔐 Login attempt:', { email, username });

      // Validate request body with Zod - accept either email OR username
      const loginSchema = z.object({
        email: z.string().optional(),
        username: z.string().optional(),
        password: z.string().min(1, 'Password is required'),
      }).refine(
        data => data.email || data.username,
        { message: 'Either email or username is required' }
      );

      const validationResult = loginSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: validationResult.error.errors[0]?.message || 'Invalid login data' 
        });
      }

      const { password } = validationResult.data;

      // Try to find user by email or username
      let user;
      if (email) {
        user = await storage.getUserByEmail(email);
      } else if (username) {
        user = await storage.getUserByUsername(username);
      }

      if (!user) {
        return res.status(400).json({ error: 'Invalid credentials' });
      }

      const validPassword = await bcrypt.compare(password, user.password);

      if (!validPassword) {
        return res.status(400).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

      // Set HttpOnly cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      console.log('✅ User logged in, cookie set for:', user.username);

      const { password: _, ...userWithoutPassword } = user;
      res.json(serializeBigInts({ user: userWithoutPassword }));
    } catch (error: any) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax'
    });
    console.log('✅ User logged out, cookie cleared');
    res.json({ message: 'Logged out successfully' });
  });

  // Get current native token price for a chain (cached, refreshes every 30 seconds)
  // Supports: solana, base
  app.get('/api/price/:chain', async (req, res) => {
    try {
      const chainParam = req.params.chain;
      if (!isValidChain(chainParam)) {
        return res.status(400).json({ error: `Invalid chain. Must be one of: solana, base` });
      }
      const chain = chainParam as Chain;
      const symbol = CHAIN_CONFIG[chain].nativeSymbol;
      
      const price = await getNativePrice(chain);

      if (price === null) {
        return res.status(503).json({ 
          error: `${symbol} price temporarily unavailable`,
          available: false,
          retryAfter: 30,
        });
      }

      res.json({ 
        price, 
        chain,
        symbol,
        available: true,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('Native price fetch error:', error);
      res.status(503).json({ 
        error: 'Could not fetch price',
        available: false,
        retryAfter: 30,
      });
    }
  });

  // Legacy endpoint - Get current SOL price (backward compatible)
  app.get('/api/solana/price', async (req, res) => {
    try {
      const price = await getNativePrice('solana');

      if (price === null) {
        return res.status(503).json({ 
          error: 'SOL price temporarily unavailable',
          available: false,
          retryAfter: 30,
        });
      }

      res.json({ 
        price, 
        available: true,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('SOL price fetch error:', error);
      res.status(503).json({ 
        error: 'Could not fetch SOL price',
        available: false,
        retryAfter: 30,
      });
    }
  });

  app.get('/api/auth/profile', authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUserById(req.userId!);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const { password, ...userWithoutPassword } = user;
      res.json(serializeBigInts(userWithoutPassword));
    } catch (error: any) {
      console.error('Profile error:', error);
      res.status(500).json({ error: 'Could not fetch profile' });
    }
  });

  app.put('/api/auth/profile', authenticateToken, async (req, res) => {
    try {
      const { username, walletAddress, password } = req.body;
      const updates: any = {};

      if (username) {
        if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) {
          return res.status(400).json({ error: 'Invalid username format' });
        }
        const existing = await storage.getUserByUsername(username);
        if (existing && existing.id !== req.userId) {
          return res.status(400).json({ error: 'Username already taken' });
        }
        updates.username = username;
      }

      if (walletAddress) {
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
          return res.status(400).json({ error: 'Invalid Solana wallet address' });
        }
        updates.walletAddress = walletAddress;
      }

      if (password) {
        if (password.length < 6) {
          return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        updates.password = await bcrypt.hash(password, 10);
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      await storage.updateUserProfile(req.userId!, updates);
      res.json({ message: 'Profile updated successfully' });
    } catch (error: any) {
      console.error('Update profile error:', error);
      res.status(500).json({ error: 'Could not update profile' });
    }
  });

  // ============================================================================
  // Multi-Chain Balance & Wallet Routes
  // ============================================================================

  /**
   * GET /api/user/balances
   * Get all per-chain balances for the authenticated user
   */
  app.get('/api/user/balances', authenticateToken, async (req, res) => {
    try {
      const balances = await storage.getAllUserBalances(req.userId!);
      
      // Format for frontend consumption
      const formatted = balances.map(b => ({
        chain: b.chain,
        balance: b.balance.toString(),
        totalProfit: b.totalProfit.toString(),
        updatedAt: b.updatedAt,
      }));

      res.json({ balances: formatted });
    } catch (error: any) {
      console.error('Get balances error:', error);
      res.status(500).json({ error: 'Could not fetch balances' });
    }
  });

  /**
   * GET /api/user/balance/:chain
   * Get balance for a specific chain
   */
  app.get('/api/user/balance/:chain', authenticateToken, async (req, res) => {
    try {
      const chainParam = req.params.chain;
      if (!isValidChain(chainParam)) {
        return res.status(400).json({ error: `Invalid chain. Must be one of: solana, base` });
      }
      const chain = chainParam as Chain;

      const balance = await storage.getUserBalance(req.userId!, chain);
      
      res.json({
        chain,
        balance: balance.toString(),
        symbol: CHAIN_CONFIG[chain].nativeSymbol,
      });
    } catch (error: any) {
      console.error('Get balance error:', error);
      res.status(500).json({ error: 'Could not fetch balance' });
    }
  });

  /**
   * GET /api/user/wallets
   * Get all wallet addresses for the authenticated user
   */
  app.get('/api/user/wallets', authenticateToken, async (req, res) => {
    try {
      const wallets = await storage.getAllUserWallets(req.userId!);
      
      const formatted = wallets.map(w => ({
        chain: w.chain,
        address: w.address,
        isPrimary: w.isPrimary === 1,
        explorerUrl: getAddressExplorerUrl(w.chain as Chain, w.address),
      }));

      res.json({ wallets: formatted });
    } catch (error: any) {
      console.error('Get wallets error:', error);
      res.status(500).json({ error: 'Could not fetch wallets' });
    }
  });

  /**
   * POST /api/user/wallet
   * Set wallet address for a specific chain
   */
  app.post('/api/user/wallet', authenticateToken, async (req, res) => {
    try {
      const { chain: chainParam, address } = req.body;

      if (!isValidChain(chainParam)) {
        return res.status(400).json({ error: `Invalid chain. Must be one of: solana, base` });
      }
      const chain = chainParam as Chain;

      if (!address) {
        return res.status(400).json({ error: 'Wallet address required' });
      }

      // Validate address format for the chain
      if (chain === 'solana' && !isValidSolanaAddress(address)) {
        return res.status(400).json({ error: 'Invalid Solana wallet address' });
      }
      if (chain === 'base' && !isValidEvmAddress(address)) {
        return res.status(400).json({ error: 'Invalid Base wallet address (must be 0x...)' });
      }

      const wallet = await storage.setUserWallet(req.userId!, chain, address);

      res.json({
        message: `${CHAIN_CONFIG[chain].name} wallet updated successfully`,
        wallet: {
          chain: wallet.chain,
          address: wallet.address,
          explorerUrl: getAddressExplorerUrl(chain, wallet.address),
        },
      });
    } catch (error: any) {
      console.error('Set wallet error:', error);
      res.status(500).json({ error: 'Could not update wallet' });
    }
  });

  // ============================================================================
  // Telegram Auth Routes (Bot-Only - Protected by shared secret)
  // ============================================================================

  // Middleware to verify telegram bot requests
  // ============================================================================
  // ✅ GOD MODE: BOT SECRET CONFIGURATION
  // ============================================================================
  // SECURITY: Never use Telegram token for internal API auth
  // Telegram tokens leak easily (logs, screenshots, env dumps)
  //
  // In PRODUCTION: BOT_API_SECRET env var is MANDATORY (min 20 chars)
  // In DEVELOPMENT: Falls back to hardcoded value matching bot.js
  // ============================================================================

  const DEV_BOT_SECRET = (() => {
    // Production: Require strong secret
    if (process.env.NODE_ENV === 'production') {
      if (!process.env.BOT_API_SECRET) {
        console.error('❌ FATAL: BOT_API_SECRET must be set in production');
        throw new Error('BOT_API_SECRET required in production');
      }
      if (process.env.BOT_API_SECRET.length < 20) {
        console.error('❌ FATAL: BOT_API_SECRET must be at least 20 characters');
        throw new Error('BOT_API_SECRET too short');
      }
      return process.env.BOT_API_SECRET;
    }

    // Development: Use env var if set, otherwise fall back to dev default
    // This MUST match the value in bot.js for local development to work
    const devFallback = 'simfi-dev-bot-secret-change-in-production';

    if (process.env.BOT_API_SECRET) {
      return process.env.BOT_API_SECRET;
    }

    console.warn('⚠️  BOT_API_SECRET not set. Using dev default (matches bot.js).');
    return devFallback;
  })();

  const verifyBotSecret = (req: any, res: any, next: any) => {
    const botSecret = req.headers['x-bot-secret'];

    if (process.env.NODE_ENV === 'production') {
      // Production: BOT_API_SECRET is required with minimum length
      if (!process.env.BOT_API_SECRET || process.env.BOT_API_SECRET.length < 20) {
        console.error('❌ FATAL: BOT_API_SECRET must be set in production (min 20 chars)');
        return res.status(500).json({ error: 'Server misconfiguration - bot endpoints disabled' });
      }
    }

    if (!botSecret || botSecret !== DEV_BOT_SECRET) {
      return res.status(403).json({ error: 'Forbidden - Invalid bot secret' });
    }

    next();
  };

  // Telegram registration endpoint
  app.post('/api/telegram/auth/register', botLimiter, verifyBotSecret, async (req, res) => {
    try {
      const { email, username, password, walletAddress } = req.body;

      // Validate inputs
      if (!email || !username || !password) {
        return res.status(400).json({ error: 'Email, username, and password are required' });
      }

      // Use same registration validation as web app
      const validationSchema = insertUserSchema.extend({
        email: z.string().email('Invalid email'),
        username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_-]+$/, 'Invalid username format'),
        password: z.string().min(6, 'Password must be at least 6 characters'),
        walletAddress: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Invalid Solana wallet'),
      });

      const validationResult = validationSchema.safeParse({
        email,
        username,
        password,
        walletAddress: walletAddress || 'So11111111111111111111111111111111111111112',
      });

      if (!validationResult.success) {
        return res.status(400).json({ error: validationResult.error.errors[0]?.message || 'Validation failed' });
      }

      // Check if email or username already exists
      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername) {
        return res.status(400).json({ error: 'Username already taken' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = await storage.createUser({
        email,
        username,
        password: hashedPassword,
        walletAddress: walletAddress || 'So11111111111111111111111111111111111111112',
      });

      // Generate token
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

      console.log('✅ Telegram bot user registered:', user.username);

      const { password: _, ...userWithoutPassword } = user;
      res.status(201).json(serializeBigInts({ 
        user: userWithoutPassword,
        token 
      }));
    } catch (error: any) {
      console.error('Telegram registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  // Telegram login endpoint - supports both email AND username
  app.post('/api/telegram/auth/login', botLimiter, verifyBotSecret, async (req, res) => {
    try {
      const { email, username, password } = req.body;
      const identifier = email || username; // Support both email and username

      console.log(`🔐 Telegram login attempt for: ${identifier}`);

      if (!identifier || !password) {
        console.warn('Missing email/username or password in login request');
        return res.status(400).json({ error: 'Email or username and password are required' });
      }

      // Try to find user by email first, then by username
      let user = await storage.getUserByEmail(identifier);

      if (!user && !identifier.includes('@')) {
        // If it doesn't look like an email and we didn't find it by email, try username
        console.log(`🔍 Email lookup failed, trying username: ${identifier}`);
        user = await storage.getUserByUsername(identifier);
      }

      if (!user) {
        console.warn(`❌ No user found with email or username: ${identifier}`);
        return res.status(400).json({ error: 'Invalid credentials - user not found' });
      }

      console.log(`✅ User found: ${user.username}, checking password...`);

      // Check password
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        console.warn(`❌ Invalid password for user: ${user.username}`);
        return res.status(400).json({ error: 'Invalid credentials - wrong password' });
      }

      console.log(`✅ Password valid for user: ${user.username}`);

      // Generate token
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

      console.log('✅ Telegram bot user logged in:', user.username);

      const { password: _, ...userWithoutPassword } = user;
      res.json(serializeBigInts({ 
        user: userWithoutPassword,
        token 
      }));
    } catch (error: any) {
      console.error('❌ Telegram login error:', error.message || error);
      res.status(500).json({ error: 'Login failed - server error' });
    }
  });

  // ============================================================================
  // Telegram Session Routes (Bot-Only - Protected by shared secret)
  // ============================================================================

  app.post('/api/telegram/session', botLimiter, verifyBotSecret, async (req, res) => {
    try {
      const { telegramUserId, userId, token, balance } = req.body;

      if (!telegramUserId || !userId || !token || balance === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const session = await storage.saveTelegramSession(
        telegramUserId,
        userId,
        token,
        BigInt(balance)
      );

      res.json(serializeBigInts({ session }));
    } catch (error: any) {
      console.error('Save telegram session error:', error);
      res.status(500).json({ error: 'Could not save session' });
    }
  });

  app.get('/api/telegram/session/:telegramUserId', botLimiter, verifyBotSecret, async (req, res) => {
    try {
      const { telegramUserId } = req.params;
      const session = await storage.getTelegramSession(telegramUserId);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      res.json(serializeBigInts({ session }));
    } catch (error: any) {
      console.error('Get telegram session error:', error);
      res.status(500).json({ error: 'Could not fetch session' });
    }
  });

  app.delete('/api/telegram/session/:telegramUserId', botLimiter, verifyBotSecret, async (req, res) => {
    try {
      const { telegramUserId } = req.params;
      await storage.deleteTelegramSession(telegramUserId);
      res.json({ message: 'Session deleted successfully' });
    } catch (error: any) {
      console.error('Delete telegram session error:', error);
      res.status(500).json({ error: 'Could not delete session' });
    }
  });

  // ============================================================================
  // Trading Routes
  // ============================================================================

  app.get('/api/trades/positions', authenticateToken, async (req, res) => {
    try {
      // Get optional chain filter from query params
      const chainParam = req.query.chain as string | undefined;
      const chain: Chain | undefined = chainParam && isValidChain(chainParam) ? chainParam as Chain : undefined;
      
      const positions = await storage.getUserPositions(req.userId!, chain);

      // Group positions by chain for fetching prices
      const positionsByChain = new Map<Chain, typeof positions>();
      for (const p of positions) {
        const pChain = p.chain || 'solana';
        if (!positionsByChain.has(pChain)) {
          positionsByChain.set(pChain, []);
        }
        positionsByChain.get(pChain)!.push(p);
      }

      // Fetch current prices for all unique tokens (grouped by chain)
      const priceMap = new Map<string, bigint>();
      
      for (const [posChain, chainPositions] of positionsByChain) {
        const uniqueTokenAddresses = chainPositions.map(p => p.tokenAddress);
        const uniqueTokens = Array.from(new Set(uniqueTokenAddresses));

        if (uniqueTokens.length > 0) {
          try {
            // Use marketDataService for chain-aware price fetching
            const tokenDataMap = await marketDataService.getTokensBatch(uniqueTokens, posChain);
            
            for (const [addr, data] of tokenDataMap) {
              if (data) {
                priceMap.set(`${posChain}:${addr}`, data.priceNative);
              }
            }
            
            console.log(`📊 Fetched ${tokenDataMap.size} token prices from ${posChain}`);
          } catch (error) {
            console.warn(`⚠️  Failed to fetch prices for ${posChain}:`, error);
          }
        }
      }

      // Enrich positions with current prices and recalculate current value
      // CRITICAL: Use fresh prices from market data, never fall back to entryPrice
      const enrichedPositions = positions.map(p => {
        const posChain = p.chain || 'solana';
        const freshPrice = priceMap.get(`${posChain}:${p.tokenAddress}`);
        const priceToUse = freshPrice || p.entryPrice; // Use entry price as fallback only

        // ✅ Recalculate current value based on FRESH price, not stale DB value
        const decimals = p.decimals || 6;
        const divisor = BigInt(10 ** decimals);
        const amountBigInt = BigInt(p.amount);
        const priceBigInt = BigInt(priceToUse);
        const recalculatedValue = (amountBigInt * priceBigInt) / divisor;

        return {
          ...p,
          currentPrice: priceToUse, // Fresh price (or entry as last resort)
          currentValue: recalculatedValue, // ✅ Recalculated with fresh price
        };
      });

      // Debug logging for price freshness
      console.log(`📊 Position enrichment - ${enrichedPositions.length} positions updated with fresh prices`);
      enrichedPositions.forEach(p => {
        const hasFreshPrice = priceMap.has(p.tokenAddress);
        const priceSOL = Number(p.currentPrice) / 1_000_000_000;
        console.log(`   ${p.tokenSymbol}: fresh=${hasFreshPrice}, price=$${priceSOL.toFixed(9)}`);
      });

      res.json(serializeBigInts({ positions: enrichedPositions }));
    } catch (error: any) {
      console.error('Get positions error:', error);
      res.status(500).json({ error: 'Could not fetch positions' });
    }
  });

  // ✅ FIX: Correct middleware order - IP backstop, then auth, then per-user limiter
  app.post('/api/trades/buy', ipBackstopLimiter, authenticateToken, userTradeLimiter, async (req, res) => {
    try {
      // ✅ IDEMPOTENCY CHECK: Return cached response if this is a retry
      const idempotencyKey = getIdempotencyKey(req);
      if (idempotencyKey) {
        const cached = getIdempotentResponse(req.userId!, idempotencyKey);
        if (cached) {
          return res.status(cached.statusCode).json(cached.response);
        }
      }

      const { tokenAddress, tokenName, tokenSymbol, solAmount, chain: chainParam } = req.body;
      // NOTE: Client 'price' is intentionally IGNORED for execution

      // ✅ INPUT VALIDATION
      if (!tokenAddress || !tokenName || !tokenSymbol) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Validate and default chain
      const chain: Chain = chainParam && isValidChain(chainParam) ? chainParam : 'solana';

      // ✅ ADDRESS VALIDATION (chain-aware)
      if (chain === 'solana' && !isValidSolanaAddress(tokenAddress)) {
        return res.status(400).json({ error: 'Invalid Solana token address format' });
      }
      if (chain === 'base' && !isValidEvmAddress(tokenAddress)) {
        return res.status(400).json({ error: 'Invalid Base token address format (must be 0x...)' });
      }

      // ✅ PRECISION FIX: Parse native amount without floating-point math
      let nativeSpent: bigint;
      try {
        nativeSpent = parseToBaseUnits(chain, solAmount);
        validateTradeAmount(nativeSpent);
      } catch (e: any) {
        return res.status(400).json({ error: e.message || `Invalid ${chain === 'base' ? 'ETH' : 'SOL'} amount` });
      }

      const user = await storage.getUserById(req.userId!);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Pre-check balance using per-chain balance (will be verified atomically in transaction too)
      const userBalance = await storage.getUserBalance(req.userId!, chain);
      if (userBalance < nativeSpent) {
        const symbol = chain === 'base' ? 'ETH' : 'SOL';
        return res.status(400).json({ error: `Insufficient ${symbol} balance` });
      }

      // ✅ ANTI-CHEAT: Fetch price BEFORE transaction (no external calls in tx)
      const tokenData = await marketDataService.getToken(tokenAddress, chain);
      if (!tokenData || !tokenData.priceNative) {
        return res.status(400).json({ error: `Could not fetch token price from ${chain}. Try again.` });
      }

      // ✅ ANTI-MANIPULATION: Check minimum liquidity requirements
      // Low-liquidity tokens can be easily manipulated
      const liquidityUsd = tokenData.liquidity || 0;
      const volume24hUsd = tokenData.volume24h || 0;

      if (!meetsLiquidityRequirements(liquidityUsd, volume24hUsd)) {
        console.log(`⚠️ Token ${tokenSymbol} rejected on ${chain}: liquidity=$${liquidityUsd}, volume=$${volume24hUsd}`);
        return res.status(400).json({ 
          error: `Token does not meet minimum liquidity requirements ($${MIN_LIQUIDITY_USD} liquidity, $${MIN_VOLUME_24H_USD} 24h volume)`,
          liquidityUsd,
          volume24hUsd,
        });
      }

      // Server-side price is the ONLY price used for execution
      const serverPriceNative = tokenData.priceNative;
      const decimals = tokenData.decimals || (chain === 'base' ? 18 : 6);

      // Apply simulated slippage (0.5% for paper trading realism)
      const SLIPPAGE_BPS = 50n; // 0.5% = 50 basis points
      const slippageMultiplier = 10000n + SLIPPAGE_BPS;
      const executionPriceNative = (serverPriceNative * slippageMultiplier) / 10000n;

      const nativeSymbol = chain === 'base' ? 'ETH' : 'SOL';
      const nativeDecimals = chain === 'base' ? 18 : 9;

      console.log(`💰 Server-side execution (ANTI-CHEAT) on ${chain}:`);
      console.log(`   DexScreener price: ${serverPriceNative.toString()} ${nativeSymbol}/token`);
      console.log(`   Execution price (+0.5% slippage): ${executionPriceNative.toString()} ${nativeSymbol}/token`);

      // Calculate tokens received using SERVER price
      const decimalMultiplier = BigInt(10 ** decimals);
      const tokenAmount = (nativeSpent * decimalMultiplier) / executionPriceNative;

      if (tokenAmount <= 0n) {
        return res.status(400).json({ error: `${nativeSymbol} amount too small to buy tokens` });
      }

      const tokensDisplay = Number(tokenAmount) / (10 ** decimals);
      console.log(`📊 Buy on ${chain}: ${Number(nativeSpent) / (10 ** nativeDecimals)} ${nativeSymbol} → ${tokensDisplay.toFixed(6)} tokens`);

      // Execute atomic trade with server-side price
      try {
        const position = await storage.executeBuyTrade({
          userId: req.userId!,
          chain,
          tokenAddress,
          tokenName,
          tokenSymbol,
          decimals,
          entryPrice: executionPriceNative,
          amount: tokenAmount,
          nativeSpent,
        });

        console.log(`✅ POSITION CREATED: ${tokenSymbol} (ID: ${position.id})`);

        const newUser = await storage.getUserById(req.userId!);

        // ✅ IDEMPOTENCY: Cache successful response
        const newBalance = await storage.getUserBalance(req.userId!, chain);
        const successResponse = { 
          message: 'Position processed successfully',
          positionId: position.id,
          newBalance: newBalance.toString(),
          tokensReceived: tokenAmount.toString(),
          executionPrice: executionPriceNative.toString(),
          chain,
        };

        if (idempotencyKey) {
          setIdempotentResponse(req.userId!, idempotencyKey, successResponse, 200);
        }

        res.json(successResponse);
      } catch (txError: any) {
        if (txError.message === 'Insufficient balance') {
          return res.status(400).json({ error: 'Insufficient balance' });
        }
        throw txError;
      }
    } catch (error: any) {
      console.error('Buy error:', error);
      res.status(500).json({ error: 'Could not execute buy order' });
    }
  });

  app.post('/api/trades/sell', ipBackstopLimiter, authenticateToken, userTradeLimiter, async (req, res) => {
    try {
      // ✅ IDEMPOTENCY CHECK: Return cached response if this is a retry
      const idempotencyKey = getIdempotencyKey(req);
      if (idempotencyKey) {
        const cached = getIdempotentResponse(req.userId!, idempotencyKey);
        if (cached) {
          return res.status(cached.statusCode).json(cached.response);
        }
      }

      const { positionId, amountLamports } = req.body as any;
      // NOTE: Client exitPriceLamports is intentionally IGNORED

      if (!positionId) {
        return res.status(400).json({ error: 'Position ID required' });
      }

      const position = await storage.getPositionById(positionId);
      if (!position || position.userId !== req.userId) {
        return res.status(404).json({ error: 'Position not found' });
      }

      // ✅ FIX: Determine sell type upfront
      // If no amountLamports provided, it's a FULL SELL - use exact position amount
      // If amountLamports provided, it's a PARTIAL SELL
      let isFullSell = !amountLamports;
      let sellAmount: bigint;

      if (isFullSell) {
        // Full sell: use exact position amount (client cannot influence)
        sellAmount = position.amount;
      } else {
        // Partial sell: validate client-provided amount
        try {
          sellAmount = BigInt(amountLamports);
        } catch {
          return res.status(400).json({ error: 'Invalid sell amount format' });
        }

        if (sellAmount <= 0n) {
          return res.status(400).json({ error: 'Sell amount must be positive' });
        }

        if (sellAmount >= position.amount) {
          // If trying to sell full amount via partial endpoint, convert to full sell
          sellAmount = position.amount;
          isFullSell = true; // ✅ FIX: Update flag so storage layer uses exact equality
        }
      }

      // Get chain from position
      const chain: Chain = position.chain || 'solana';
      
      // ✅ ANTI-CHEAT: Fetch price BEFORE transaction (no external calls in tx)
      const tokenData = await marketDataService.getToken(position.tokenAddress, chain);
      if (!tokenData || !tokenData.priceNative) {
        return res.status(400).json({ error: `Could not fetch token price from ${chain}. Try again.` });
      }

      // Server-side price with negative slippage for sells
      const serverPriceNative = tokenData.priceNative;
      const SLIPPAGE_BPS = 50n;
      const slippageMultiplier = 10000n - SLIPPAGE_BPS;
      const executionPriceNative = (serverPriceNative * slippageMultiplier) / 10000n;

      // Use position's decimals
      const decimals = position.decimals || 6;
      const decimalDivisor = BigInt(10 ** decimals);

      // Calculate native token received using SERVER price
      const nativeReceived = (sellAmount * executionPriceNative) / decimalDivisor;

      // Calculate profit/loss
      const proportionalCost = (position.nativeSpent * sellAmount) / position.amount;
      const profitLoss = nativeReceived - proportionalCost;
      
      console.log(`📊 Sell (${isFullSell ? 'FULL' : 'PARTIAL'}): ${Number(sellAmount) / (10 ** decimals)} tokens on ${chain}`);

      // Execute atomic trade with server-side price
      await storage.executeSellTrade({
        userId: req.userId!,
        positionId,
        chain,
        sellAmount,
        exitPrice: executionPriceNative,
        nativeReceived,
        profitLoss,
        proportionalCost,
      });

      // ✅ IDEMPOTENCY: Cache successful response
      const successResponse = {
        message: 'Position closed successfully',
        profitLoss: profitLoss.toString(),
        nativeReceived: nativeReceived.toString(),
        executionPrice: executionPriceNative.toString(),
        chain,
      };

      if (idempotencyKey) {
        setIdempotentResponse(req.userId!, idempotencyKey, successResponse, 200);
      }

      res.json(successResponse);
    } catch (error: any) {
      console.error('Sell error:', error);
      res.status(500).json({ error: 'Could not execute sell order' });
    }
  });

  app.post('/api/trades/sell-all', ipBackstopLimiter, authenticateToken, userTradeLimiter, async (req, res) => {
  return res.status(501).json({
    error: 'sell-all temporarily disabled (storage batch sell not implemented). Sell positions individually for now.'
  });
});


  app.get('/api/trades/history', authenticateToken, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = 50;
      const offset = (page - 1) * limit;
      
      // TODO: Get chain from query params in Phase 3
      const chain = req.query.chain as Chain | undefined;

      const [trades, totalCount] = await Promise.all([
        storage.getUserTrades(req.userId!, chain, limit, offset),
        storage.getUserTradesCount(req.userId!, chain)
      ]);

      res.json(serializeBigInts({
        trades,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      }));
    } catch (error: any) {
      console.error('Get history error:', error);
      res.status(500).json({ error: 'Could not fetch trade history' });
    }
  });

  // ============================================================================
  // Token Routes
  // ============================================================================

  // IMPORTANT: Search route must come BEFORE :address route to avoid matching "search" as an address
  // Get trending tokens based on user activity (most bought/sold by user count)
  app.get('/api/trending', publicApiLimiter, async (req, res) => {
    try {
      // Get top tokens by number of unique users who bought them
      const buyActivity = await db
        .select({
          tokenAddress: positions.tokenAddress,
          tokenName: positions.tokenName,
          tokenSymbol: positions.tokenSymbol,
          decimals: positions.decimals,
          buyerCount: sql`COUNT(DISTINCT ${positions.userId})`.as('buyerCount'),
        })
        .from(positions)
        .groupBy(positions.tokenAddress, positions.tokenName, positions.tokenSymbol, positions.decimals)
        .orderBy(sql`COUNT(DISTINCT ${positions.userId})`)
        .limit(30);

      // Get sell activity (users who closed positions)
      const sellActivity = await db
        .select({
          tokenAddress: tradeHistory.tokenAddress,
          sellerCount: sql`COUNT(DISTINCT ${tradeHistory.userId})`.as('sellerCount'),
        })
        .from(tradeHistory)
        .groupBy(tradeHistory.tokenAddress)
        .limit(100);

      // Merge and score tokens (weighted by activity)
      const trendingMap = new Map<string, any>();

      // Add buy activity
      for (const token of buyActivity) {
        const addr = token.tokenAddress;
        trendingMap.set(addr, {
          tokenAddress: addr,
          tokenName: token.tokenName,
          tokenSymbol: token.tokenSymbol,
          decimals: token.decimals,
          buyerCount: parseInt(token.buyerCount as string),
          sellerCount: 0,
          totalActivity: parseInt(token.buyerCount as string),
        });
      }

      // Add/update sell activity
      for (const item of sellActivity) {
        const addr = item.tokenAddress;
        const existing = trendingMap.get(addr);
        const sellerCount = parseInt(item.sellerCount as string);

        if (existing) {
          existing.sellerCount = sellerCount;
          existing.totalActivity = existing.buyerCount + sellerCount;
        } else {
          trendingMap.set(addr, {
            tokenAddress: addr,
            tokenName: '',
            tokenSymbol: '',
            decimals: 6,
            buyerCount: 0,
            sellerCount: sellerCount,
            totalActivity: sellerCount,
          });
        }
      }

      // Sort by total activity and get top 20
      const trending = Array.from(trendingMap.values())
        .sort((a, b) => b.totalActivity - a.totalActivity)
        .slice(0, 20);

      // Fetch current prices for trending tokens
      const trendingAddresses = trending.map(t => t.tokenAddress);
      const priceMap = new Map<string, bigint>();

      if (trendingAddresses.length > 0) {
        try {
          const batchSize = 30;
          for (let i = 0; i < trendingAddresses.length; i += batchSize) {
            const batch = trendingAddresses.slice(i, i + batchSize);
            const addressesParam = batch.join(',');

            const dexResponse = await fetchWithTimeout(
              `https://api.dexscreener.com/latest/dex/tokens/${addressesParam}`,
              8000
            );

            if (dexResponse.ok) {
              const dexData = await dexResponse.json();
              const pairs = dexData.pairs || [];

              for (const addr of batch) {
                const bestPair = findBestSolanaPair(pairs, addr);
                if (bestPair && bestPair.priceNative) {
                  // ✅ PRECISION FIX: Parse without float math
                  const priceLamports = BigInt(Math.max(1, parseDecimalToLamports(bestPair.priceNative)));
                  priceMap.set(addr, priceLamports);
                }
              }
            }
          }
        } catch (error) {
          console.warn('⚠️ Failed to fetch trending prices:', error);
        }
      }

      // Enrich with prices
      const enrichedTrending = trending.map(t => ({
        ...t,
        currentPrice: priceMap.get(t.tokenAddress)?.toString() || '0',
      }));

      res.json({ trending: enrichedTrending });
    } catch (error: any) {
      console.error('Trending fetch error:', error);
      res.status(500).json({ error: 'Could not fetch trending tokens' });
    }
  });

  app.get('/api/tokens/search', searchLimiter, async (req, res) => {
    try {
      const query = req.query.q as string || '';
      const searchTerm = query.toLowerCase().trim();

      console.log(`🔍 Search request: "${searchTerm}"`);

      if (!searchTerm || searchTerm.length < 3) {
        return res.json({ results: [] });
      }

      const results: any[] = [];

      // Search DexScreener API for token results
      try {
        // ✅ FIX: Use circuit breaker protected fetch
        const dexResponse = await fetchDexScreener(`/latest/dex/search/?q=${encodeURIComponent(searchTerm)}`);
        if (dexResponse?.ok) {
          const dexData = await dexResponse.json();

          // Filter for Solana pairs only
          const solanaPairs = dexData.pairs?.filter((pair: any) => pair.chainId === 'solana') || [];
          console.log(`📊 DexScreener returned ${solanaPairs.length} Solana pairs for "${searchTerm}"`);

          for (const pair of solanaPairs.slice(0, 15)) {
            const tokenAddress = pair.baseToken?.address;
            if (!tokenAddress) continue;

            // Skip if already found
            if (results.some(r => r.tokenAddress === tokenAddress)) continue;

            // Use native price (already in SOL) instead of USD price
            // ✅ PRECISION FIX: Parse without float math
            const priceLamports = pair.priceNative ? parseDecimalToLamports(pair.priceNative) : 0;

            results.push({
              tokenAddress,
              name: pair.baseToken?.name || 'Unknown',
              symbol: pair.baseToken?.symbol || '???',
              marketCap: pair.marketCap || pair.fdv || 0,
              price: priceLamports,
              icon: pair.info?.imageUrl,
              dexId: pair.dexId,
              volume24h: pair.volume?.h24 || 0,
              priceChange24h: pair.priceChange?.h24 || 0,
            });
          }
        }
      } catch (dexError) {
        console.error('DexScreener API search error:', dexError);
        // Continue with local results
      }

      // Also search DexScreener profiles (for additional metadata)
      try {
        const profiles = await fetchDexScreenerProfiles();

        for (const p of profiles) {
          if (p.chainId !== 'solana') continue;

          const address = p.tokenAddress?.toLowerCase() || '';
          const description = p.description?.toLowerCase() || '';
          const url = p.url?.toLowerCase() || '';

          // Skip if already found
          if (results.some(r => r.tokenAddress === p.tokenAddress)) continue;

          if (address.includes(searchTerm) || description.includes(searchTerm) || url.includes(searchTerm)) {
            results.push({
              tokenAddress: p.tokenAddress,
              name: p.description?.split('\n')[0]?.trim() || 'Unknown',
              symbol: p.tokenAddress?.slice(0, 4).toUpperCase() || '???',
              icon: p.icon,
            });
          }
        }
      } catch (profileError) {
        console.error('DexScreener profiles error:', profileError);
      }

      const finalResults = results.slice(0, 20);
      console.log(`✅ Returning ${finalResults.length} search results for "${searchTerm}"`);
      res.json({ results: finalResults });
    } catch (error: any) {
      console.error('Search tokens error:', error);
      res.status(500).json({ error: 'Could not search tokens' });
    }
  });

  // Get historical OHLCV data for charting
  app.get('/api/tokens/:address/ohlcv', searchLimiter, async (req, res) => {
    try {
      const { address } = req.params;
      const { timeframe = '1H' } = req.query;

      // First, find the pool address from DexScreener
      const poolResponse = await fetchWithTimeout(`https://api.dexscreener.com/latest/dex/tokens/${address}`, 5000);
      if (!poolResponse.ok) {
        return res.status(404).json({ error: 'Token not found' });
      }

      const poolData = await poolResponse.json();
      if (!poolData.pairs || poolData.pairs.length === 0) {
        return res.status(404).json({ error: 'No trading pairs found' });
      }

      // Get the main pair (highest liquidity usually first)
      const pair = poolData.pairs[0];
      const pairAddress = pair.pairAddress;

      // Map timeframe to GeckoTerminal aggregate and time unit
      // Note: GeckoTerminal doesn't support sub-minute data, so we use 1-minute data for 5S, 15S, 30S
      const timeframeMap: Record<string, { unit: string; aggregate: number; limit: number }> = {
        '5S': { unit: 'minute', aggregate: 1, limit: 5 },   // ~5 minutes of 1-min candles
        '15S': { unit: 'minute', aggregate: 1, limit: 15 },  // ~15 minutes of 1-min candles
        '30S': { unit: 'minute', aggregate: 1, limit: 30 },  // ~30 minutes of 1-min candles
        '1M': { unit: 'minute', aggregate: 1, limit: 60 },   // 1 hour of 1-min candles
        '3M': { unit: 'minute', aggregate: 3, limit: 60 },   // 3 hours of 3-min candles
        '5M': { unit: 'minute', aggregate: 5, limit: 60 }    // 5 hours of 5-min candles
      };

      const tfConfig = timeframeMap[timeframe as string] || timeframeMap['1M'];

      // Fetch OHLCV data from GeckoTerminal
      const geckoUrl = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pairAddress}/ohlcv/${tfConfig.unit}`;
      const geckoResponse = await fetchWithTimeout(
        `${geckoUrl}?aggregate=${tfConfig.aggregate}&limit=${tfConfig.limit}&currency=usd`,
        10000
      );

      if (!geckoResponse.ok) {
        console.warn(`GeckoTerminal API error: ${geckoResponse.status}`);
        return res.status(500).json({ error: 'Failed to fetch chart data' });
      }

      const ohlcvData = await geckoResponse.json();

      // Debug: Log what we got from GeckoTerminal
      console.log(`📊 GeckoTerminal response structure for ${address}:`, {
        hasData: !!ohlcvData?.data,
        hasAttributes: !!ohlcvData?.data?.attributes,
        hasOhlcvList: !!ohlcvData?.data?.attributes?.ohlcv_list,
        ohlcvListLength: ohlcvData?.data?.attributes?.ohlcv_list?.length || 0,
        responseKeys: Object.keys(ohlcvData || {})
      });

      let candles = ohlcvData?.data?.attributes?.ohlcv_list || [];

      // Validate candles is an array and contains valid data
      if (!Array.isArray(candles)) {
        console.error(`⚠️ OHLCV candles is not an array for ${address}:`, typeof candles, candles);
        candles = [];
      }

      // Filter out any invalid candles
      candles = candles.filter((candle: any) => {
        if (!Array.isArray(candle) || candle.length < 5) {
          console.warn(`Skipping invalid candle: ${JSON.stringify(candle)}`);
          return false;
        }
        return true;
      });

      if (candles.length === 0) {
        console.warn(`⚠️ No valid OHLCV candles for ${address} after filtering`);
      }

      // Sort candles in ascending order by timestamp (required by TradingView Lightweight Charts)
      // GeckoTerminal returns them in descending order (newest first), we need ascending (oldest first)
      candles = [...candles].sort((a: number[], b: number[]) => a[0] - b[0]);

      // Debug: Log first and last timestamps to verify sort order
      if (candles.length >= 2) {
        console.log(`✅ OHLCV data for ${address}: ${candles.length} candles, timestamps ${candles[0][0]} to ${candles[candles.length - 1][0]} (${candles[0][0] < candles[candles.length - 1][0] ? 'ASC ✅' : 'DESC ❌'})`);
      } else if (candles.length === 1) {
        console.log(`✅ OHLCV data for ${address}: 1 candle at timestamp ${candles[0][0]}`);
      }

      // Prevent caching - chart data changes frequently and needs to be fresh
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      res.json({ 
        success: true,
        candles,
        pairAddress,
        timeframe,
        candleCount: candles.length
      });
    } catch (error: any) {
      console.error('❌ OHLCV fetch error:', error.message || error);
      console.error('Full error:', error);
      res.status(500).json({ error: 'Failed to fetch chart data', details: error.message });
    }
  });

  // Get individual token by address (must come AFTER search route)
  app.get('/api/tokens/:address', searchLimiter, async (req, res) => {
    try {
      const { address } = req.params;
      let token = null;

      // Fetch token from DexScreener API
      console.log(`🔍 Fetching token ${address} from DexScreener...`);
      try {
          // ✅ FIX: Use circuit breaker protected fetch
          const dexResponse = await fetchDexScreener(`/latest/dex/tokens/${address}`);
          if (dexResponse?.ok) {
            const dexData = await dexResponse.json();

            // Find the best (highest liquidity) Solana pair for this token
            const solanaPair = findBestSolanaPair(dexData.pairs, address);

            if (solanaPair) {
              // ✅ PRECISION FIX: Parse price without float math
              const priceLamports = solanaPair.priceNative ? parseDecimalToLamports(solanaPair.priceNative) : 0;
              const priceUsd = solanaPair.priceUsd ? parseFloat(solanaPair.priceUsd) : 0; // Float OK for USD display

              // Validate price exists
              if (priceLamports === 0 && priceUsd === 0) {
                console.warn(`⚠️ Token ${address} has no price data on DexScreener`);
                return res.status(404).json({ error: 'Token price data unavailable' });
              }

              // Try to get enhanced metadata (icon, etc.)
              const metadata = await fetchTokenMetadata(address);

              token = {
                tokenAddress: address,
                name: metadata?.name || solanaPair.baseToken?.name || 'Unknown Token',
                symbol: metadata?.symbol || solanaPair.baseToken?.symbol || '???',
                price: priceLamports,
                priceUsd: priceUsd,
                marketCap: solanaPair.fdv || solanaPair.marketCap || 0,
                volume24h: solanaPair.volume?.h24 || 0,
                priceChange24h: solanaPair.priceChange?.h24 || 0,
                creator: undefined,
                timestamp: new Date().toISOString(),
                icon: metadata?.icon || solanaPair.info?.imageUrl,
              };

              console.log(`✅ Found token ${address} on DexScreener: ${token.name} (${token.symbol}) - Price: $${priceUsd} (${priceLamports / 1_000_000_000} SOL) - MCap: $${token.marketCap} - Icon: ${token.icon ? 'Yes' : 'No'}`);
            }
          }
        } catch (dexError) {
          console.error('DexScreener API error for token:', dexError);
        }

      if (!token) {
        return res.status(404).json({ error: 'Token not found' });
      }

      res.json({ token });
    } catch (error: any) {
      console.error('Get token error:', error);
      res.status(500).json({ error: 'Could not fetch token' });
    }
  });

  // Get Jupiter quote for buying tokens with SOL
  app.get('/api/tokens/quote/buy', publicApiLimiter, async (req, res) => {
    try {
      const { tokenAddress, solAmount, decimals } = req.query;

      if (!tokenAddress || !solAmount) {
        return res.status(400).json({ error: 'tokenAddress and solAmount are required' });
      }

      // ✅ PRECISION FIX: Parse without float math
      let inputAmountLamports: number;
      try {
        const lamportsBigInt = parseSolToLamports(solAmount as string);
        inputAmountLamports = Number(lamportsBigInt);
        if (inputAmountLamports <= 0) {
          return res.status(400).json({ error: 'Invalid SOL amount' });
        }
      } catch (e) {
        return res.status(400).json({ error: 'Invalid SOL amount format' });
      }

      const solAmountNum = inputAmountLamports / 1_000_000_000; // For display only

      // Use provided decimals or default to 6 for pump.fun tokens
      const TOKEN_DECIMALS = decimals ? parseInt(decimals as string) : 6;

      // SOL mint address (wrapped SOL)
      const SOL_MINT = 'So11111111111111111111111111111111111111112';

      // Call Jupiter V6 Quote API with circuit breaker
      console.log(`🔮 Fetching Jupiter quote for ${solAmountNum} SOL → ${tokenAddress}`);

      // ✅ FIX: Use circuit breaker protected fetch
      const response = await fetchJupiter(`/v6/quote?inputMint=${SOL_MINT}&outputMint=${tokenAddress}&amount=${inputAmountLamports}&slippageBps=50`);

      if (!response) {
        console.error(`❌ Jupiter API unavailable (circuit breaker open or timeout)`);
        return res.status(503).json({ error: 'Jupiter API temporarily unavailable' });
      }

      if (!response.ok) {
        console.error(`❌ Jupiter API error: ${response.status} ${response.statusText}`);
        return res.status(response.status).json({ error: 'Failed to get quote from Jupiter' });
      }

      const quoteData = await response.json();

      if (!quoteData || !quoteData.outAmount) {
        console.error('❌ Invalid Jupiter quote response:', quoteData);
        return res.status(500).json({ error: 'Invalid quote data from Jupiter' });
      }

      // Extract quote details
      const tokenAmountOut = parseInt(quoteData.outAmount); // In token's smallest unit (already includes decimals)
      const priceImpactPct = parseFloat(quoteData.priceImpactPct || '0');

      // ✅ FIX: Calculate effective price correctly
      // effectivePriceLamports = SOL lamports / token units (from Jupiter)
      // This gives us: SOL lamports per smallest unit of token
      // Then we need to scale to "per whole token" by multiplying by 10^decimals
      const effectivePriceLamports = tokenAmountOut > 0
        ? Math.floor((inputAmountLamports * (10 ** TOKEN_DECIMALS)) / tokenAmountOut)
        : 0;

      // For display/logging
      const tokenAmountDecimal = tokenAmountOut / (10 ** TOKEN_DECIMALS);
      const effectivePriceSOL = effectivePriceLamports / 1_000_000_000;

      console.log(`✅ Jupiter quote: ${solAmountNum} SOL → ${tokenAmountDecimal.toFixed(4)} tokens`);
      console.log(`   TOKEN_DECIMALS: ${TOKEN_DECIMALS}, tokenAmountOut (units): ${tokenAmountOut}`);
      console.log(`   Effective Price: ${effectivePriceLamports} lamports/token = ${effectivePriceSOL.toFixed(9)} SOL/token (impact: ${priceImpactPct}%)`);

      res.json({
        solAmount: solAmountNum,
        solAmountLamports: inputAmountLamports,
        tokenAmountOut: tokenAmountOut,
        tokenAmountDisplay: tokenAmountDecimal,
        effectivePriceLamports: effectivePriceLamports,
        priceImpactPct: priceImpactPct,
        slippageBps: 50,
      });
    } catch (error: any) {
      console.error('Jupiter quote error:', error);
      res.status(500).json({ error: 'Could not fetch quote' });
    }
  });

  // Get Jupiter quote for selling tokens for SOL
  app.get('/api/tokens/quote/sell', publicApiLimiter, async (req, res) => {
    try {
      const { tokenAddress, tokenAmount, decimals } = req.query;

      if (!tokenAddress || !tokenAmount) {
        return res.status(400).json({ error: 'tokenAddress and tokenAmount are required' });
      }

      const tokenAmountNum = parseFloat(tokenAmount as string);
      if (isNaN(tokenAmountNum) || tokenAmountNum <= 0) {
        return res.status(400).json({ error: 'Invalid token amount' });
      }

      // Use provided decimals or default to 6 for pump.fun tokens
      const TOKEN_DECIMALS = decimals ? parseInt(decimals as string) : 6;
      const inputAmountTokenUnits = Math.floor(tokenAmountNum * (10 ** TOKEN_DECIMALS));

      // SOL mint address (wrapped SOL)
      const SOL_MINT = 'So11111111111111111111111111111111111111112';

      // Call Jupiter V6 Quote API - now selling tokens for SOL
      console.log(`🔮 Fetching Jupiter quote for ${tokenAmountNum} tokens → SOL (${tokenAddress})`);

      // ✅ FIX: Use circuit breaker protected fetch
      const response = await fetchJupiter(`/v6/quote?inputMint=${tokenAddress}&outputMint=${SOL_MINT}&amount=${inputAmountTokenUnits}&slippageBps=50`);

      if (!response) {
        console.error(`❌ Jupiter API unavailable (circuit breaker open or timeout)`);
        return res.status(503).json({ error: 'Jupiter API temporarily unavailable' });
      }

      if (!response.ok) {
        console.error(`❌ Jupiter API error: ${response.status} ${response.statusText}`);
        return res.status(response.status).json({ error: 'Failed to get quote from Jupiter' });
      }

      const quoteData = await response.json();

      if (!quoteData || !quoteData.outAmount) {
        console.error('❌ Invalid Jupiter quote response:', quoteData);
        return res.status(500).json({ error: 'Invalid quote data from Jupiter' });
      }

      // Extract quote details
      const solAmountOut = parseInt(quoteData.outAmount); // In Lamports
      const priceImpactPct = parseFloat(quoteData.priceImpactPct || '0');

      // Calculate effective price: SOL received / tokens sold = SOL per token (in Lamports)
      const effectivePriceLamports = tokenAmountNum > 0 
        ? Math.floor(solAmountOut / tokenAmountNum)
        : 0;

      console.log(`✅ Jupiter quote: ${tokenAmountNum} tokens → ${solAmountOut / 1_000_000_000} SOL (impact: ${priceImpactPct}%)`);

      res.json({
        tokenAmount: tokenAmountNum,
        tokenAmountUnits: inputAmountTokenUnits,
        solAmountOut: solAmountOut,
        solAmountDisplay: solAmountOut / 1_000_000_000,
        effectivePriceLamports: effectivePriceLamports,
        priceImpactPct: priceImpactPct,
        slippageBps: 50,
      });
    } catch (error: any) {
      console.error('Jupiter sell quote error:', error);
      res.status(500).json({ error: 'Could not fetch quote' });
    }
  });

  // ============================================================================
  // Token Analysis Routes (Helius)
  // ============================================================================

  // Legacy endpoint - redirects to enhanced analysis
  app.get('/api/analyze/:mintAddress', async (req, res) => {
    try {
      const { mintAddress } = req.params;

      if (!mintAddress || mintAddress.length < 32) {
        return res.status(400).json({ error: 'Invalid mint address' });
      }

      // ✅ MEDIUM FIX: Use enhanced helius service instead of legacy
      const analysis = await heliusService.getTokenAnalysis(mintAddress);
      res.json(analysis);
    } catch (error: any) {
      console.error('Token analysis error:', error);
      res.status(500).json({ error: error.message || 'Could not analyze token' });
    }
  });

  // ============================================================================
  // Enhanced Study Section Routes
  // ============================================================================

  /**
   * Token Analysis Endpoint
   * GET /api/study/token/:mintAddress
   */
  app.get('/api/study/token/:mintAddress', async (req, res) => {
    try {
      const { mintAddress } = req.params;

      if (!heliusService.isValidSolanaAddress(mintAddress)) {
        return res.status(400).json({ error: 'Invalid token address' });
      }

      const analysis = await heliusService.getTokenAnalysis(mintAddress);
      res.json(analysis);
    } catch (error: any) {
      console.error('Token analysis error:', error);

      // Check if this is "not a Token mint" error (user entered a wallet address instead)
      if (error.message?.includes('not a Token mint')) {
        return res.status(400).json({ 
          error: 'Not a token address',
          message: 'This appears to be a wallet address, not a token mint address. Please use the Wallet Explorer tab instead.'
        });
      }

      res.status(500).json({ 
        error: 'Failed to fetch token data',
        message: error.message || 'Unknown error occurred'
      });
    }
  });

  /**
   * Wallet Portfolio Endpoint
   * GET /api/study/wallet/:walletAddress
   */
  app.get('/api/study/wallet/:walletAddress', async (req, res) => {
    try {
      const { walletAddress } = req.params;

      if (!heliusService.isValidSolanaAddress(walletAddress)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }

      const portfolio = await heliusService.getWalletPortfolio(walletAddress);
      res.json(portfolio);
    } catch (error: any) {
      console.error('Wallet portfolio error:', error);

      // Check if this is a Helius API error
      if (error.message?.includes('500 Internal Server Error')) {
        return res.status(503).json({ 
          error: 'Service temporarily unavailable',
          message: 'Helius API is having trouble fetching this wallet data. This could be due to API rate limits or the wallet being too large. Please try again in a moment.'
        });
      }

      res.status(500).json({ 
        error: 'Failed to fetch wallet data',
        message: error.message || 'Unknown error occurred'
      });
    }
  });

  /**
   * Transaction History Endpoint
   * GET /api/study/transactions/:address
   */
  app.get('/api/study/transactions/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const { limit, before, type } = req.query;

      if (!heliusService.isValidSolanaAddress(address)) {
        return res.status(400).json({ error: 'Invalid address' });
      }

      const transactions = await heliusService.getTransactionHistory(address, {
        limit: limit ? parseInt(limit as string) : 50,
        before: before as string,
        type: type as string,
      });

      res.json(transactions);
    } catch (error: any) {
      console.error('Transaction history error:', error);

      // Check if this is a 401 Unauthorized (premium feature)
      if (error.message?.includes('401')) {
        return res.status(403).json({ 
          error: 'Premium feature',
          message: 'Transaction history requires a Helius premium API plan. Please upgrade your API key at https://helius.dev'
        });
      }

      res.status(500).json({ error: 'Failed to fetch transaction history' });
    }
  });

  /**
   * Transaction Details Endpoint
   * GET /api/study/transaction/:signature
   */
  app.get('/api/study/transaction/:signature', async (req, res) => {
    try {
      const { signature } = req.params;
      const details = await heliusService.getTransactionDetails(signature);
      res.json(details);
    } catch (error) {
      console.error('Transaction details error:', error);
      res.status(500).json({ error: 'Failed to fetch transaction details' });
    }
  });

  /**
   * Search Endpoint (Unified search for tokens/wallets)
   * GET /api/study/search?q=<address>
   */
  app.get('/api/study/search', async (req, res) => {
    try {
      const { q } = req.query;

      if (!q || typeof q !== 'string') {
        return res.status(400).json({ error: 'Search query required' });
      }

      const result = await heliusService.search(q.trim());
      res.json(result);
    } catch (error) {
      console.error('Search error:', error);
      res.status(500).json({ error: 'Search failed' });
    }
  });

  /**
   * Batch Token Metadata Endpoint
   * POST /api/study/tokens/batch
   * Body: { mintAddresses: string[] }
   */
  app.post('/api/study/tokens/batch', async (req, res) => {
    try {
      const { mintAddresses } = req.body;

      if (!Array.isArray(mintAddresses) || mintAddresses.length === 0) {
        return res.status(400).json({ error: 'Invalid mint addresses array' });
      }

      if (mintAddresses.length > 100) {
        return res.status(400).json({ error: 'Maximum 100 addresses per request' });
      }

      const tokens = await heliusService.getBatchTokenInfo(mintAddresses);
      res.json(tokens);
    } catch (error) {
      console.error('Batch token info error:', error);
      res.status(500).json({ error: 'Failed to fetch batch token info' });
    }
  });

  /**
   * API Usage Stats Endpoint (for monitoring)
   * GET /api/study/stats
   */
  app.get('/api/study/stats', async (req, res) => {
    try {
      const stats = heliusService.getUsageStats();
      res.json(stats);
    } catch (error) {
      console.error('Stats error:', error);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  // ============================================================================
  // Leaderboard Routes
  // ============================================================================

  app.get('/api/leaderboard/overall', publicApiLimiter, async (req, res) => {
    try {
      const leaders = await storage.getTopUsersByTotalProfit(100);
      res.json(serializeBigInts({ leaders: leaders.map((l, i) => ({ ...l, rank: i + 1 })) }));
    } catch (error: any) {
      console.error('Get overall leaderboard error:', error);
      res.status(500).json({ error: 'Could not fetch leaderboard' });
    }
  });

  app.get('/api/leaderboard/current-period', publicApiLimiter, async (req, res) => {
    try {
      // Get the actual current period from storage
      const currentPeriod = await storage.getCurrentLeaderboardPeriod();

      if (!currentPeriod) {
        return res.json({ leaders: [], periodStart: new Date().toISOString(), periodEnd: new Date().toISOString() });
      }

      // Use the actual period boundaries for accurate calculations
      const leaders = await storage.getTopUsersByPeriodProfit(
        new Date(currentPeriod.startTime), 
        new Date(currentPeriod.endTime), 
        100
      );

      res.json(serializeBigInts({ 
        leaders: leaders.map((l, i) => ({ ...l, rank: i + 1 })), 
        periodStart: currentPeriod.startTime,
        periodEnd: currentPeriod.endTime
      }));
    } catch (error: any) {
      console.error('Get period leaderboard error:', error);
      res.status(500).json({ error: 'Could not fetch period leaderboard' });
    }
  });

  app.get('/api/leaderboard/winners', publicApiLimiter, async (req, res) => {
    try {
      const winners = await storage.getPastWinners(10);
      res.json(serializeBigInts({ winners }));
    } catch (error: any) {
      console.error('Get winners error:', error);
      res.status(500).json({ error: 'Could not fetch winners' });
    }
  });

  const httpServer = createServer(app);

  // Initialize leaderboard service for period management
  leaderboardService.start();
  registerMarketRoutes(app, { authenticateToken, searchLimiter });
  registerRewardsRoutes(app);
  rewardsEngine.start();
  return httpServer;
}