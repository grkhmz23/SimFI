// server/services/quoteService.ts
// Server-authoritative quote system to prevent price manipulation - Multi-chain support

import crypto from 'crypto';
import { marketDataService } from './marketData';
import type { Chain } from '@shared/schema';

interface Quote {
  quoteId: string;
  tokenAddress: string;
  tokenName?: string;
  tokenSymbol?: string;
  side: 'buy' | 'sell';
  chain: Chain;
  amountNative?: bigint;        // For buys: how much native token to spend (lamports/wei)
  amountTokens?: bigint;         // For sells: how many tokens to sell
  priceNative: bigint;           // Server-determined execution price in native units
  estimatedOutput: bigint;       // Estimated tokens (buy) or native (sell)
  decimals: number;
  userId: string | number;
  createdAt: number;
  expiresAt: number;
  liquidity: number;
  priceImpactBps: number;
}

interface CreateQuoteParams {
  userId: string | number;
  tokenAddress: string;
  chain: Chain;
  side: 'buy' | 'sell';
  amountNative?: string;         // For buys (in SOL or ETH)
  amountTokens?: string;         // For sells
}

interface QuoteResponse {
  quoteId: string;
  tokenAddress: string;
  side: 'buy' | 'sell';
  chain: Chain;
  priceNative: string;
  estimatedOutput: string;
  expiresAt: number;
  expiresInMs: number;
  priceImpactBps: number;
  nativeSymbol: string;
}

// Configuration
const CONFIG = {
  QUOTE_TTL_MS: 10_000,          // 10 seconds
  SLIPPAGE_BPS: 50,              // 0.5% slippage
  MAX_QUOTES_PER_USER: 10,       // Prevent spam
  CLEANUP_INTERVAL_MS: 5_000,    // Clean expired quotes every 5s
  MIN_LIQUIDITY_USD: 1000,       // Minimum liquidity to allow trading
};

