// server/services/quoteService.ts
// Multi-chain server-authoritative quote system

import crypto from 'crypto';
import { marketDataService } from './marketData';
import type { Chain } from '@shared/schema';
import { CHAIN_CONFIG, parseToBaseUnits } from '../lib/chain-utils';

interface Quote {
  quoteId: string;
  tokenAddress: string;
  tokenName?: string;
  tokenSymbol?: string;
  side: 'buy' | 'sell';
  amountNative?: bigint;         // For buys: how much native token (SOL/ETH) to spend
  amountTokens?: bigint;         // For sells: how many tokens to sell
  priceNative: bigint;           // Server-determined execution price (in chain's base units)
  estimatedOutput: bigint;       // Estimated tokens (buy) or native token (sell)
  decimals: number;
  chain: Chain;                  // Which chain this quote is for
  userId: string | number;
  createdAt: number;
  expiresAt: number;
  liquidity: number;
  priceImpactBps: number;
}

interface CreateQuoteParams {
  userId: string | number;
  chain: Chain;
  tokenAddress: string;
  side: 'buy' | 'sell';
  amountNative?: string;         // For buys: amount in display units (SOL or ETH)
  amountTokens?: string;         // For sells: token amount in base units
}

interface QuoteResponse {
  quoteId: string;
  tokenAddress: string;
  side: 'buy' | 'sell';
  priceNative: string;
  estimatedOutput: string;
  chain: Chain;
  expiresAt: number;
  expiresInMs: number;
  priceImpactBps: number;
}

// Configuration
const CONFIG = {
  QUOTE_TTL_MS: 10_000,          // 10 seconds
  SLIPPAGE_BPS: 50,              // 0.5% slippage
  MAX_QUOTES_PER_USER: 10,       // Prevent spam
  CLEANUP_INTERVAL_MS: 5_000,    // Clean expired quotes every 5s
  MIN_LIQUIDITY_USD: 1000,       // Minimum liquidity to allow trading
};

