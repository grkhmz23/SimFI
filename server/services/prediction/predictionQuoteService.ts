// server/services/prediction/predictionQuoteService.ts
// Server-authoritative quote system for prediction markets

import crypto from 'crypto';
import { polymarketGamma } from './polymarketGamma';
import { polymarketClob } from './polymarketClob';
import { walkBook, walkBookByNotional, computeSlippageBps } from './predictionExecution';
import { db } from '../../db';
import { predictionMarkets } from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface Quote {
  quoteId: string;
  userId: string | number;
  conditionId: string;
  tokenId: string;
  outcome: 'YES' | 'NO';
  side: 'BUY' | 'SELL';
  sharesMicro: bigint;
  avgPrice: number;
  slippageBps: number;
  totalMicroUsd: bigint;
  bookSnapshot: string;
  expiresAt: number;
}

interface CreateQuoteParams {
  userId: string | number;
  conditionId: string;
  outcome: 'YES' | 'NO';
  side: 'BUY' | 'SELL';
  sharesMicro?: bigint;
  notionalMicroUsd?: bigint;
}

const CONFIG = {
  QUOTE_TTL_MS: 10_000,
  CLEANUP_INTERVAL_MS: 30_000,
  MAX_QUOTES_PER_USER: 10,
};

class PredictionQuoteService {
  private quotes = new Map<string, Quote>();
  private userQuoteCounts = new Map<string | number, number>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), CONFIG.CLEANUP_INTERVAL_MS);
  }

  async createQuote(params: CreateQuoteParams): Promise<{
    quoteId: string;
    conditionId: string;
    tokenId: string;
    outcome: 'YES' | 'NO';
    side: 'BUY' | 'SELL';
    shares: number;
    avgPrice: number;
    slippageBps: number;
    totalUsd: number;
    expiresAt: string;
  }> {
    const { userId, conditionId, outcome, side, sharesMicro, notionalMicroUsd } = params;

    // 1. Check user quote limit
    const userCount = this.userQuoteCounts.get(userId) || 0;
    if (userCount >= CONFIG.MAX_QUOTES_PER_USER) {
      throw new Error('Too many active quotes. Please wait for existing quotes to expire.');
    }

    // 2. Resolve market from DB cache or Gamma
    let market: any = await this.getMarketFromCache(conditionId);
    if (!market) {
      const gammaMarket = await polymarketGamma.getMarketByConditionId(conditionId);
      if (!gammaMarket) {
        throw new Error('Market not found');
      }
      await this.upsertMarket(gammaMarket);
      market = gammaMarket;
    }

    if (market.closed) {
      throw new Error('Market is closed');
    }

    // 3. Resolve token ID
    const tokenId = outcome === 'YES' ? market.yesTokenId : market.noTokenId;

    // 4. Fetch fresh order book
    const book = await polymarketClob.getOrderBook(tokenId);
    if (!book) {
      throw new Error('Order book unavailable');
    }

    // 5. Compute midpoint for slippage
    const midpoint = await polymarketClob.getMidpoint(tokenId) ?? 0.5;

    // 6. Walk the book
    let sharesMicroResult: bigint;
    let avgPrice: number;
    let totalMicroUsd: bigint;

    if (side === 'BUY' && notionalMicroUsd != null) {
      const result = walkBookByNotional(book, 'BUY', notionalMicroUsd);
      sharesMicroResult = result.sharesMicro;
      avgPrice = result.avgPrice;
      totalMicroUsd = BigInt(Math.round(avgPrice * Number(sharesMicroResult)));
    } else if (sharesMicro != null) {
      const result = walkBook(book, side, sharesMicro);
      sharesMicroResult = result.consumedMicro;
      avgPrice = result.avgPrice;
      totalMicroUsd = BigInt(Math.round(avgPrice * Number(sharesMicroResult)));
    } else {
      throw new Error('Must provide sharesMicro or notionalMicroUsd');
    }

    if (sharesMicroResult <= 0n) {
      throw new Error('Computed zero shares from book walk');
    }

    const slippageBps = computeSlippageBps(avgPrice, midpoint, side);

    // 7. Stash quote
    const quoteId = this.generateQuoteId();
    const quote: Quote = {
      quoteId,
      userId,
      conditionId,
      tokenId,
      outcome,
      side,
      sharesMicro: sharesMicroResult,
      avgPrice,
      slippageBps,
      totalMicroUsd,
      bookSnapshot: JSON.stringify({
        market: book.market,
        asset_id: book.asset_id,
        bids: book.bids.slice(0, 10),
        asks: book.asks.slice(0, 10),
        timestamp: book.timestamp,
      }),
      expiresAt: Date.now() + CONFIG.QUOTE_TTL_MS,
    };

    this.quotes.set(quoteId, quote);
    this.userQuoteCounts.set(userId, userCount + 1);

    // Auto-cleanup
    setTimeout(() => this.removeQuote(quoteId, userId), CONFIG.QUOTE_TTL_MS + 1000);

    return {
      quoteId,
      conditionId,
      tokenId,
      outcome,
      side,
      shares: Number(sharesMicroResult) / 1_000_000,
      avgPrice,
      slippageBps,
      totalUsd: Number(totalMicroUsd) / 1_000_000,
      expiresAt: new Date(quote.expiresAt).toISOString(),
    };
  }

  consumeQuote(quoteId: string, userId: string | number): Quote {
    const quote = this.quotes.get(quoteId);
    if (!quote) {
      throw new Error('Quote not found or already used');
    }
    if (String(quote.userId) !== String(userId)) {
      throw new Error('Quote belongs to different user');
    }
    if (Date.now() > quote.expiresAt) {
      this.removeQuote(quoteId, userId);
      throw new Error('Quote expired. Please request a new quote.');
    }

    this.removeQuote(quoteId, userId);
    return quote;
  }

  private async getMarketFromCache(conditionId: string) {
    const [row] = await db.select()
      .from(predictionMarkets)
      .where(eq(predictionMarkets.conditionId, conditionId))
      .limit(1);
    return row || null;
  }

  private async upsertMarket(market: any) {
    await db.insert(predictionMarkets)
      .values({
        conditionId: market.conditionId,
        slug: market.slug,
        question: market.question,
        description: market.description || '',
        endDate: market.endDate ? new Date(market.endDate) : null,
        closed: market.closed,
        active: market.active,
        archived: market.archived,
        yesTokenId: market.yesTokenId,
        noTokenId: market.noTokenId,
      })
      .onConflictDoUpdate({
        target: predictionMarkets.conditionId,
        set: {
          slug: market.slug,
          question: market.question,
          description: market.description || '',
          endDate: market.endDate ? new Date(market.endDate) : null,
          closed: market.closed,
          active: market.active,
          archived: market.archived,
          yesTokenId: market.yesTokenId,
          noTokenId: market.noTokenId,
          lastSyncedAt: new Date(),
        },
      });
  }

  private generateQuoteId(): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(8).toString('hex');
    return `pq_${timestamp}_${random}`;
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

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [quoteId, quote] of this.quotes.entries()) {
      if (now > quote.expiresAt) {
        this.removeQuote(quoteId, quote.userId);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[prediction-quotes] Cleaned ${cleaned} expired quotes`);
    }
  }

  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

export const predictionQuoteService = new PredictionQuoteService();
