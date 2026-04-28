import type { Express } from "express";
import { createServer, type Server } from "http";
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { z } from "zod";
import { sql, and, eq } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { db } from "./db";
import { positions, tradeHistory } from "@shared/schema";
import { storage } from "./storage";
import { authenticateToken } from "./middleware/auth";
import { fetchDexScreenerProfiles } from "./pumpportal";
import { leaderboardService } from "./leaderboardService";
import { heliusService } from "./helius-enhanced";
import { insertUserSchema, solToLamports, WEI_PER_ETH, type LoginRequest, type RegisterRequest, type BuyRequest, type SellRequest, type Chain } from "@shared/schema";


import { getSolPrice, getCachedSolPrice, fetchEthPrice, getNativePrice, getCachedNativePrice, getAllNativePricesDetailed } from './nativePrice';
import { registerMarketRoutes } from "./services/marketRoutes";
import { achievementEngine } from "./services/achievementEngine";
import { portfolioAnalytics } from "./services/portfolioAnalytics";

import { jupiterService, SOL_MINT } from "./services/jupiterService";
import { runDailyPipeline } from "./services/alphaDesk";
import { getIdeasForRun } from "./services/alphaDesk/persist/ideas";
import { findTodayRun, countRunsToday } from "./services/alphaDesk/persist/runs";
import { getPerformanceSummary, getIdeaTrajectory } from "./services/alphaDesk/performance";
import { ssePriceFeed } from "./services/ssePriceFeed";
import { alphaDeskRuns, alphaDeskIdeas, alphaDeskIdeaOutcomes } from "@shared/schema";

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
    let RedisStore: any;
    let Redis: any;

    try {
      const RedisStoreModule = await import('rate-limit-redis');
      const IoRedisModule = await import('ioredis');
      RedisStore = (RedisStoreModule as any).default || RedisStoreModule;
      Redis = (IoRedisModule as any).default || (IoRedisModule as any).Redis || IoRedisModule;
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

// Health check rate limiter - light protection to prevent abuse
const healthLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute per IP for health checks
  message: { error: 'Too many health check requests' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: any) => req.path !== '/api/health', // Only apply to health endpoint
});

// Require JWT_SECRET or SESSION_SECRET environment variable
const JWT_SECRET: string = (() => {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('FATAL: JWT_SECRET or SESSION_SECRET environment variable must be set');
  }
  return secret;
})();