class QuoteService {
  private quotes: Map<string, Quote> = new Map();
  private userQuoteCounts: Map<string | number, number> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup interval
    this.cleanupInterval = setInterval(
      () => this.cleanupExpiredQuotes(),
      CONFIG.CLEANUP_INTERVAL_MS
    );
  }

  /**
   * Create a new server-authoritative quote
   */
  async createQuote(params: CreateQuoteParams): Promise<QuoteResponse> {
    const { userId, chain, tokenAddress, side, amountNative, amountTokens } = params;

    // 1. Check user quote limit (prevent spam)
    const userCount = this.userQuoteCounts.get(userId) || 0;
    if (userCount >= CONFIG.MAX_QUOTES_PER_USER) {
      throw new Error('Too many active quotes. Please wait for existing quotes to expire.');
    }

    // 2. Validate input
    if (side === 'buy' && !amountNative) {
      throw new Error('amountNative required for buy quotes');
    }
    if (side === 'sell' && !amountTokens) {
      throw new Error('amountTokens required for sell quotes');
    }

    // 3. Fetch current market data for the specific chain
    const tokenData = await marketDataService.getToken(tokenAddress, chain);
    if (!tokenData) {
      throw new Error(`Token not found on ${chain} or price unavailable`);
    }

    // 4. Check liquidity
    if (tokenData.liquidity < CONFIG.MIN_LIQUIDITY_USD) {
      throw new Error(`Insufficient liquidity. Minimum: $${CONFIG.MIN_LIQUIDITY_USD}`);
    }

    // 5. Calculate execution price with slippage
    const basePriceNative = tokenData.priceNative;
    let executionPrice: bigint;
    let estimatedOutput: bigint;
    let priceImpactBps = 0;

    const decimals = tokenData.decimals || (chain === 'base' ? 18 : 6);
    const nativeDecimals = CHAIN_CONFIG[chain].decimals;

    if (side === 'buy') {
      // Buyer gets worse price (pays more per token)
      executionPrice = (basePriceNative * BigInt(10000 + CONFIG.SLIPPAGE_BPS)) / 10000n;

      // Parse native amount (SOL or ETH) to base units
      const nativeAmount = parseToBaseUnits(chain, amountNative!);
      const decimalMultiplier = BigInt(10 ** decimals);
      estimatedOutput = (nativeAmount * decimalMultiplier) / executionPrice;

      // Estimate price impact based on trade size vs liquidity
      const nativeSymbol = CHAIN_CONFIG[chain].nativeSymbol;
      const nativePriceUsd = tokenData.priceUsd / (Number(basePriceNative) / (10 ** nativeDecimals));
      const tradeValueUsd = Number(nativeAmount) / (10 ** nativeDecimals) * nativePriceUsd;
      priceImpactBps = Math.min(1000, Math.round((tradeValueUsd / tokenData.liquidity) * 10000));

      // 6. Create quote
      const quote: Quote = {
        quoteId: this.generateQuoteId(),
        tokenAddress,
        tokenName: tokenData.name,
        tokenSymbol: tokenData.symbol,
        side,
        amountNative: nativeAmount,
        priceNative: executionPrice,
        estimatedOutput,
        decimals,
        chain,
        userId,
        createdAt: Date.now(),
        expiresAt: Date.now() + CONFIG.QUOTE_TTL_MS,
        liquidity: tokenData.liquidity,
        priceImpactBps,
      };

      this.storeQuote(quote, userId);
      return this.formatQuoteResponse(quote);

    } else {
      // Seller gets worse price (receives less native token per token)
      executionPrice = (basePriceNative * BigInt(10000 - CONFIG.SLIPPAGE_BPS)) / 10000n;

      // Calculate estimated native token to receive
      const tokenAmount = BigInt(amountTokens!);
      const decimalDivisor = BigInt(10 ** decimals);
      estimatedOutput = (tokenAmount * executionPrice) / decimalDivisor;

      // Estimate price impact
      const tokenValueUsd = Number(tokenAmount) / (10 ** decimals) * tokenData.priceUsd;
      priceImpactBps = Math.min(1000, Math.round((tokenValueUsd / tokenData.liquidity) * 10000));

      // 6. Create quote
      const quote: Quote = {
        quoteId: this.generateQuoteId(),
        tokenAddress,
        tokenName: tokenData.name,
        tokenSymbol: tokenData.symbol,
        side,
        amountTokens: tokenAmount,
        priceNative: executionPrice,
        estimatedOutput,
        decimals,
        chain,
        userId,
        createdAt: Date.now(),
        expiresAt: Date.now() + CONFIG.QUOTE_TTL_MS,
        liquidity: tokenData.liquidity,
        priceImpactBps,
      };

      this.storeQuote(quote, userId);
      return this.formatQuoteResponse(quote);
    }
  }

  /**
   * Validate and consume a quote (one-time use)
   */
  validateAndConsume(quoteId: string, userId: string | number): Quote {
    const quote = this.quotes.get(quoteId);

    if (!quote) {
      throw new Error('Quote not found or already used');
    }

    if (quote.userId !== userId) {
      throw new Error('Quote belongs to different user');
    }

    if (Date.now() > quote.expiresAt) {
      this.removeQuote(quoteId, userId);
      throw new Error('Quote expired. Please request a new quote.');
    }

    // Consume (delete after validation)
    this.removeQuote(quoteId, userId);

    return quote;
  }

  /**
   * Get quote without consuming (for preview)
   */
  getQuote(quoteId: string, userId: string | number): Quote | null {
    const quote = this.quotes.get(quoteId);

    if (!quote || quote.userId !== userId) {
      return null;
    }

    if (Date.now() > quote.expiresAt) {
      this.removeQuote(quoteId, userId);
      return null;
    }

    return quote;
  }

  /**
   * Get service stats
   */
  getStats() {
    // Count quotes per chain
    const byChain = new Map<Chain, number>();
    for (const quote of this.quotes.values()) {
      byChain.set(quote.chain, (byChain.get(quote.chain) || 0) + 1);
    }

    return {
      activeQuotes: this.quotes.size,
      usersWithQuotes: this.userQuoteCounts.size,
      byChain: Object.fromEntries(byChain),
    };
  }

  /**
   * Shutdown cleanup
   */
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  private generateQuoteId(): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(8).toString('hex');
    return `q_${timestamp}_${random}`;
  }

  private storeQuote(quote: Quote, userId: string | number): void {
    this.quotes.set(quote.quoteId, quote);
    this.userQuoteCounts.set(userId, (this.userQuoteCounts.get(userId) || 0) + 1);

    // Auto-cleanup after expiry
    setTimeout(() => {
      if (this.quotes.has(quote.quoteId)) {
        this.removeQuote(quote.quoteId, userId);
      }
    }, CONFIG.QUOTE_TTL_MS + 1000);
  }

  private removeQuote(quoteId: string, userId: string | number): void {
    this.quotes.delete(quoteId);
    const count = this.userQuoteCounts.get(userId) || 0;
    if (count > 1) {
      this.userQuoteCounts.set(userId, count - 1);
    } else {
      this.userQuoteCounts.delete(userId);
    }
  }

  private cleanupExpiredQuotes(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [quoteId, quote] of this.quotes.entries()) {
      if (now > quote.expiresAt) {
        this.removeQuote(quoteId, quote.userId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned ${cleaned} expired quotes`);
    }
  }

  private formatQuoteResponse(quote: Quote): QuoteResponse {
    return {
      quoteId: quote.quoteId,
      tokenAddress: quote.tokenAddress,
      side: quote.side,
      priceNative: quote.priceNative.toString(),
      estimatedOutput: quote.estimatedOutput.toString(),
      chain: quote.chain,
      expiresAt: quote.expiresAt,
      expiresInMs: quote.expiresAt - Date.now(),
      priceImpactBps: quote.priceImpactBps,
    };
  }
}

// Export singleton
export const quoteService = new QuoteService();
export type { Quote, QuoteResponse, CreateQuoteParams };
