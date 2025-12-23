// server/services/quoteService.ts
// Server-authoritative quote system to prevent price manipulation

import crypto from 'crypto';
import { marketDataService } from './marketData';

interface Quote {
  quoteId: string;
  tokenAddress: string;
  tokenName?: string;
  tokenSymbol?: string;
  side: 'buy' | 'sell';
  amountSolLamports?: bigint;   // For buys: how much SOL to spend
  amountTokens?: bigint;         // For sells: how many tokens to sell
  priceLamports: bigint;         // Server-determined execution price
  estimatedOutput: bigint;       // Estimated tokens (buy) or SOL (sell)
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
  side: 'buy' | 'sell';
  amountSol?: string;            // For buys
  amountTokens?: string;         // For sells
}

interface QuoteResponse {
  quoteId: string;
  tokenAddress: string;
  side: 'buy' | 'sell';
  priceLamports: string;
  estimatedOutput: string;
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
    const { userId, tokenAddress, side, amountSol, amountTokens } = params;

    // 1. Check user quote limit (prevent spam)
    const userCount = this.userQuoteCounts.get(userId) || 0;
    if (userCount >= CONFIG.MAX_QUOTES_PER_USER) {
      throw new Error('Too many active quotes. Please wait for existing quotes to expire.');
    }

    // 2. Validate input
    if (side === 'buy' && !amountSol) {
      throw new Error('amountSol required for buy quotes');
    }
    if (side === 'sell' && !amountTokens) {
      throw new Error('amountTokens required for sell quotes');
    }

    // 3. Fetch current market data
    const tokenData = await marketDataService.getToken(tokenAddress);
    if (!tokenData) {
      throw new Error('Token not found or price unavailable');
    }

    // 4. Check liquidity
    if (tokenData.liquidity < CONFIG.MIN_LIQUIDITY_USD) {
      throw new Error(`Insufficient liquidity. Minimum: $${CONFIG.MIN_LIQUIDITY_USD}`);
    }

    // 5. Calculate execution price with slippage
    const basePriceLamports = BigInt(tokenData.priceLamports);
    let executionPrice: bigint;
    let estimatedOutput: bigint;
    let priceImpactBps = 0;

    if (side === 'buy') {
      // Buyer gets worse price (pays more per token)
      executionPrice = (basePriceLamports * BigInt(10000 + CONFIG.SLIPPAGE_BPS)) / 10000n;

      // Calculate estimated tokens to receive
      const solLamports = this.parseSolToLamports(amountSol!);
      const decimals = tokenData.decimals || 6;
      const decimalMultiplier = BigInt(10 ** decimals);
      estimatedOutput = (solLamports * decimalMultiplier) / executionPrice;

      // Estimate price impact based on trade size vs liquidity
      const tradeValueUsd = Number(solLamports) / 1e9 * (tokenData.priceUsd / (Number(basePriceLamports) / 1e9));
      priceImpactBps = Math.min(1000, Math.round((tradeValueUsd / tokenData.liquidity) * 10000));

      // 6. Create quote
      const quote: Quote = {
        quoteId: this.generateQuoteId(),
        tokenAddress,
        tokenName: tokenData.name,
        tokenSymbol: tokenData.symbol,
        side,
        amountSolLamports: solLamports,
        priceLamports: executionPrice,
        estimatedOutput,
        decimals,
        userId,
        createdAt: Date.now(),
        expiresAt: Date.now() + CONFIG.QUOTE_TTL_MS,
        liquidity: tokenData.liquidity,
        priceImpactBps,
      };

      this.storeQuote(quote, userId);
      return this.formatQuoteResponse(quote);

    } else {
      // Seller gets worse price (receives less SOL per token)
      executionPrice = (basePriceLamports * BigInt(10000 - CONFIG.SLIPPAGE_BPS)) / 10000n;

      // Calculate estimated SOL to receive
      const tokenAmount = BigInt(amountTokens!);
      const decimals = tokenData.decimals || 6;
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
        priceLamports: executionPrice,
        estimatedOutput,
        decimals,
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
      priceLamports: quote.priceLamports.toString(),
      estimatedOutput: quote.estimatedOutput.toString(),
      expiresAt: quote.expiresAt,
      expiresInMs: quote.expiresAt - Date.now(),
      priceImpactBps: quote.priceImpactBps,
    };
  }

  private parseSolToLamports(solAmount: string): bigint {
    const parts = solAmount.split('.');
    const wholePart = parts[0] || '0';
    let fracPart = parts[1] || '';

    // Pad/truncate to 9 decimals
    if (fracPart.length > 9) {
      fracPart = fracPart.slice(0, 9);
    } else {
      fracPart = fracPart.padEnd(9, '0');
    }

    const cleanWhole = wholePart.replace(/^0+/, '') || '0';
    return BigInt(cleanWhole + fracPart);
  }
}

// Export singleton
export const quoteService = new QuoteService();
export type { Quote, QuoteResponse, CreateQuoteParams };