// ✅ PRECISION FIX: Parse SOL string to lamports without floating-point math
// This avoids issues like 0.1 * 1e9 = 99999999.99999999
function parseSolToLamports(solAmount: string | number): bigint {
  // Convert to string if number was passed
  const solStr = String(solAmount);

  // ✅ FIX: Bounds check before processing (prevent memory issues)
  if (solStr.length > 30) {
    throw new Error('Amount too large');
  }

  // Validate format: only digits, optional decimal, optional leading minus
  if (!/^-?\d*\.?\d+$/.test(solStr)) {
    throw new Error('Invalid SOL amount format');
  }

  // Split on decimal point
  const parts = solStr.split('.');
  const wholePart = parts[0] || '0';
  let fracPart = parts[1] || '';

  // Pad or truncate fractional part to exactly 9 digits (lamports precision)
  if (fracPart.length > 9) {
    fracPart = fracPart.slice(0, 9); // Truncate excess precision
  } else {
    fracPart = fracPart.padEnd(9, '0'); // Pad with zeros
  }

  // Combine and parse as BigInt
  const lamportsStr = wholePart + fracPart;

  // ✅ FIX: Final bounds check
  if (lamportsStr.length > 20) {
    throw new Error('Amount exceeds maximum precision');
  }

  const lamports = BigInt(lamportsStr);

  return lamports;
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

// Validate Base/EVM address format
function isValidBaseAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Validate address based on chain
function isValidChainAddress(chain: Chain, address: string): boolean {
  if (chain === 'solana') {
    return isValidSolanaAddress(address);
  } else if (chain === 'base') {
    return isValidBaseAddress(address);
  }
  return false;
}

// Valid chains
const VALID_CHAINS: Chain[] = ['solana', 'base'];

function isValidChain(chain: string): chain is Chain {
  return VALID_CHAINS.includes(chain as Chain);
}

// Chain configuration for trading
const CHAIN_CONFIG = {
  solana: {
    nativeDecimals: 9,
    nativeSymbol: 'SOL',
    minTradeAmount: 1_000_000n, // 0.001 SOL
    maxTradeAmount: 100_000_000_000n, // 100 SOL
  },
  base: {
    nativeDecimals: 18,
    nativeSymbol: 'ETH',
    minTradeAmount: 1_000_000_000_000_000n, // 0.001 ETH
    maxTradeAmount: 100_000_000_000_000_000_000n, // 100 ETH
  },
};

// Multi-chain trade amount validation
function validateTradeAmountForChain(nativeAmount: bigint, chain: Chain): void {
  const config = CHAIN_CONFIG[chain];
  if (nativeAmount <= 0n) {
    throw new Error('Trade amount must be positive');
  }
  if (nativeAmount < config.minTradeAmount) {
    throw new Error(`Trade amount too small (minimum 0.001 ${config.nativeSymbol})`);
  }
  if (nativeAmount > config.maxTradeAmount) {
    throw new Error(`Trade amount too large (maximum 100 ${config.nativeSymbol})`);
  }
}

// Parse native amount string (SOL or ETH) to native units (lamports or wei)
function validateDecimals(decimals: number): void {
  if (!Number.isFinite(decimals) || decimals < 0 || decimals > 78) {
    throw new Error(`Invalid decimals: ${decimals}. Must be 0-78.`);
  }
}

function parseNativeAmount(amountStr: string, nativeDecimals: number): bigint {
  const amountString = String(amountStr);

  if (amountString.length > 30) {
    throw new Error('Amount too large');
  }

  if (!/^-?\d*\.?\d+$/.test(amountString)) {
    throw new Error('Invalid amount format');
  }

  const parts = amountString.split('.');
  const wholePart = parts[0] || '0';
  let fracPart = parts[1] || '';

  if (fracPart.length > nativeDecimals) {
    fracPart = fracPart.slice(0, nativeDecimals);
  } else {
    fracPart = fracPart.padEnd(nativeDecimals, '0');
  }

  const nativeUnitsStr = wholePart + fracPart;

  if (nativeUnitsStr.length > 30) {
    throw new Error('Amount exceeds maximum precision');
  }

  return BigInt(nativeUnitsStr);
}

// Parse decimal string to native units (lamports or wei)
function parseDecimalToNativeUnits(decimalString: string, nativeDecimals: number): bigint {
  if (!decimalString || decimalString === '0') return 0n;

  const str = decimalString.trim();
  if (!/^\d*\.?\d+$/.test(str)) {
    console.warn(`Invalid price format: ${str}`);
    return 0n;
  }

  const parts = str.split('.');
  const wholePart = parts[0] || '0';
  let fracPart = parts[1] || '';

  if (fracPart.length > nativeDecimals) {
    fracPart = fracPart.slice(0, nativeDecimals);
  } else {
    fracPart = fracPart.padEnd(nativeDecimals, '0');
  }

  const cleanWhole = wholePart.replace(/^0+/, '') || '0';
  const nativeUnits = BigInt(cleanWhole + fracPart);

  if (nativeUnits > 0n) return nativeUnits;
  return str !== '0' && parseFloat(str) > 0 ? 1n : 0n;
}

// ============================================================================
// BIRDEYE PRICE FETCHER: Primary for Base chain (real-time + liquidity data)
// ============================================================================

async function fetchBirdeyeTokenData(
  tokenAddress: string,
  chain: Chain
): Promise<{ priceNative: bigint; decimals: number; liquidityUsd: number; volume24hUsd: number; fetchedAt: number } | null> {
  if (chain !== 'base' && chain !== 'solana') return null;

  const birdeyeChain = chain === 'solana' ? 'solana' : 'base';
  try {
    const res = await fetchBirdeye(`/defi/token_overview?address=${encodeURIComponent(tokenAddress)}`, birdeyeChain);
    if (!res?.ok) return null;

    const json = await res.json();
    const d = json?.data;
    if (!d) return null;

    const priceUsd = parseFloat(d.price || '0');
    const liquidityUsd = parseFloat(d.liquidity || d.liquidityUsd || '0');
    const volume24hUsd = parseFloat(d.v24hUSD || d.volume24h || d.v24h || '0');
    const decimals = parseInt(d.decimals ?? (chain === 'base' ? '18' : '6'));

    if (priceUsd <= 0 || !isFinite(priceUsd)) return null;

    // Birdeye returns price in USD. Convert to native units (SOL/ETH per token).
    // getCachedSolPrice / getCachedNativePrice return USD directly, NOT wei/lamports
    const nativePriceUsd = chain === 'solana'
      ? (getCachedSolPrice() ?? 0)
      : (getCachedNativePrice('base') ?? 0);

    if (nativePriceUsd <= 0) {
      // Native price not cached — can't convert
      console.warn(`[Birdeye] Native ${chain} price unavailable, skipping USD→native conversion`);
      return null;
    }

    // priceNative = (priceUsd / nativePriceUsd) * 10^nativeDecimals
    const nativeDecimals = chain === 'solana' ? 9 : 18;
    const priceInNative = priceUsd / nativePriceUsd;
    const priceNative = parseDecimalToNativeUnits(priceInNative.toFixed(nativeDecimals), nativeDecimals);

    if (priceNative <= 0n) return null;

    console.log(`[Birdeye] ${chain} price for ${tokenAddress.slice(0, 8)}: $${priceUsd.toFixed(8)}, liq=$${liquidityUsd.toFixed(0)}, vol24h=$${volume24hUsd.toFixed(0)}`);

    return {
      priceNative,
      decimals,
      liquidityUsd,
      volume24hUsd,
      fetchedAt: Date.now(),
    };
  } catch (err: any) {
    console.warn(`[Birdeye] ${chain} fetch failed for ${tokenAddress.slice(0, 8)}:`, err.message);
    return null;
  }
}

// Fetch token price from DexScreener for a specific chain
async function fetchDexScreenerPriceForChain(
  tokenAddress: string, 
  chain: Chain
): Promise<{ priceNative: bigint; decimals: number; liquidityUsd: number; volume24hUsd: number; fetchedAt: number } | null> {
  try {
    const dexResponse = await fetchWithTimeout(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, 
      3000
    );
    
    if (dexResponse.ok) {
      const dexData = await dexResponse.json();
      const pairs = dexData.pairs || [];
      
      const chainId = chain === 'solana' ? 'solana' : 'base';
      const chainPairs = pairs.filter((p: any) => p.chainId === chainId);
      
      if (chainPairs.length === 0) return null;
      
      const bestPair = chainPairs.reduce((best: any, current: any) => {
        const bestLiq = best?.liquidity?.usd || 0;
        const currentLiq = current?.liquidity?.usd || 0;
        return currentLiq > bestLiq ? current : best;
      }, chainPairs[0]);
      
      if (!bestPair || !bestPair.priceNative) return null;
      
      const nativeDecimals = chain === 'solana' ? 9 : 18;
      const priceNative = parseDecimalToNativeUnits(bestPair.priceNative, nativeDecimals);
      
      return {
        priceNative,
        decimals: bestPair.baseToken?.decimals ?? (chain === 'base' ? 18 : 6),
        liquidityUsd: parseFloat(bestPair.liquidity?.usd || '0'),
        volume24hUsd: parseFloat(bestPair.volume?.h24 || '0'),
        fetchedAt: Date.now(),
      };
    }
    return null;
  } catch (error) {
    console.error(`DexScreener fetch error for ${tokenAddress} on ${chain}:`, error);
    return null;
  }
}

// ✅ PRECISION FIX: Parse decimal price string to native units without float math
// Handles strings like "0.000000123" from DexScreener API
// nativeDecimals = 9 for Solana (lamports), 18 for Base (wei)
function parseDecimalToNative(decimalString: string, nativeDecimals: number = 9): bigint {
  if (!decimalString || decimalString === '0') return 0n;

  // Remove any whitespace
  const str = decimalString.trim();

  // Validate format
  if (!/^\d*\.?\d+$/.test(str)) {
    console.warn(`Invalid price format: ${str}`);
    return 0n;
  }

  // Split on decimal point
  const parts = str.split('.');
  const wholePart = parts[0] || '0';
  let fracPart = parts[1] || '';

  // Pad or truncate fractional part to exactly nativeDecimals digits
  if (fracPart.length > nativeDecimals) {
    fracPart = fracPart.slice(0, nativeDecimals);
  } else {
    fracPart = fracPart.padEnd(nativeDecimals, '0');
  }

  // Combine and parse as BigInt to avoid precision loss
  const nativeStr = wholePart + fracPart;
  if (nativeStr.length > 30) {
    console.warn(`Decimal input too long: ${nativeStr.length} digits`);
    return 0n;
  }
  const nativeUnits = BigInt(nativeStr);

  // Return at least 1n for any valid non-zero price (sub-atomic tokens)
  if (nativeUnits > 0n) return nativeUnits;
  return str !== '0' && parseFloat(str) > 0 ? 1n : 0n;
}

// ============================================================================
// SECURITY HELPERS
// ============================================================================

/** Validate and parse BigInt safely — blocks CPU-exhaustion DoS from oversized strings */
function safeBigInt(value: string | number | bigint): bigint {
  if (typeof value === 'string') {
    if (value.length > 30) {
      throw new Error('Numeric input exceeds maximum length');
    }
    if (!/^-?\d+$/.test(value)) {
      throw new Error('Invalid numeric format');
    }
  }
  return BigInt(value);
}

/** Sanitize IP strings to prevent log injection */
function sanitizeIp(ip: string | string[] | undefined): string {
  const raw = String(ip ?? 'unknown');
  return raw.replace(/[^a-zA-Z0-9.:]/g, '').slice(0, 45);
}

// ============================================================================
// DYNAMIC SLIPPAGE: Realistic AMM price impact for memecoin volatility
// ============================================================================

/**
 * Estimate realistic slippage (in basis points) based on trade size vs liquidity.
 * For constant-product AMMs, impact ≈ (tradeSize / liquidity) * factor.
 * Memecoins have thin liquidity, so even small trades cause large moves.
 *
 * Examples:
 *   $10 trade / $2K liquidity  → ~75 bps  (0.75%)
 *   $50 trade / $2K liquidity  → ~375 bps (3.75%)
 *   $100 trade / $500 liquidity → ~3000 bps (30%)
 *   $500 trade / $1K liquidity  → ~7500 bps (75%)
 */
function estimateSlippageBps(tradeSizeUsd: number, liquidityUsd: number): number {
  if (liquidityUsd <= 0) return 9900; // 99% — essentially no liquidity
  const ratio = tradeSizeUsd / liquidityUsd;
  // AMM curve approximation: impact grows linearly with ratio for small trades,
  // then accelerates. Multiply by 150 to get realistic memecoin behavior.
  const slippageBps = Math.round(ratio * 150 * 100);
  return Math.min(9900, Math.max(50, slippageBps)); // clamp 0.5% … 99%
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

async function fetchBirdeye(endpoint: string, chain: string = 'solana'): Promise<Response | null> {
  const headers: Record<string, string> = {
    'accept': 'application/json',
    'x-chain': chain,
  };
  if (process.env.BIRDEYE_API_KEY) {
    headers['X-API-KEY'] = process.env.BIRDEYE_API_KEY;
  }
  return fetchWithCircuitBreaker(
    'birdeye',
    `https://public-api.birdeye.so${endpoint}`,
    API_TIMEOUTS.birdeye,
    { headers }
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
const fetchSolPrice = getSolPrice;

// Helper to find the best (highest liquidity) pair from DexScreener pairs array
// This ensures we get the most accurate price from the most liquid market
function findBestPair(pairs: any[], tokenAddress: string, chain: string): any | null {
  if (!pairs || pairs.length === 0) return null;

  const chainId = chain === 'base' ? 'base' : 'solana';

  // Filter for pairs matching this token on the specified chain
  const matchedPairs = pairs.filter((pair: any) =>
    pair.chainId === chainId &&
    pair.baseToken?.address === tokenAddress &&
    pair.priceNative
  );

  if (matchedPairs.length === 0) return null;

  // Sort by liquidity (USD) descending - highest liquidity = most accurate price
  matchedPairs.sort((a: any, b: any) => {
    const liquidityA = parseFloat(a.liquidity?.usd || '0');
    const liquidityB = parseFloat(b.liquidity?.usd || '0');
    return liquidityB - liquidityA;
  });

  return matchedPairs[0]; // Return highest liquidity pair
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
    const dexResponse = await fetchWithTimeout(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(tokenAddress)}`, 3000);
    if (dexResponse.ok) {
      const dexData = await dexResponse.json();
      const solanaPair = findBestPair(dexData.pairs, tokenAddress, 'solana');

      if (solanaPair && solanaPair.priceNative) {
        // ✅ PRECISION FIX: Parse without float math
        const priceLamports = Number(parseDecimalToNative(solanaPair.priceNative, 9));
        const decimals = solanaPair.baseToken?.decimals ?? 6;
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
  fetchedAt?: number;
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

    return result ? { ...result, isCached: false, fetchedAt: result.fetchedAt } : null;
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
      const solanaPair = findBestPair(dexData.pairs, tokenAddress, 'solana');

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

  app.get('/api/health', healthLimiter, async (req, res) => {
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

      // Validate at least one wallet address is provided
      if (!data.solanaWalletAddress && !data.baseWalletAddress) {
        return res.status(400).json({ error: 'At least one wallet address (Solana or Base) is required' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(data.password, 10);

      // Handle referral code if provided
      const { referralCode, walletAddress } = data;
      let referrerId: string | undefined;
      if (referralCode) {
        const referrer = await storage.getUserByUsername(referralCode);
        if (referrer && referrer.username !== data.username) {
          referrerId = referrer.id;
        }
      }

      // Create user
      const user = await storage.createUser({
        ...data,
        password: hashedPassword,
        walletAddress: walletAddress || data.solanaWalletAddress,
      });

      // Apply referral bonus if valid referrer
      if (referrerId) {
        try {
          await storage.createReferral(referrerId, user.id, referralCode!);
          // Referee gets +1 ETH Base balance
          await storage.updateUserBalance(user.id, WEI_PER_ETH, 'base');
        } catch (e) {
          console.error('Referral creation error:', e);
        }
      }

      // Update last login and set initial token version
      const clientIp = sanitizeIp(req.ip || req.headers['x-forwarded-for']);
      await storage.updateLastLogin(user.id, clientIp);

      // Generate token with tokenVersion
      const token = jwt.sign(
        { id: user.id, username: user.username, tokenVersion: user.tokenVersion },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Set HttpOnly cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        path: '/api',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });

      // Set CSRF double-submit cookie
      const csrfToken = crypto.randomBytes(32).toString('hex');
      res.cookie('csrfToken', csrfToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        path: '/',
        maxAge: 24 * 60 * 60 * 1000
      });

      // Return user without password
      const { password, ...userWithoutPassword } = user;
      res.status(201).json(serializeBigInts({ user: userWithoutPassword }));
    } catch (error: any) {
      console.error('Registration error:', error?.message || String(error));
      const isDev = process.env.NODE_ENV === 'development';
      let message = 'Registration failed';
      if (error.errors && Array.isArray(error.errors)) {
        message = error.errors[0]?.message || message;
      } else if (isDev && error.message) {
        message = error.message;
      }
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
      const { email, username } = req.body;
      console.log('🔐 Login attempt');

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

      // Increment token version and update last login
      const clientIp = sanitizeIp(req.ip || req.headers['x-forwarded-for']);
      const updatedUser = await storage.updateLastLogin(user.id, clientIp);
      const userWithNewVersion = await storage.incrementTokenVersion(user.id);
      const tokenVersion = userWithNewVersion?.tokenVersion ?? (updatedUser?.tokenVersion ?? 0) + 1;

      const token = jwt.sign(
        { id: user.id, username: user.username, tokenVersion },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Set HttpOnly cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        path: '/api',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });

      // Set CSRF double-submit cookie
      const csrfToken = crypto.randomBytes(32).toString('hex');
      res.cookie('csrfToken', csrfToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        path: '/',
        maxAge: 24 * 60 * 60 * 1000
      });

      const { password: _, ...userWithoutPassword } = user;
      res.json(serializeBigInts({ user: userWithoutPassword }));
    } catch (error: any) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.post('/api/auth/logout', authenticateToken, async (req, res) => {
    try {
      await storage.incrementTokenVersion(req.userId!);
      res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        path: '/api'
      });
      console.log('✅ User logged out, cookie cleared');
      res.json({ message: 'Logged out successfully' });
    } catch (error: any) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Logout failed' });
    }
  });

  // POST /api/auth/logout-all — invalidate all existing sessions
  app.post('/api/auth/logout-all', authenticateToken, async (req, res) => {
    try {
      await storage.incrementTokenVersion(req.userId!);
      res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        path: '/api'
      });
      res.json({ message: 'All sessions logged out successfully' });
    } catch (error: any) {
      console.error('Logout-all error:', error);
      res.status(500).json({ error: 'Failed to log out all sessions' });
    }
  });

  // GET /api/auth/me/sessions — return current session info
  app.get('/api/auth/me/sessions', authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUserById(req.userId!);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const userAgent = req.headers['user-agent'] || 'Unknown';
      const ip = sanitizeIp(req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress);

      // Simple device detection from user agent
      const device = userAgent.includes('Mobile')
        ? 'Mobile'
        : userAgent.includes('Mac')
          ? 'Mac'
          : userAgent.includes('Windows')
            ? 'Windows'
            : userAgent.includes('Linux')
              ? 'Linux'
              : 'Unknown';

      res.json({
        current: {
          device,
          browser: userAgent.split(' ')[0] || 'Unknown',
          ip: String(ip).split(',')[0].trim(),
          loginAt: user.lastLoginAt,
        },
        tokenVersion: user.tokenVersion,
      });
    } catch (error: any) {
      console.error('Get sessions error:', error);
      res.status(500).json({ error: 'Failed to fetch session info' });
    }
  });

  // Get current SOL price (cached, refreshes every 30 seconds)
  app.get('/api/solana/price', async (req, res) => {
    try {
      const price = await fetchSolPrice();

      // ✅ FIX #6: Return proper error when price unavailable (no hardcoded fallback!)
      if (price === null) {
        return res.status(503).json({
          error: 'SOL price temporarily unavailable',
          available: false,
          retryAfter: 30, // Suggest retry in 30 seconds
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

  // Get current ETH price (for Base chain)
  app.get('/api/base/price', async (req, res) => {
    try {
      const price = await fetchEthPrice();

      if (price === null) {
        return res.status(503).json({
          error: 'ETH price temporarily unavailable',
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
      console.error('ETH price fetch error:', error);
      res.status(503).json({
        error: 'Could not fetch ETH price',
        available: false,
        retryAfter: 30,
      });
    }
  });

  // Unified native prices endpoint (ETH + SOL)
  app.get('/api/market/native-prices', async (req, res) => {
    try {
      // Populate cache before reading — on fresh server start the cache is empty
      await getNativePrice('solana');
      await getNativePrice('base');
      const detailed = getAllNativePricesDetailed();

      const eth = detailed.eth;
      const sol = detailed.sol;

      // If both are unavailable, return 503
      if (eth.usd === null && sol.usd === null) {
        return res.status(503).json({
          error: 'Native prices temporarily unavailable',
          available: false,
          retryAfter: 30,
        });
      }

      res.json({
        eth: {
          usd: eth.usd,
          source: eth.source,
          timestamp: eth.timestamp,
        },
        sol: {
          usd: sol.usd,
          source: sol.source,
          timestamp: sol.timestamp,
        },
      });
    } catch (error: any) {
      console.error('Native prices fetch error:', error);
      res.status(503).json({
        error: 'Could not fetch native prices',
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
      const { username, solanaWalletAddress, baseWalletAddress, preferredChain, password } = req.body;
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

      if (solanaWalletAddress) {
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(solanaWalletAddress)) {
          return res.status(400).json({ error: 'Invalid Solana wallet address' });
        }
        updates.solanaWalletAddress = solanaWalletAddress;
        updates.walletAddress = solanaWalletAddress; // Legacy compatibility
      }

      if (baseWalletAddress) {
        if (!/^0x[a-fA-F0-9]{40}$/.test(baseWalletAddress)) {
          return res.status(400).json({ error: 'Invalid Base wallet address' });
        }
        updates.baseWalletAddress = baseWalletAddress;
      }

      if (preferredChain) {
        if (!['base', 'solana'].includes(preferredChain)) {
          return res.status(400).json({ error: 'Invalid chain. Must be "base" or "solana"' });
        }
        updates.preferredChain = preferredChain;
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

    // Development: BOT_API_SECRET is required even in dev for security
    console.error('❌ FATAL: BOT_API_SECRET must be set (min 20 chars)');
    throw new Error('BOT_API_SECRET required');
  })();

  const timingSafeEqualString = (a: string, b: string): boolean => {
    try {
      const bufA = Buffer.from(a, 'utf8');
      const bufB = Buffer.from(b, 'utf8');
      if (bufA.length !== bufB.length) return false;
      return crypto.timingSafeEqual(bufA, bufB);
    } catch {
      return false;
    }
  };

  const verifyBotSecret = (req: any, res: any, next: any) => {
    const botSecret = req.headers['x-bot-secret'];

    if (process.env.NODE_ENV === 'production') {
      // Production: BOT_API_SECRET is required with minimum length
      if (!process.env.BOT_API_SECRET || process.env.BOT_API_SECRET.length < 20) {
        console.error('❌ FATAL: BOT_API_SECRET must be set in production (min 20 chars)');
        return res.status(500).json({ error: 'Server misconfiguration - bot endpoints disabled' });
      }
    }

    if (!botSecret || !timingSafeEqualString(botSecret, DEV_BOT_SECRET)) {
      return res.status(403).json({ error: 'Forbidden - Invalid bot secret' });
    }

    next();
  };

  // Telegram registration endpoint
  app.post('/api/telegram/auth/register', botLimiter, verifyBotSecret, async (req, res) => {
    try {
      const { email, username, password, solanaWalletAddress, baseWalletAddress } = req.body;

      // Validate inputs
      if (!email || !username || !password) {
        return res.status(400).json({ error: 'Email, username, and password are required' });
      }

      // At least one wallet address is required (same as web app)
      const hasSolana = solanaWalletAddress && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(solanaWalletAddress);
      const hasBase = baseWalletAddress && /^0x[a-fA-F0-9]{40}$/.test(baseWalletAddress);

      if (!hasSolana && !hasBase) {
        return res.status(400).json({ error: 'At least one valid wallet address (Solana or Base) is required' });
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

      // Create user with optional wallets
      const user = await storage.createUser({
        email,
        username,
        password: hashedPassword,
        preferredChain: 'solana',
        ...(hasSolana ? { solanaWalletAddress } : {}),
        ...(hasBase ? { baseWalletAddress } : {}),
      });

      // Update last login and generate token with tokenVersion
      const clientIp = sanitizeIp(req.ip || req.headers['x-forwarded-for']);
      await storage.updateLastLogin(user.id, clientIp);

      const token = jwt.sign(
        { id: user.id, username: user.username, tokenVersion: user.tokenVersion },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

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

      if (!identifier || !password) {
        console.warn('Missing email/username or password in login request');
        return res.status(400).json({ error: 'Email or username and password are required' });
      }

      // Try to find user by email first, then by username
      let user = await storage.getUserByEmail(identifier);

      if (!user && !identifier.includes('@')) {
        // If it doesn't look like an email and we didn't find it by email, try username
        user = await storage.getUserByUsername(identifier);
      }

      if (!user) {
        console.warn(`❌ Login failed: user not found`);
        return res.status(400).json({ error: 'Invalid credentials - user not found' });
      }

      // Check password
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        console.warn(`❌ Login failed: invalid password for user ${user.id}`);
        return res.status(400).json({ error: 'Invalid credentials - wrong password' });
      }

      // Increment token version and update last login
      const clientIp = sanitizeIp(req.ip || req.headers['x-forwarded-for']);
      const updatedUser = await storage.updateLastLogin(user.id, clientIp);
      const userWithNewVersion = await storage.incrementTokenVersion(user.id);
      const tokenVersion = userWithNewVersion?.tokenVersion ?? (updatedUser?.tokenVersion ?? 0) + 1;

      const token = jwt.sign(
        { id: user.id, username: user.username, tokenVersion },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

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
      const chainParam = req.query.chain as string | undefined;
      const chain = chainParam && isValidChain(chainParam) ? chainParam : undefined;
      const positions = await storage.getUserPositions(req.userId!, chain);

      // Fetch current prices for all unique tokens
      const uniqueTokenAddresses = positions.map(p => p.tokenAddress);
      const uniqueTokens = Array.from(new Set(uniqueTokenAddresses));
      const priceMap = new Map<string, bigint>();

      let pricesFetchedAt: number | null = null;

      if (uniqueTokens.length > 0) {
        try {
          // Fetch prices from DexScreener in batches of 30
          const batchSize = 30;
          for (let i = 0; i < uniqueTokens.length; i += batchSize) {
            const batch = uniqueTokens.slice(i, i + batchSize);
            const addressesParam = batch.join(',');

            const dexResponse = await fetchWithTimeout(
              `https://api.dexscreener.com/latest/dex/tokens/${addressesParam}`,
              4000  // ✅ REDUCED: 4s timeout (was 8s) for faster portfolio refresh
            );

            if (dexResponse.ok) {
              const dexData = await dexResponse.json();
              const pairs = dexData.pairs || [];
              pricesFetchedAt = Date.now();

              // Build price map using best (highest liquidity) pair for each token
              // Group by chain to avoid cross-chain confusion
              const tokenChainMap = new Map<string, string>();
              for (const p of positions) {
                if (!tokenChainMap.has(p.tokenAddress)) {
                  tokenChainMap.set(p.tokenAddress, p.chain);
                }
              }
              for (const tokenAddr of batch) {
                const tokenChain = tokenChainMap.get(tokenAddr) || 'solana';
                const bestPair = findBestPair(pairs, tokenAddr, tokenChain);
                if (bestPair && bestPair.priceNative) {
                  // ✅ PRECISION FIX: Parse without float math
                  const nativeDecimals = tokenChain === 'solana' ? 9 : 18;
                  const priceNative = parseDecimalToNative(bestPair.priceNative, nativeDecimals);
                  if (priceNative > 0n) {
                    priceMap.set(tokenAddr, priceNative);
                  }
                }
              }
            }
          }
          console.log(`📊 Fetched ${priceMap.size} token profiles from DexScreener`);

          // ✅ BIRDEYE: Fetch real-time prices for Base tokens (prefer over DexScreener)
          const basePositions = positions.filter(p => p.chain === 'base');
          const baseTokenAddresses = Array.from(new Set(basePositions.map(p => p.tokenAddress)));
          if (baseTokenAddresses.length > 0) {
            console.log(`🔭 Fetching Birdeye prices for ${baseTokenAddresses.length} Base tokens...`);
            for (const tokenAddr of baseTokenAddresses) {
              try {
                const birdeyeData = await fetchBirdeyeTokenData(tokenAddr, 'base');
                if (birdeyeData && birdeyeData.priceNative > 0n) {
                  priceMap.set(tokenAddr, birdeyeData.priceNative);
                  pricesFetchedAt = Date.now();
                  console.log(`   Birdeye override for ${tokenAddr.slice(0, 8)}: $${(Number(birdeyeData.priceNative) / 1e18).toExponential(4)} ETH`);
                }
              } catch (e: any) {
                // Keep DexScreener price if Birdeye fails
              }
            }
          }
        } catch (error) {
          console.warn('⚠️  Failed to fetch current prices for positions:', error);
        }
      }

      // Enrich positions with current prices and recalculate current value
      // CRITICAL: Use fresh prices from DexScreener, never fall back to entryPrice
      const enrichedPositions = positions.map(p => {
        const freshPrice = priceMap.get(p.tokenAddress);
        const priceToUse = freshPrice !== undefined ? freshPrice : p.entryPrice; // Use entry price as fallback only
        const priceIsFresh = freshPrice !== undefined;
        const priceAgeMs = priceIsFresh && pricesFetchedAt ? Date.now() - pricesFetchedAt : -1;

        // ✅ Recalculate current value based on FRESH price, not stale DB value
        const decimals = p.decimals ?? 6;
        const divisor = BigInt(10) ** BigInt(decimals);
        const amountBigInt = BigInt(p.amount);
        const priceBigInt = BigInt(priceToUse);
        const recalculatedValue = (amountBigInt * priceBigInt) / divisor;

        return {
          ...p,
          currentPrice: priceToUse, // Fresh price (or entry as last resort)
          currentValue: recalculatedValue, // ✅ Recalculated with fresh price
          priceIsFresh,
          priceAgeMs,
          priceWarning: priceAgeMs > 15000 ? 'stale' : null, // >15s old = stale
        };
      });

      // Debug logging for price freshness
      console.log(`📊 Position enrichment - ${enrichedPositions.length} positions updated with fresh prices`);
      enrichedPositions.forEach(p => {
        const isBase = p.chain === 'base';
        const displayPrice = isBase
          ? Number(p.currentPrice) / Number(10n ** 18n)
          : Number(p.currentPrice) / 1_000_000_000;
        const ageStr = p.priceAgeMs >= 0 ? `${p.priceAgeMs}ms` : 'fallback';
        console.log(`   ${p.tokenSymbol}: fresh=${p.priceIsFresh}, age=${ageStr}, price=${isBase ? displayPrice.toFixed(18) : displayPrice.toFixed(9)} ${isBase ? 'ETH' : 'SOL'}`);
      });

      res.json(serializeBigInts({ positions: enrichedPositions, pricesFetchedAt }));
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

      const { tokenAddress, tokenName, tokenSymbol, amount, chain } = req.body;
      // NOTE: Client 'price' is intentionally IGNORED for execution

      // ✅ INPUT VALIDATION
      if (!tokenAddress || !tokenName || !tokenSymbol || !chain) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      if (tokenName.length > 128 || tokenSymbol.length > 32) {
        return res.status(400).json({ error: 'Token name or symbol too long' });
      }

      if (!isValidChain(chain)) {
        return res.status(400).json({ error: 'Invalid chain. Must be "solana" or "base"' });
      }

      if (!isValidChainAddress(chain, tokenAddress)) {
        return res.status(400).json({ error: `Invalid ${chain} token address format` });
      }

      const chainConfig = CHAIN_CONFIG[chain];

      // ✅ PRECISION FIX: Parse native amount without floating-point math
      let nativeSpent: bigint;
      try {
        nativeSpent = parseNativeAmount(amount, chainConfig.nativeDecimals);
        validateTradeAmountForChain(nativeSpent, chain);
      } catch (e: any) {
        return res.status(400).json({ error: e.message || `Invalid ${chainConfig.nativeSymbol} amount` });
      }

      const user = await storage.getUserById(req.userId!);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Pre-check balance (will be verified atomically in transaction too)
      const userBalance = chain === 'solana' ? user.balance : user.baseBalance;
      if (userBalance < nativeSpent) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      // ✅ ANTI-CHEAT: Fetch price BEFORE transaction (no external calls in tx)
      // For Solana with Jupiter: try Jupiter quote FIRST, then validate with DexScreener
      // For Base: fetch DexScreener directly (no Jupiter)
      let executionPriceNative: bigint = 0n;
      let tokenAmount: bigint = 0n;
      let decimals = chain === 'base' ? 18 : 6;
      let liquidityUsd = 0;
      let volume24hUsd = 0;
      let priceSource = 'unknown';
      let usedJupiter = false;

      // ── SOLANA: Jupiter as PRIMARY ──
      if (chain === 'solana' && jupiterService.isConfigured()) {
        try {
          const jupQuote = await jupiterService.getOrderQuote(
            SOL_MINT,
            tokenAddress,
            nativeSpent.toString()
          );
          if (jupQuote && jupQuote.outAmount) {
            tokenAmount = BigInt(jupQuote.outAmount);
            // Still need decimals for DB storage — fetch from DexScreener or Jupiter token API
            const jupToken = await jupiterService.getToken(tokenAddress);
            decimals = jupToken?.decimals ?? 6;
            validateDecimals(decimals);
            const decimalMultiplier = BigInt(10 ** decimals);
            executionPriceNative = tokenAmount > 0n
              ? (nativeSpent * decimalMultiplier) / tokenAmount
              : 0n;
            usedJupiter = true;
            priceSource = 'jupiter';
            console.log(`💰 Jupiter execution on ${chain}: outAmount=${jupQuote.outAmount}, derivedPrice=${executionPriceNative.toString()}`);
          }
        } catch (e: any) {
          console.warn('⚠️  Jupiter buy quote failed, will fall back to DexScreener:', e.message);
        }
      }

      // ── FALLBACK: Birdeye (Base) or DexScreener (Solana fallback) ──
      if (!usedJupiter) {
        let currentTokenData = null;

        // Base chain: try Birdeye FIRST for real-time price + liquidity
        if (chain === 'base') {
          currentTokenData = await fetchBirdeyeTokenData(tokenAddress, chain);
          if (currentTokenData) {
            priceSource = 'birdeye';
            console.log(`[Buy] Birdeye primary for Base: ${tokenAddress.slice(0, 8)}`);
          }
        }

        // Solana fallback OR Birdeye failed: use DexScreener
        if (!currentTokenData) {
          currentTokenData = await fetchDexScreenerPriceForChain(tokenAddress, chain);
          if (currentTokenData) {
            priceSource = 'dexscreener';
            console.log(`[Buy] DexScreener fallback for ${chain}: ${tokenAddress.slice(0, 8)}`);
          }
        }

        if (!currentTokenData || !currentTokenData.priceNative) {
          return res.status(400).json({ error: 'Could not fetch token price. Try again.' });
        }

        decimals = currentTokenData.decimals ?? decimals;
        liquidityUsd = currentTokenData.liquidityUsd || 0;
        volume24hUsd = currentTokenData.volume24hUsd || 0;

        // ✅ ANTI-MANIPULATION: Check minimum liquidity requirements
        if (!meetsLiquidityRequirements(liquidityUsd, volume24hUsd)) {
          console.log(`⚠️ Token ${tokenSymbol} rejected: liquidity=$${liquidityUsd}, volume=$${volume24hUsd}`);
          return res.status(400).json({
            error: `Token does not meet minimum liquidity requirements ($${MIN_LIQUIDITY_USD} liquidity, $${MIN_VOLUME_24H_USD} 24h volume)`,
            liquidityUsd,
            volume24hUsd,
          });
        }

        // ✅ DYNAMIC SLIPPAGE: Realistic AMM impact for memecoins
        const nativePriceUsd = chain === 'solana'
          ? (await getCachedSolPrice() ?? 0)
          : (await getCachedNativePrice('base') ?? 0);
        const tradeSizeUsd = nativePriceUsd > 0
          ? Number(nativeSpent) / (chain === 'solana' ? 1e9 : 1e18) * nativePriceUsd
          : 0;
        const slippageBps = estimateSlippageBps(tradeSizeUsd, liquidityUsd);
        const slippageMultiplier = 10000n + BigInt(slippageBps);
        executionPriceNative = (currentTokenData.priceNative * slippageMultiplier) / 10000n;

        console.log(`💰 Server-side execution (ANTI-CHEAT) on ${chain}:`);
        console.log(`   ${priceSource} price: ${currentTokenData.priceNative.toString()} native units/token`);
        console.log(`   Liquidity: $${liquidityUsd.toFixed(0)} | Trade: ~$${tradeSizeUsd.toFixed(2)}`);
        console.log(`   Dynamic slippage: ${(slippageBps / 100).toFixed(2)}%`);
        console.log(`   Execution price: ${executionPriceNative.toString()} native units/token`);

        validateDecimals(decimals);
        const decimalMultiplier = BigInt(10 ** decimals);
        tokenAmount = (nativeSpent * decimalMultiplier) / executionPriceNative;
      } else {
        // Jupiter succeeded — still validate token exists via liquidity check
        let check = null;
        if (chain === 'base') {
          check = await fetchBirdeyeTokenData(tokenAddress, chain);
        }
        if (!check) {
          check = await fetchDexScreenerPriceForChain(tokenAddress, chain);
        }
        if (!check) {
          console.log(`⚠️ Token ${tokenSymbol} rejected post-Jupiter: liquidity verification unavailable`);
          return res.status(400).json({
            error: 'Liquidity verification temporarily unavailable. Please try again.',
          });
        }
        liquidityUsd = check.liquidityUsd;
        volume24hUsd = check.volume24hUsd;
        if (!meetsLiquidityRequirements(liquidityUsd, volume24hUsd)) {
          console.log(`⚠️ Token ${tokenSymbol} rejected post-Jupiter: liquidity=$${liquidityUsd}`);
          return res.status(400).json({
            error: `Token does not meet minimum liquidity requirements ($${MIN_LIQUIDITY_USD} liquidity, $${MIN_VOLUME_24H_USD} 24h volume)`,
            liquidityUsd,
            volume24hUsd,
          });
        }
      }

      // ✅ GUARD: Reject dust trades that would give < 1 base unit of tokens
      if (tokenAmount < 1n) {
        return res.status(400).json({
          error: `Trade amount too small for this token price. You would receive less than 1 base unit of tokens. Try a larger ${chainConfig.nativeSymbol} amount.`,
          priceNative: executionPriceNative.toString(),
          nativeSpent: nativeSpent.toString(),
        });
      }

      const tokensDisplay = Number(tokenAmount) / (10 ** decimals);
      const nativeDisplay = Number(nativeSpent) / (10 ** chainConfig.nativeDecimals);
      console.log(`📊 Buy: ${nativeDisplay} ${chainConfig.nativeSymbol} → ${tokensDisplay.toFixed(6)} tokens`);

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

        console.log(`✅ POSITION CREATED: ${tokenSymbol} on ${chain} (ID: ${position.id})`);

        const newUser = await storage.getUserById(req.userId!);
        const newBalance = chain === 'solana' ? newUser!.balance : newUser!.baseBalance;

        // ✅ IDEMPOTENCY: Cache successful response
        const successResponse = {
          message: 'Position processed successfully',
          positionId: position.id,
          newBalance: newBalance.toString(),
          tokensReceived: tokenAmount.toString(),
          executionPrice: executionPriceNative.toString(),
          chain,
          priceSource,
          liquidityUsd,
          volume24hUsd,
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

      const { positionId, amountLamports, chain } = req.body as any;
      // NOTE: Client exitPriceLamports is intentionally IGNORED

      if (!positionId) {
        return res.status(400).json({ error: 'Position ID required' });
      }

      const position = await storage.getPositionById(positionId);
      if (!position || position.userId !== req.userId) {
        return res.status(404).json({ error: 'Position not found' });
      }

      // Hydrated positions store amount/solSpent as bigint at runtime, but schema types them as string.
      // Cast to bigint for correct arithmetic.
      const positionAmount = position.amount as unknown as bigint;
      const positionSolSpent = position.solSpent as unknown as bigint;

      // Use position's chain if not provided in request
      const positionChain = chain || position.chain || 'solana';
      if (!isValidChain(positionChain)) {
        return res.status(400).json({ error: 'Invalid chain' });
      }

      // ✅ FIX: Determine sell type upfront
      // If no amountLamports provided, it's a FULL SELL - use exact position amount
      // If amountLamports provided, it's a PARTIAL SELL
      let isFullSell = !amountLamports;
      let sellAmount: bigint;

      if (isFullSell) {
        // Full sell: use exact position amount (client cannot influence)
        sellAmount = positionAmount;
      } else {
        // Partial sell: validate client-provided amount
        try {
          sellAmount = safeBigInt(amountLamports);
        } catch {
          return res.status(400).json({ error: 'Invalid sell amount format' });
        }

        if (sellAmount <= 0n) {
          return res.status(400).json({ error: 'Sell amount must be positive' });
        }

        if (sellAmount >= positionAmount) {
          // If trying to sell full amount via partial endpoint, convert to full sell
          sellAmount = positionAmount;
          isFullSell = true; // ✅ FIX: Update flag so storage layer uses exact equality
        }
      }

      // ✅ ANTI-CHEAT: Fetch price BEFORE transaction (no external calls in tx)
      // For Solana with Jupiter: try Jupiter quote FIRST
      const decimals = position.decimals ?? (positionChain === 'base' ? 18 : 6);
      validateDecimals(decimals);
      const decimalDivisor = BigInt(10 ** decimals);
      let executionPriceNative: bigint = 0n;
      let nativeReceived: bigint = 0n;
      let priceSource = 'unknown';
      let usedJupiter = false;

      // ── SOLANA: Jupiter as PRIMARY ──
      if (positionChain === 'solana' && jupiterService.isConfigured()) {
        try {
          const jupQuote = await jupiterService.getOrderQuote(
            position.tokenAddress,
            SOL_MINT,
            sellAmount.toString()
          );
          if (jupQuote && jupQuote.outAmount) {
            nativeReceived = BigInt(jupQuote.outAmount);
            executionPriceNative = sellAmount > 0n
              ? (nativeReceived * decimalDivisor) / sellAmount
              : 0n;
            usedJupiter = true;
            priceSource = 'jupiter';
            console.log(`💰 Jupiter sell execution on ${positionChain}: outAmount=${jupQuote.outAmount}, derivedPrice=${executionPriceNative!.toString()}`);
          }
        } catch (e: any) {
          console.warn('⚠️  Jupiter sell quote failed, will fall back to DexScreener:', e.message);
        }
      }

      // ── FALLBACK: Birdeye (Base) or DexScreener (Solana fallback) ──
      if (!usedJupiter) {
        let currentTokenData = null;

        // Base chain: try Birdeye FIRST for real-time price
        if (positionChain === 'base') {
          currentTokenData = await fetchBirdeyeTokenData(position.tokenAddress, positionChain as Chain);
          if (currentTokenData) {
            priceSource = 'birdeye';
            console.log(`[Sell] Birdeye primary for Base: ${position.tokenAddress.slice(0, 8)}`);
          }
        }

        // Solana fallback OR Birdeye failed: use DexScreener
        if (!currentTokenData) {
          currentTokenData = await fetchDexScreenerPriceForChain(position.tokenAddress, positionChain as Chain);
          if (currentTokenData) {
            priceSource = 'dexscreener';
            console.log(`[Sell] DexScreener fallback for ${positionChain}: ${position.tokenAddress.slice(0, 8)}`);
          }
        }

        if (!currentTokenData || !currentTokenData.priceNative) {
          return res.status(400).json({ error: 'Could not fetch token price. Try again.' });
        }

        // ✅ DYNAMIC SLIPPAGE: Realistic sell impact (sells push price DOWN)
        const nativePriceUsd = positionChain === 'solana'
          ? (await getCachedSolPrice() ?? 0)
          : (await getCachedNativePrice('base') ?? 0);
        const positionValueUsd = nativePriceUsd > 0
          ? Number(positionSolSpent) / (positionChain === 'solana' ? 1e9 : 1e18) * nativePriceUsd
          : 0;
        // Use position value as proxy for liquidity if data liquidity is missing
        const sellValueUsd = positionValueUsd * (Number(sellAmount) / Number(positionAmount));
        const liquidityUsd = currentTokenData.liquidityUsd || positionValueUsd || 1;
        const slippageBps = estimateSlippageBps(sellValueUsd, liquidityUsd);
        const slippageMultiplier = 10000n - BigInt(slippageBps);
        executionPriceNative = (currentTokenData.priceNative * slippageMultiplier) / 10000n;

        console.log(`💰 Server-side sell execution (ANTI-CHEAT) on ${positionChain}:`);
        console.log(`   ${priceSource} price: ${currentTokenData.priceNative.toString()} native units/token`);
        console.log(`   Liquidity: $${liquidityUsd.toFixed(0)} | Sell value: ~$${sellValueUsd.toFixed(2)}`);
        console.log(`   Dynamic slippage: ${(slippageBps / 100).toFixed(2)}%`);
        console.log(`   Execution price: ${executionPriceNative.toString()} native units/token`);

        nativeReceived = (sellAmount * executionPriceNative) / decimalDivisor;
      }

      // Calculate profit/loss
      const proportionalCost = (positionSolSpent * sellAmount) / positionAmount;
      const profitLoss = nativeReceived! - proportionalCost;

      const chainConfig = CHAIN_CONFIG[positionChain as Chain];

      // ✅ GUARD: Reject sell if output is less than 1 wei/lamport (would return 0)
      if (nativeReceived < 1n) {
        return res.status(400).json({
          error: `Position too small to sell. Your ${Number(sellAmount) / (10 ** decimals)} tokens are worth less than 1 ${chainConfig.nativeSymbol} at current price.`,
          positionAmount: sellAmount.toString(),
          executionPrice: executionPriceNative.toString(),
          estimatedValue: nativeReceived.toString(),
        });
      }
      console.log(`📊 Sell (${isFullSell ? 'FULL' : 'PARTIAL'}): ${Number(sellAmount) / (10 ** decimals)} tokens → ${Number(nativeReceived) / (10 ** chainConfig.nativeDecimals)} ${chainConfig.nativeSymbol} on ${positionChain}`);

      // Execute atomic trade with server-side price
      await storage.executeSellTrade({
        userId: req.userId!,
        positionId,
        sellAmount,
        exitPrice: executionPriceNative,
        nativeReceived,
        profitLoss,
        proportionalCost,
        isFullSell,
      });

      // Check achievements and referrals asynchronously (don't block response)
      const chainForAchievements = positionChain as Chain;
      achievementEngine.runAllChecks(req.userId!, chainForAchievements).catch(console.error);
      achievementEngine.checkGreenDay(req.userId!).catch(console.error);

      // Convert referral if this is the user's first trade on any chain
      const tradeChain = positionChain as Chain;
      storage.getReferralByReferee(req.userId!).then(async (referral) => {
        if (referral && referral.status === 'pending' && !referral.rewardClaimed) {
          const tradeCount = await storage.getUserTradesCount(req.userId!, tradeChain);
          if (tradeCount >= 1) {
            const converted = await storage.convertReferral(req.userId!);
            if (converted) {
              // Referrer gets +0.5 native token on the chain where the trade happened
              await storage.updateUserBalance(referral.referrerId, WEI_PER_ETH / 2n, tradeChain);
            }
          }
        }
      }).catch(console.error);

      // ✅ IDEMPOTENCY: Cache successful response
      const successResponse = {
        message: 'Position closed successfully',
        profitLoss: profitLoss.toString(),
        nativeReceived: nativeReceived.toString(),
        executionPrice: executionPriceNative.toString(),
        chain: positionChain,
        priceSource,
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

  // sell-all removed — users can sell positions individually via /api/trades/sell


  app.get('/api/trades/history', authenticateToken, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = 50;
      const offset = (page - 1) * limit;
      
      const chainParam = req.query.chain as string | undefined;
      const chain = chainParam && isValidChain(chainParam) ? chainParam : undefined;

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
  // Watchlist Routes (Phase 9)
  // ============================================================================

  app.get('/api/watchlist', authenticateToken, publicApiLimiter, async (req, res) => {
    try {
      const chainParam = req.query.chain as string | undefined;
      const chain = chainParam && isValidChain(chainParam) ? chainParam as Chain : undefined;
      const items = await storage.getUserWatchlist(req.userId!, chain);
      res.json(serializeBigInts({ items }));
    } catch (error: any) {
      console.error('Get watchlist error:', error);
      res.status(500).json({ error: 'Could not fetch watchlist' });
    }
  });

  app.post('/api/watchlist', authenticateToken, userTradeLimiter, async (req, res) => {
    try {
      const { chain, tokenAddress, tokenName, tokenSymbol, decimals } = req.body;
      if (!chain || !tokenAddress || !tokenName || !tokenSymbol) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      if (!isValidChain(chain)) {
        return res.status(400).json({ error: 'Invalid chain' });
      }
      const item = await storage.addToWatchlist(req.userId!, {
        chain,
        tokenAddress,
        tokenName,
        tokenSymbol,
        decimals: decimals ?? 6,
      });
      res.status(201).json(serializeBigInts({ item }));
    } catch (error: any) {
      console.error('Add to watchlist error:', error);
      res.status(500).json({ error: 'Could not add to watchlist' });
    }
  });

  app.delete('/api/watchlist/:id', authenticateToken, userTradeLimiter, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.removeFromWatchlist(req.userId!, id);
      res.json({ message: 'Removed from watchlist' });
    } catch (error: any) {
      console.error('Remove from watchlist error:', error);
      res.status(500).json({ error: 'Could not remove from watchlist' });
    }
  });

  // ============================================================================
  // Community Alpha / Voting (Phase 6)
  // ============================================================================

  // GET /api/community-picks?chain=&sort=
  app.get('/api/community-picks', publicApiLimiter, async (req, res) => {
    try {
      const chainParam = req.query.chain as string | undefined;
      const chain = chainParam && isValidChain(chainParam) ? chainParam as Chain : undefined;
      const sortBy = (req.query.sort as string) === 'new' ? 'new' : 'votes';
      const userId = (req as any).userId;

      const picks = await storage.getCommunityPicks(chain, sortBy, userId);
      res.json({ picks });
    } catch (error: any) {
      console.error('Get community picks error:', error);
      res.status(500).json({ error: 'Could not fetch community picks' });
    }
  });

  // POST /api/community-picks
  app.post('/api/community-picks', authenticateToken, userTradeLimiter, async (req, res) => {
    try {
      const { chain, tokenAddress, tokenName, tokenSymbol, reason } = req.body;
      if (!chain || !tokenAddress || !tokenName || !tokenSymbol) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      if (!isValidChain(chain)) {
        return res.status(400).json({ error: 'Invalid chain' });
      }

      const pick = await storage.createCommunityPick(req.userId!, {
        chain,
        tokenAddress,
        tokenName,
        tokenSymbol,
        reason,
      });
      res.status(201).json({ pick });
    } catch (error: any) {
      console.error('Create community pick error:', error);
      res.status(500).json({ error: 'Could not create community pick' });
    }
  });

  // DELETE /api/community-picks/:id
  app.delete('/api/community-picks/:id', authenticateToken, userTradeLimiter, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteCommunityPick(req.userId!, id);
      res.json({ message: 'Community pick deleted' });
    } catch (error: any) {
      console.error('Delete community pick error:', error);
      res.status(500).json({ error: 'Could not delete community pick' });
    }
  });

  // POST /api/community-picks/:id/vote
  app.post('/api/community-picks/:id/vote', authenticateToken, userTradeLimiter, async (req, res) => {
    try {
      const { id } = req.params;
      const result = await storage.voteOnPick(req.userId!, id);
      res.json(result);
    } catch (error: any) {
      console.error('Vote error:', error);
      res.status(500).json({ error: 'Could not vote on pick' });
    }
  });

  // DELETE /api/community-picks/:id/vote
  app.delete('/api/community-picks/:id/vote', authenticateToken, userTradeLimiter, async (req, res) => {
    try {
      const { id } = req.params;
      const result = await storage.removeVoteFromPick(req.userId!, id);
      res.json(result);
    } catch (error: any) {
      console.error('Remove vote error:', error);
      res.status(500).json({ error: 'Could not remove vote' });
    }
  });

  // ============================================================================
  // Token Routes
  // ============================================================================

  // IMPORTANT: Search route must come BEFORE :address route to avoid matching "search" as an address
  // Get trending tokens based on user activity (most bought/sold by user count)
  app.get('/api/trending', publicApiLimiter, async (req, res) => {
    try {
      const chainParam = (req.query.chain as string) || 'solana';
      
      if (!isValidChain(chainParam)) {
        return res.status(400).json({ error: 'Invalid chain. Must be "solana" or "base"' });
      }
      
      const chain = chainParam as Chain;
      
      // Get top tokens by number of unique users who bought them (filtered by chain)
      const buyActivity = await db
        .select({
          tokenAddress: positions.tokenAddress,
          tokenName: positions.tokenName,
          tokenSymbol: positions.tokenSymbol,
          decimals: positions.decimals,
          buyerCount: sql`COUNT(DISTINCT ${positions.userId})`.as('buyerCount'),
        })
        .from(positions)
        .where(sql`${positions.chain} = ${chain}`)
        .groupBy(positions.tokenAddress, positions.tokenName, positions.tokenSymbol, positions.decimals)
        .orderBy(sql`COUNT(DISTINCT ${positions.userId})`)
        .limit(30);

      // Get sell activity (users who closed positions) - filtered by chain
      const sellActivity = await db
        .select({
          tokenAddress: tradeHistory.tokenAddress,
          sellerCount: sql`COUNT(DISTINCT ${tradeHistory.userId})`.as('sellerCount'),
        })
        .from(tradeHistory)
        .where(sql`${tradeHistory.chain} = ${chain}`)
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
      const priceMap = new Map<string, string>();
      const chainId = chain === 'solana' ? 'solana' : 'base';
      const nativeDecimals = chain === 'solana' ? 9 : 18;

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
                // Find best pair for this chain
                const chainPairs = pairs.filter((p: any) => p.chainId === chainId && p.baseToken?.address === addr);
                if (chainPairs.length === 0) continue;
                
                const bestPair = chainPairs.reduce((best: any, current: any) => {
                  const bestLiq = best?.liquidity?.usd || 0;
                  const currentLiq = current?.liquidity?.usd || 0;
                  return currentLiq > bestLiq ? current : best;
                }, chainPairs[0]);
                
                if (bestPair && bestPair.priceNative) {
                  // ✅ PRECISION FIX: Parse without float math
                  const priceNative = parseDecimalToNativeUnits(bestPair.priceNative, nativeDecimals);
                  if (priceNative > 0n) {
                    priceMap.set(addr, priceNative.toString());
                  }
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
        currentPrice: priceMap.get(t.tokenAddress) || '0',
        chain,
      }));

      res.json({ trending: enrichedTrending });
    } catch (error: any) {
      console.error('Trending fetch error:', error);
      res.status(500).json({ error: 'Could not fetch trending tokens' });
    }
  });

  // Input sanitization helper
  function sanitizeSearchQuery(query: string): string {
    // Remove special characters that could be used for injection
    return query.replace(/[<>'"&]/g, '').trim();
  }

  app.get('/api/tokens/search', searchLimiter, async (req, res) => {
    try {
      const query = req.query.q as string || '';
      // Sanitize input to prevent injection attacks
      const searchTerm = sanitizeSearchQuery(query).toLowerCase();
      const chainParam = (req.query.chain as string) || 'solana';
      
      if (!isValidChain(chainParam)) {
        return res.status(400).json({ error: 'Invalid chain. Must be "solana" or "base"' });
      }
      
      const chain = chainParam as Chain;

      console.log(`🔍 Search request: "${searchTerm}" on ${chain}`);

      if (!searchTerm || searchTerm.length < 3) {
        return res.json({ results: [] });
      }

      const results: any[] = [];
      const chainId = chain === 'solana' ? 'solana' : 'base';

      // Search DexScreener API for token results
      try {
        // ✅ FIX: Use circuit breaker protected fetch
        const dexResponse = await fetchDexScreener(`/latest/dex/search/?q=${encodeURIComponent(searchTerm)}`);
        if (dexResponse?.ok) {
          const dexData = await dexResponse.json();

          // Filter for specified chain pairs only
          const chainPairs = dexData.pairs?.filter((pair: any) => pair.chainId === chainId) || [];
          console.log(`📊 DexScreener returned ${chainPairs.length} ${chain} pairs for "${searchTerm}"`);

          const nativeDecimals = chain === 'solana' ? 9 : 18;
          
          for (const pair of chainPairs.slice(0, 15)) {
            const tokenAddress = pair.baseToken?.address;
            if (!tokenAddress) continue;

            // Skip if already found
            if (results.some(r => r.tokenAddress === tokenAddress)) continue;

            // Use native price (already in native units) instead of USD price
            // ✅ PRECISION FIX: Parse without float math
            const priceNative = pair.priceNative 
              ? parseDecimalToNativeUnits(pair.priceNative, nativeDecimals).toString() 
              : '0';

            results.push({
              tokenAddress,
              name: pair.baseToken?.name || 'Unknown',
              symbol: pair.baseToken?.symbol || '???',
              marketCap: pair.marketCap || pair.fdv || 0,
              price: priceNative,
              icon: pair.info?.imageUrl,
              dexId: pair.dexId,
              volume24h: pair.volume?.h24 || 0,
              priceChange24h: pair.priceChange?.h24 || 0,
              chain,
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
          if (p.chainId !== chainId) continue;

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
      const { timeframe = '1M', chain = 'solana' } = req.query;
      const chainParam = isValidChain(chain as string) ? (chain as string) : 'solana';

      // First, find the pool address from DexScreener
      const poolResponse = await fetchWithTimeout(`https://api.dexscreener.com/latest/dex/tokens/${address}`, 5000);
      if (!poolResponse.ok) {
        return res.status(404).json({ error: 'Token not found' });
      }

      const poolData = await poolResponse.json();
      if (!poolData.pairs || poolData.pairs.length === 0) {
        return res.status(404).json({ error: 'No trading pairs found' });
      }

      // Filter pairs by requested chain and pick highest liquidity
      const chainPairs = poolData.pairs.filter((p: any) => p.chainId === chainParam);
      if (chainPairs.length === 0) {
        return res.status(404).json({ error: `No trading pairs found on ${chainParam}` });
      }
      const pair = chainPairs.reduce((best: any, current: any) => {
        const bestLiquidity = best.liquidity?.usd || 0;
        const currentLiquidity = current.liquidity?.usd || 0;
        return currentLiquidity > bestLiquidity ? current : best;
      }, chainPairs[0]);
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
      const geckoUrl = `https://api.geckoterminal.com/api/v2/networks/${chainParam}/pools/${pairAddress}/ohlcv/${tfConfig.unit}`;
      const geckoResponse = await fetchWithTimeout(
        `${geckoUrl}?aggregate=${tfConfig.aggregate}&limit=${tfConfig.limit}&currency=usd`,
        10000
      );

      let candles: number[][] = [];
      let geckoFailed = false;

      if (geckoResponse.ok) {
        try {
          const ohlcvData = await geckoResponse.json();
          let rawCandles = ohlcvData?.data?.attributes?.ohlcv_list || [];

          // Validate candles is an array and contains valid data
          if (!Array.isArray(rawCandles)) {
            console.error(`⚠️ OHLCV candles is not an array for ${address}:`, typeof rawCandles);
            rawCandles = [];
          }

          // Filter out any invalid candles
          candles = rawCandles.filter((candle: any) => {
            if (!Array.isArray(candle) || candle.length < 5) {
              console.warn(`Skipping invalid candle: ${JSON.stringify(candle)}`);
              return false;
            }
            // Ensure all OHLC values are valid numbers (not NaN/Infinity)
            const [, open, high, low, close] = candle;
            if ([open, high, low, close].some((v) => typeof v !== 'number' || !isFinite(v))) {
              return false;
            }
            return true;
          });

          // Sort candles in ascending order by timestamp (required by TradingView Lightweight Charts)
          candles = [...candles].sort((a: number[], b: number[]) => a[0] - b[0]);
        } catch (parseErr: any) {
          console.warn(`⚠️ Failed to parse GeckoTerminal response for ${address}:`, parseErr.message);
          geckoFailed = true;
        }
      } else {
        const geckoText = await geckoResponse.text().catch(() => '');
        console.warn(`GeckoTerminal API error: ${geckoResponse.status} for ${address} on ${chainParam}`, geckoText.substring(0, 200));
        geckoFailed = true;
      }

      // Fallback 2: Birdeye history_price (excellent Solana coverage, including new tokens)
      if (candles.length === 0 && chainParam === 'solana') {
        try {
          const birdeyeTypeMap: Record<string, string> = {
            '5S': '1m', '15S': '1m', '30S': '1m',
            '1M': '1m', '3M': '5m', '5M': '5m'
          };
          const birdeyeType = birdeyeTypeMap[timeframe as string] || '1m';
          const now = Math.floor(Date.now() / 1000);
          const intervalSeconds = birdeyeType.endsWith('m') ? parseInt(birdeyeType) * 60 : 3600;
          const timeFrom = now - (tfConfig.limit * intervalSeconds);

          const birdeyeRes = await fetchBirdeye(
            `/defi/history_price?address=${encodeURIComponent(address)}&address_type=token&type=${birdeyeType}&time_from=${timeFrom}&time_to=${now}`,
            'solana'
          );

          if (birdeyeRes?.ok) {
            const birdeyeData = await birdeyeRes.json();
            const items = birdeyeData?.data?.items || [];
            if (Array.isArray(items) && items.length > 0) {
              const birdeyeCandles = items
                .map((item: any) => {
                  const ts = item.unixTime;
                  const o = item.open;
                  const h = item.high;
                  const l = item.low;
                  const c = item.close;
                  const v = item.volume || 0;
                  if (typeof ts !== 'number' || !isFinite(ts)) return null;
                  if ([o, h, l, c].some((v) => typeof v !== 'number' || !isFinite(v))) return null;
                  return [ts, o, h, l, c, v] as number[];
                })
                .filter((c): c is number[] => c !== null)
                .sort((a: number[], b: number[]) => a[0] - b[0]);

              if (birdeyeCandles.length > 0) {
                candles = birdeyeCandles;
                console.log(`✅ Birdeye fallback: ${birdeyeCandles.length} candles for ${address}`);
              }
            }
          }
        } catch (birdeyeErr: any) {
          console.warn(`⚠️ Birdeye history fallback failed for ${address}:`, birdeyeErr.message);
        }
      }

      let synthetic: number[][] | undefined;

      // Fallback 3: Synthetic flat-line candles from current price
      if (candles.length === 0) {
        const currentPriceUsd = parseFloat(pair.priceUsd || '0');
        if (currentPriceUsd > 0 && isFinite(currentPriceUsd)) {
          const now = Math.floor(Date.now() / 1000);
          const tfMinutes =
            tfConfig.unit === 'minute'
              ? tfConfig.aggregate
              : tfConfig.unit === 'hour'
              ? tfConfig.aggregate * 60
              : tfConfig.aggregate * 60 * 24;
          const syntheticCandles: number[][] = [];
          for (let i = tfConfig.limit; i >= 0; i--) {
            const t = now - i * tfMinutes * 60;
            // Add tiny pseudo-random wiggle so it looks like a real candle
            const wiggle = currentPriceUsd * (Math.sin(i * 7.3) * 0.002);
            const o = currentPriceUsd + wiggle;
            const c = currentPriceUsd + currentPriceUsd * (Math.sin((i + 1) * 7.3) * 0.002);
            const h = Math.max(o, c) + currentPriceUsd * 0.001;
            const l = Math.min(o, c) - currentPriceUsd * 0.001;
            syntheticCandles.push([t, o, h, l, c, 0]);
          }
          synthetic = syntheticCandles;
          console.log(`📊 Generated ${syntheticCandles.length} synthetic candles for ${address} (price $${currentPriceUsd})`);
        }
      }

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
        synthetic,
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

            // Detect chain from address format
            const detectedChain = address.startsWith('0x') ? 'base' : 'solana';
            // Find the best (highest liquidity) pair for this token on the detected chain
            const bestPair = findBestPair(dexData.pairs, address, detectedChain);

            if (bestPair) {
              // ✅ PRECISION FIX: Parse price without float math
              const nativeDecimals = detectedChain === 'base' ? 18 : 9;
              const priceNative = bestPair.priceNative ? parseDecimalToNative(bestPair.priceNative, nativeDecimals) : 0n;
              const priceUsd = bestPair.priceUsd ? parseFloat(bestPair.priceUsd) : 0; // Float OK for USD display

              // Validate price exists
              if (priceNative === 0n && priceUsd === 0) {
                console.warn(`⚠️ Token ${address} has no price data on DexScreener`);
                return res.status(404).json({ error: 'Token price data unavailable' });
              }

              // Try to get enhanced metadata (icon, etc.)
              const metadata = await fetchTokenMetadata(address);

              token = {
                tokenAddress: address,
                name: metadata?.name || bestPair.baseToken?.name || 'Unknown Token',
                symbol: metadata?.symbol || bestPair.baseToken?.symbol || '???',
                price: Number(priceNative),
                priceUsd: priceUsd,
                marketCap: bestPair.fdv || bestPair.marketCap || 0,
                volume24h: bestPair.volume?.h24 || 0,
                priceChange24h: bestPair.priceChange?.h24 || 0,
                creator: undefined,
                timestamp: new Date().toISOString(),
                icon: metadata?.icon || bestPair.info?.imageUrl,
              };

              const displayNative = detectedChain === 'base'
                ? Number(priceNative) / Number(10n ** 18n)
                : Number(priceNative) / 1_000_000_000;
              console.log(`✅ Found token ${address} on DexScreener: ${token.name} (${token.symbol}) - Price: $${priceUsd} (${displayNative} ${detectedChain === 'base' ? 'ETH' : 'SOL'}) - MCap: $${token.marketCap} - Icon: ${token.icon ? 'Yes' : 'No'}`);
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

  // Get Jupiter quote for buying tokens with SOL (Solana only — deprecated, use /api/quote)
  app.get('/api/tokens/quote/buy', authenticateToken, publicApiLimiter, async (req, res) => {
    try {
      const { tokenAddress, solAmount, decimals, chain } = req.query;

      if (chain === 'base') {
        return res.status(400).json({ error: 'This endpoint only supports Solana. Use /api/quote for multi-chain quotes.' });
      }

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
      const response = await fetchJupiter(`/v6/quote?inputMint=${SOL_MINT}&outputMint=${encodeURIComponent(tokenAddress as string)}&amount=${inputAmountLamports}&slippageBps=50`);

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

  // Get Jupiter quote for selling tokens for SOL (Solana only — deprecated, use /api/quote)
  app.get('/api/tokens/quote/sell', authenticateToken, publicApiLimiter, async (req, res) => {
    try {
      const { tokenAddress, tokenAmount, decimals, chain } = req.query;

      if (chain === 'base') {
        return res.status(400).json({ error: 'This endpoint only supports Solana. Use /api/quote for multi-chain quotes.' });
      }

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
      const response = await fetchJupiter(`/v6/quote?inputMint=${encodeURIComponent(tokenAddress as string)}&outputMint=${SOL_MINT}&amount=${inputAmountTokenUnits}&slippageBps=50`);

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
  app.get('/api/analyze/:mintAddress', publicApiLimiter, async (req, res) => {
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
  app.get('/api/study/token/:mintAddress', publicApiLimiter, async (req, res) => {
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
        message: process.env.NODE_ENV === 'development' ? (error.message || 'Unknown error occurred') : 'Study service unavailable'
      });
    }
  });

  /**
   * Wallet Portfolio Endpoint
   * GET /api/study/wallet/:walletAddress
   */
  app.get('/api/study/wallet/:walletAddress', publicApiLimiter, async (req, res) => {
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
        message: process.env.NODE_ENV === 'development' ? (error.message || 'Unknown error occurred') : 'Study service unavailable'
      });
    }
  });

  /**
   * Transaction History Endpoint
   * GET /api/study/transactions/:address
   */
  app.get('/api/study/transactions/:address', publicApiLimiter, async (req, res) => {
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
  app.get('/api/study/transaction/:signature', publicApiLimiter, async (req, res) => {
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
  app.get('/api/study/search', searchLimiter, async (req, res) => {
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
  app.post('/api/study/tokens/batch', publicApiLimiter, async (req, res) => {
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
  app.get('/api/study/stats', publicApiLimiter, async (req, res) => {
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
      const { chain = 'solana' } = req.query;
      const leaders = await storage.getTopUsersByTotalProfit(100, chain as 'solana' | 'base');
      res.json(serializeBigInts({ leaders: leaders.map((l, i) => ({ ...l, rank: i + 1 })) }));
    } catch (error: any) {
      console.error('Get overall leaderboard error:', error);
      res.status(500).json({ error: 'Could not fetch leaderboard' });
    }
  });

  app.get('/api/leaderboard/current-period', publicApiLimiter, async (req, res) => {
    try {
      const { chain = 'solana' } = req.query;
      // Get the actual current period from storage
      const currentPeriod = await storage.getCurrentLeaderboardPeriod(chain as 'solana' | 'base');

      if (!currentPeriod) {
        return res.json({ leaders: [], periodStart: new Date().toISOString(), periodEnd: new Date().toISOString() });
      }

      // Use the actual period boundaries for accurate calculations
      const leaders = await storage.getTopUsersByPeriodProfit(
        new Date(currentPeriod.startTime), 
        new Date(currentPeriod.endTime), 
        100,
        chain as 'solana' | 'base'
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

  // ============================================================================
  // Achievements (Phase 2)
  // ============================================================================

  app.get('/api/achievements', authenticateToken, async (req, res) => {
    try {
      const achievements = await storage.getUserAchievements(req.userId!);
      res.json(serializeBigInts({ achievements }));
    } catch (error: any) {
      console.error('Get achievements error:', error);
      res.status(500).json({ error: 'Could not fetch achievements' });
    }
  });

  // ============================================================================
  // Portfolio Analytics (Phase 3)
  // ============================================================================

  app.get('/api/portfolio/analytics', authenticateToken, async (req, res) => {
    try {
      const chainParam = (req.query.chain as string) || 'base';
      if (!isValidChain(chainParam)) {
        return res.status(400).json({ error: 'Invalid chain' });
      }
      const analytics = await portfolioAnalytics.getAnalytics(req.userId!, chainParam as Chain);
      res.json(serializeBigInts(analytics));
    } catch (error: any) {
      console.error('Portfolio analytics error:', error);
      res.status(500).json({ error: 'Could not fetch analytics' });
    }
  });

  // ============================================================================
  // Trade Analytics Dashboard (Phase 3)
  // ============================================================================

  app.get('/api/analytics', authenticateToken, async (req, res) => {
    try {
      const chainParam = req.query.chain as string | undefined;
      const chain = chainParam && isValidChain(chainParam) ? chainParam as Chain : undefined;
      const analytics = await portfolioAnalytics.getTradeAnalytics(req.userId!, chain);
      res.json(serializeBigInts(analytics));
    } catch (error: any) {
      console.error('Trade analytics error:', error);
      res.status(500).json({ error: 'Could not fetch trade analytics' });
    }
  });

  // ============================================================================
  // Referrals (Phase 4)
  // ============================================================================

  app.get('/api/referrals/me', authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUserById(req.userId!);
      if (!user) return res.status(404).json({ error: 'User not found' });
      const stats = await storage.getReferralStats(req.userId!);
      res.json(serializeBigInts({
        username: user.username,
        referralLink: `https://simfi.fun/register?ref=${user.username}`,
        ...stats,
      }));
    } catch (error: any) {
      console.error('Get referrals error:', error);
      res.status(500).json({ error: 'Could not fetch referrals' });
    }
  });

  app.get('/api/referrals/leaderboard', publicApiLimiter, async (req, res) => {
    try {
      const leaders = await storage.getTopReferrers(20);
      res.json(serializeBigInts({ leaders: leaders.map((l, i) => ({ ...l, rank: i + 1 })) }));
    } catch (error: any) {
      console.error('Get referral leaderboard error:', error);
      res.status(500).json({ error: 'Could not fetch referral leaderboard' });
    }
  });

  // ============================================================================
  // Public Trader Profiles (Phase 5)
  // ============================================================================

  app.get('/api/traders/:username', publicApiLimiter, async (req, res) => {
    try {
      const { username } = req.params;
      const trader = await storage.getPublicTraderStats(username);
      if (!trader) return res.status(404).json({ error: 'Trader not found' });

      const [winLoss, avgHold, followerCount, achievements] = await Promise.all([
        storage.getTradeWinLoss(trader.id),
        storage.getAverageHoldTime(trader.id),
        storage.getFollowerCount(trader.id),
        storage.getUserAchievements(trader.id),
      ]);

      let isFollowing = false;
      if (req.userId) {
        isFollowing = await storage.isFollowing(req.userId, trader.id);
      }

      res.json(serializeBigInts({
        trader: {
          ...trader,
          winRate: winLoss.totalCount > 0 ? Math.round((winLoss.winCount / winLoss.totalCount) * 100) : 0,
          avgHoldTimeSeconds: avgHold,
          followerCount,
          isFollowing,
          achievements: achievements.map(a => a.badgeId),
        },
      }));
    } catch (error: any) {
      console.error('Get trader profile error:', error);
      res.status(500).json({ error: 'Could not fetch trader profile' });
    }
  });

  app.get('/api/traders/:username/trades', publicApiLimiter, async (req, res) => {
    try {
      const { username } = req.params;
      const trader = await storage.getPublicTraderStats(username);
      if (!trader) return res.status(404).json({ error: 'Trader not found' });
      const trades = await storage.getUserTrades(trader.id, undefined, 10, 0);
      res.json(serializeBigInts({ trades }));
    } catch (error: any) {
      console.error('Get trader trades error:', error);
      res.status(500).json({ error: 'Could not fetch trades' });
    }
  });

  app.post('/api/traders/:username/follow', authenticateToken, async (req, res) => {
    try {
      const { username } = req.params;
      const trader = await storage.getUserByUsername(username);
      if (!trader) return res.status(404).json({ error: 'Trader not found' });
      if (trader.id === req.userId) return res.status(400).json({ error: 'Cannot follow yourself' });

      const following = await storage.isFollowing(req.userId!, trader.id);
      if (following) {
        await storage.unfollowUser(req.userId!, trader.id);
        res.json({ following: false });
      } else {
        await storage.followUser(req.userId!, trader.id);
        res.json({ following: true });
      }
    } catch (error: any) {
      console.error('Follow error:', error);
      res.status(500).json({ error: 'Could not follow trader' });
    }
  });

  // ============================================================================
  // ============================================================================
  // Daily Streaks (Phase 8)
  // ============================================================================

  app.get('/api/streak', authenticateToken, async (req, res) => {
    try {
      const streak = await storage.getUserStreak(req.userId!);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const lastDate = streak.lastStreakDate ? new Date(streak.lastStreakDate) : null;
      const canClaim = !lastDate || lastDate < today;
      const bonuses = [0.05, 0.05, 0.1, 0.1, 0.1, 0.1, 0.25]; // day 1-7
      const nextBonus = bonuses[Math.min(streak.streakCount, 6)];
      res.json(serializeBigInts({ ...streak, canClaim, nextBonus }));
    } catch (error: any) {
      console.error('Get streak error:', error);
      res.status(500).json({ error: 'Could not fetch streak' });
    }
  });

  app.post('/api/streak/claim', authenticateToken, async (req, res) => {
    try {
      const streak = await storage.getUserStreak(req.userId!);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const lastDate = streak.lastStreakDate ? new Date(streak.lastStreakDate) : null;
      if (lastDate && lastDate.getTime() >= today.getTime()) {
        return res.status(400).json({ error: 'Already claimed today' });
      }

      // Check if user traded today
      const [tradeToday] = await db.select({ count: sql<number>`count(*)` })
        .from(tradeHistory)
        .where(and(
          eq(tradeHistory.userId, req.userId!),
          sql`DATE(${tradeHistory.closedAt}) = CURRENT_DATE`
        ));
      if (!tradeToday || tradeToday.count === 0) {
        return res.status(400).json({ error: 'Trade at least once today to claim streak bonus' });
      }

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const isConsecutive = lastDate && lastDate.getTime() === yesterday.getTime();
      const newStreak = isConsecutive ? streak.streakCount + 1 : 1;

      const bonuses = [0.05, 0.05, 0.1, 0.1, 0.1, 0.1, 0.25];
      const bonusEth = bonuses[Math.min(newStreak - 1, 6)];
      const bonusWei = BigInt(Math.floor(bonusEth * 1e18));

      await storage.updateUserStreak(req.userId!, newStreak, today);
      await storage.claimStreakBonus(req.userId!, bonusWei);

      res.json(serializeBigInts({ streak: newStreak, bonusEth, claimed: true }));
    } catch (error: any) {
      console.error('Claim streak error:', error);
      res.status(500).json({ error: 'Could not claim streak' });
    }
  });

  const httpServer = createServer(app);

  // Initialize leaderboard service for period management
  leaderboardService.start();
  registerMarketRoutes(app, { authenticateToken, searchLimiter, publicApiLimiter });

  // ============================================================================
  // Alpha Desk API
  // ============================================================================

  // GET /api/alpha-desk/today?chain=base|solana|any
  app.get('/api/alpha-desk/today', async (req, res) => {
    try {
      const requestedChain = (req.query.chain as string) || 'any';
      const validChains = ['base', 'solana', 'any'];
      if (!validChains.includes(requestedChain)) {
        return res.status(400).json({ error: 'Invalid chain. Use base, solana, or any.' });
      }

      const runDate = new Date().toISOString().split('T')[0];
      // Prefer 'any' runs (universal chain-agnostic ideas). Fallback to requested chain for legacy.
      let run = await findTodayRun(runDate, 'any');
      if (!run || run.status !== 'succeeded') {
        run = await findTodayRun(runDate, requestedChain as any);
      }
      if (!run || run.status !== 'succeeded') {
        return res.status(404).json({ error: 'No Alpha Desk picks available for today' });
      }

      const ideas = await getIdeasForRun(run.id);
      const ideasWithOutcomes = await Promise.all(
        ideas.map(async (idea) => {
          const outcomes = await db
            .select()
            .from(alphaDeskIdeaOutcomes)
            .where(eq(alphaDeskIdeaOutcomes.ideaId, idea.id));
          return { ...idea, outcomes };
        })
      );

      const memeIdeas = ideasWithOutcomes.filter((i) => i.ideaType === 'meme_launch');
      const devIdeas = ideasWithOutcomes.filter((i) => i.ideaType === 'dev_build');

      res.json({ runDate, chain: run ? requestedChain : requestedChain, memeIdeas, devIdeas });
    } catch (error: any) {
      console.error('[AlphaDesk] /today error:', error);
      res.status(500).json({ error: 'Could not fetch Alpha Desk picks' });
    }
  });

  // GET /api/alpha-desk/history?chain=base|solana|any&days=30
  app.get('/api/alpha-desk/history', async (req, res) => {
    try {
      const chain = (req.query.chain as string) || 'any';
      const validChains = ['base', 'solana', 'any'];
      if (!validChains.includes(chain)) {
        return res.status(400).json({ error: 'Invalid chain. Use base, solana, or any.' });
      }
      const days = Math.min(30, Math.max(1, parseInt(req.query.days as string) || 7));
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const runs = await db
        .select()
        .from(alphaDeskRuns)
        .where(and(eq(alphaDeskRuns.chain, chain), sql`${alphaDeskRuns.runDate} >= ${since.toISOString().split('T')[0]}`))
        .orderBy(sql`${alphaDeskRuns.runDate} desc`);

      const result = await Promise.all(
        runs.map(async (run) => {
          const ideas = await getIdeasForRun(run.id);
          const ideasWithOutcomes = await Promise.all(
            ideas.map(async (idea) => {
              const outcomes = await db
                .select()
                .from(alphaDeskIdeaOutcomes)
                .where(eq(alphaDeskIdeaOutcomes.ideaId, idea.id));
              return { ...idea, outcomes };
            })
          );
          return { runDate: run.runDate, status: run.status, ideas: ideasWithOutcomes };
        })
      );

      res.json({ chain, days, history: result });
    } catch (error: any) {
      console.error('[AlphaDesk] /history error:', error);
      res.status(500).json({ error: 'Could not fetch Alpha Desk history' });
    }
  });

  // GET /api/alpha-desk/track-record?chain=base|solana|any&horizon=24h
  app.get('/api/alpha-desk/track-record', async (req, res) => {
    try {
      const chain = (req.query.chain as string) || 'any';
      const validChains = ['base', 'solana', 'any'];
      if (!validChains.includes(chain)) {
        return res.status(400).json({ error: 'Invalid chain. Use base, solana, or any.' });
      }
      const horizon = (req.query.horizon as string) || '24h';
      if (!['1h', '6h', '24h', '7d'].includes(horizon)) {
        return res.status(400).json({ error: 'Invalid horizon. Use 1h, 6h, 24h, or 7d.' });
      }

      const runs = await db
        .select()
        .from(alphaDeskRuns)
        .where(and(eq(alphaDeskRuns.chain, chain), eq(alphaDeskRuns.status, 'succeeded')));

      let totalIdeas = 0;
      let profitableCount = 0;
      const returns: number[] = [];
      let bestCall: { token: string; return: number } | null = null;
      let worstCall: { token: string; return: number } | null = null;

      for (const run of runs) {
        const ideas = await getIdeasForRun(run.id);
        for (const idea of ideas) {
          const [outcome] = await db
            .select()
            .from(alphaDeskIdeaOutcomes)
            .where(and(eq(alphaDeskIdeaOutcomes.ideaId, idea.id), eq(alphaDeskIdeaOutcomes.horizon, horizon)))
            .limit(1);

          if (!outcome) continue;

          totalIdeas++;
          const pct = outcome.pctChange ? parseFloat(outcome.pctChange) : 0;
          if (pct > 0) profitableCount++;
          returns.push(pct);

          if (!bestCall || pct > bestCall.return) {
            bestCall = { token: idea.symbol ?? '-', return: pct };
          }
          if (!worstCall || pct < worstCall.return) {
            worstCall = { token: idea.symbol ?? '-', return: pct };
          }
        }
      }

      const sortedReturns = [...returns].sort((a, b) => a - b);
      const medianReturn = sortedReturns.length
        ? sortedReturns.length % 2 === 0
          ? (sortedReturns[sortedReturns.length / 2 - 1] + sortedReturns[sortedReturns.length / 2]) / 2
          : sortedReturns[Math.floor(sortedReturns.length / 2)]
        : 0;

      res.json({
        chain,
        horizon,
        totalIdeas,
        profitablePct: totalIdeas ? Math.round((profitableCount / totalIdeas) * 100) : 0,
        medianReturn: Math.round(medianReturn * 100) / 100,
        bestCall: bestCall ?? { token: '-', return: 0 },
        worstCall: worstCall ?? { token: '-', return: 0 },
      });
    } catch (error: any) {
      console.error('[AlphaDesk] /track-record error:', error);
      res.status(500).json({ error: 'Could not fetch track record' });
    }
  });

  // ============================================================================
  // SSE Live Price Feeds (Phase 7)
  // ============================================================================

  // GET /api/sse/prices — Server-Sent Events endpoint
  app.get('/api/sse/prices', publicApiLimiter, (req, res) => {
    const clientId = ssePriceFeed.addClient(res);
    if (!clientId) return; // Rejected (max clients reached)

    // Keep-alive ping every 15s to prevent proxy timeouts
    const keepAlive = setInterval(() => {
      try {
        res.write(':ping\n\n');
      } catch {
        clearInterval(keepAlive);
      }
    }, 15000);

    res.on('close', () => {
      clearInterval(keepAlive);
    });
  });

  // POST /api/sse/subscribe — Subscribe to token price updates
  app.post('/api/sse/subscribe', (req, res) => {
    try {
      const { clientId, tokens } = req.body;
      if (!clientId || !Array.isArray(tokens)) {
        return res.status(400).json({ error: 'Missing clientId or tokens array' });
      }

      const validTokens = tokens.filter(
        (t: any) => t.address && t.chain && ['solana', 'base'].includes(t.chain)
      );

      ssePriceFeed.subscribe(clientId, validTokens);
      res.json({ subscribed: validTokens.length });
    } catch (error: any) {
      console.error('[SSE] Subscribe error:', error);
      res.status(500).json({ error: 'Subscribe failed' });
    }
  });

  // POST /api/sse/unsubscribe
  app.post('/api/sse/unsubscribe', (req, res) => {
    try {
      const { clientId, tokens } = req.body;
      if (!clientId || !Array.isArray(tokens)) {
        return res.status(400).json({ error: 'Missing clientId or tokens array' });
      }
      ssePriceFeed.unsubscribe(clientId, tokens);
      res.json({ unsubscribed: tokens.length });
    } catch (error: any) {
      console.error('[SSE] Unsubscribe error:', error);
      res.status(500).json({ error: 'Unsubscribe failed' });
    }
  });

  // GET /api/alpha-desk/performance?chain=base|solana|any
  app.get('/api/alpha-desk/performance', async (req, res) => {
    try {
      const chain = (req.query.chain as string) || 'any';
      const validChains = ['base', 'solana', 'any'];
      if (!validChains.includes(chain)) {
        return res.status(400).json({ error: 'Invalid chain. Use base, solana, or any.' });
      }

      const summary = await getPerformanceSummary(chain as any);
      res.json(summary);
    } catch (error: any) {
      console.error('[AlphaDesk] /performance error:', error);
      res.status(500).json({ error: 'Could not fetch performance data' });
    }
  });

  // GET /api/alpha-desk/performance/:ideaId
  app.get('/api/alpha-desk/performance/:ideaId', async (req, res) => {
    try {
      const ideaId = parseInt(req.params.ideaId, 10);
      if (isNaN(ideaId)) {
        return res.status(400).json({ error: 'Invalid idea ID' });
      }

      const trajectory = await getIdeaTrajectory(ideaId);
      if (!trajectory) {
        return res.status(404).json({ error: 'Idea not found' });
      }

      res.json(trajectory);
    } catch (error: any) {
      console.error('[AlphaDesk] /performance/:ideaId error:', error);
      res.status(500).json({ error: 'Could not fetch idea trajectory' });
    }
  });

  // POST /api/admin/alpha-desk/run
  app.post('/api/admin/alpha-desk/run', authLimiter, async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_TOKEN;
      if (!adminToken || adminToken.length < 20) {
        return res.status(500).json({ error: 'Admin token not configured' });
      }
      const authHeader = req.headers.authorization;
      const providedToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (!providedToken) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const bufAdmin = Buffer.from(adminToken, 'utf8');
      const bufProvided = Buffer.from(providedToken, 'utf8');
      if (bufAdmin.length !== bufProvided.length || !crypto.timingSafeEqual(bufAdmin, bufProvided)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const chain = req.body.chain;
      const validChains = ['base', 'solana', 'any'];
      if (!validChains.includes(chain)) {
        return res.status(400).json({ error: 'Invalid chain. Use base, solana, or any.' });
      }

      // Cost guard
      const runDate = new Date().toISOString().split('T')[0];
      const runCount = await countRunsToday(runDate, chain);
      const maxRuns = parseInt(process.env.ALPHA_DESK_MAX_RUNS_PER_DAY || '2', 10);
      if (runCount >= maxRuns) {
        return res.status(429).json({ error: `Run limit exceeded for ${runDate} / ${chain} (${maxRuns})` });
      }

      const result = await runDailyPipeline(chain);
      res.json({ success: true, runId: result.runId, memeCount: result.memeCount, devCount: result.devCount });
    } catch (error: any) {
      console.error('[AlphaDesk] Admin run error:', error);
      res.status(500).json({ error: error.message || 'Pipeline failed' });
    }
  });

  return httpServer;
}