// Chain configuration
const CHAIN_CONFIG = {
  solana: {
    nativeDecimals: 9,           // Lamports
    defaultTokenDecimals: 6,
    nativeSymbol: 'SOL',
  },
  base: {
    nativeDecimals: 18,          // Wei
    defaultTokenDecimals: 18,
    nativeSymbol: 'ETH',
  },
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
    const { userId, tokenAddress, chain, side, amountNative, amountTokens } = params;

    // 1. Check user quote limit (prevent spam)
    const userCount = this.userQuoteCounts.get(userId) || 0;
    if (userCount >= CONFIG.MAX_QUOTES_PER_USER) {
      throw new Error('Too many active quotes. Please wait for existing quotes to expire.');
    }

    // 2. Validate input
    if (side === 'buy' && !amountNative) {
      throw new Error(`${CHAIN_CONFIG[chain].nativeSymbol} amount required for buy quotes`);
    }
    if (side === 'sell' && !amountTokens) {
      throw new Error('token amount required for sell quotes');
    }

    // 3. Fetch current market data
    const tokenData = await marketDataService.getToken(tokenAddress, chain);
    if (!tokenData) {
      throw new Error('Token not found or price unavailable');
    }

    // 4. Check liquidity
    if (tokenData.liquidity < CONFIG.MIN_LIQUIDITY_USD) {
      throw new Error(`Insufficient liquidity. Minimum: $${CONFIG.MIN_LIQUIDITY_USD}`);
    }

    const chainConfig = CHAIN_CONFIG[chain];
    const nativeDecimals = chainConfig.nativeDecimals;
    const tokenDecimals = tokenData.decimals || chainConfig.defaultTokenDecimals;

    // 5. Calculate execution price with slippage
    const basePriceNative = tokenData.priceNative;
    let executionPrice: bigint;
    let estimatedOutput: bigint;
    let priceImpactBps = 0;

    if (side === 'buy') {
      // Parse native amount (SOL or ETH)
      const nativeAmount = this.parseNativeToUnits(amountNative!, nativeDecimals);

      // Buyer gets worse price (pays more per token)
      executionPrice = (basePriceNative * BigInt(10000 + CONFIG.SLIPPAGE_BPS)) / 10000n;

      // Calculate estimated tokens to receive
      // formula: (native_amount * 10^token_decimals) / price
      const decimalMultiplier = BigInt(10 ** tokenDecimals);
      estimatedOutput = (nativeAmount * decimalMultiplier) / executionPrice;

      // Estimate price impact based on trade size vs liquidity
      const tradeValueUsd = Number(nativeAmount) / (10 ** nativeDecimals) * tokenData.priceUsd;
      priceImpactBps = Math.min(1000, Math.round((tradeValueUsd / tokenData.liquidity) * 10000));

      // 6. Create quote
      const quote: Quote = {
        quoteId: this.generateQuoteId(),
        tokenAddress,
        tokenName: tokenData.name,
        tokenSymbol: tokenData.symbol,
        side,
        chain,
        amountNative: nativeAmount,
        priceNative: executionPrice,
        estimatedOutput,
        decimals: tokenDecimals,
        userId,
        createdAt: Date.now(),
        expiresAt: Date.now() + CONFIG.QUOTE_TTL_MS,
        liquidity: tokenData.liquidity,
        priceImpactBps,
      };

      this.storeQuote(quote, userId);
      return this.formatQuoteResponse(quote);

    } else {
      // Parse token amount
      const tokenAmount = BigInt(amountTokens!);

      // Seller gets worse price (receives less native per token)
      executionPrice = (basePriceNative * BigInt(10000 - CONFIG.SLIPPAGE_BPS)) / 10000n;

      // Calculate estimated native to receive
      // formula: (token_amount * price) / 10^token_decimals
      const decimalDivisor = BigInt(10 ** tokenDecimals);
      estimatedOutput = (tokenAmount * executionPrice) / decimalDivisor;

      // Estimate price impact
      const tokenValueUsd = Number(tokenAmount) / (10 ** tokenDecimals) * tokenData.priceUsd;
      priceImpactBps = Math.min(1000, Math.round((tokenValueUsd / tokenData.liquidity) * 10000));

      // 6. Create quote
      const quote: Quote = {
        quoteId: this.generateQuoteId(),
        tokenAddress,
        tokenName: tokenData.name,
        tokenSymbol: tokenData.symbol,
        side,
        chain,
        amountTokens: tokenAmount,
        priceNative: executionPrice,
        estimatedOutput,
        decimals: tokenDecimals,
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
    return {
      activeQuotes: this.quotes.size,
      usersWithQuotes: this.userQuoteCounts.size,
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
      chain: quote.chain,
      priceNative: quote.priceNative.toString(),
      estimatedOutput: quote.estimatedOutput.toString(),
      expiresAt: quote.expiresAt,
      expiresInMs: quote.expiresAt - Date.now(),
      priceImpactBps: quote.priceImpactBps,
      nativeSymbol: CHAIN_CONFIG[quote.chain].nativeSymbol,
    };
  }

  /**
   * Parse native amount string (SOL or ETH) to native units (lamports or wei)
   */
  private parseNativeToUnits(nativeAmount: string, decimals: number): bigint {
    const parts = nativeAmount.split('.');
    const wholePart = parts[0] || '0';
    let fracPart = parts[1] || '';

    // Pad/truncate to correct decimals
    if (fracPart.length > decimals) {
      fracPart = fracPart.slice(0, decimals);
    } else {
      fracPart = fracPart.padEnd(decimals, '0');
    }

    const cleanWhole = wholePart.replace(/^0+/, '') || '0';
    return BigInt(cleanWhole + fracPart);
  }
}

// Export singleton
export const quoteService = new QuoteService();
export type { Quote, QuoteResponse, CreateQuoteParams };
