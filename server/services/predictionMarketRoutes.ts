// server/services/predictionMarketRoutes.ts
// Prediction market routes — mirrors marketRoutes.ts structure

import type { Express, Request, Response, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateToken } from '../middleware/auth';
import { polymarketGamma } from './prediction/polymarketGamma';
import { polymarketClob } from './prediction/polymarketClob';
import { predictionQuoteService } from './prediction/predictionQuoteService';
import { executeTrade } from './prediction/predictionExecutionTx';
import { predictionSseFeed } from './prediction/predictionSseFeed';
import { db } from '../db';
import { predictionMarkets, predictionPaperBalances, predictionPositions, predictionTrades } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { QuoteRequest, TradeRequest } from './prediction/schemas';

// ============================================================================
// RATE LIMITERS
// ============================================================================

const predictionTradeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many trade requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => {
    if (req.userId) return `user:${req.userId}`;
    return 'anon';
  },
});

const publicApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// HELPERS
// ============================================================================

function handleError(res: Response, err: any, status = 400) {
  const message = err?.message || 'Bad request';
  console.error('[predictions] route error:', message);
  res.status(status).json({ error: message });
}

function requireAuth(req: Request, res: Response, next: Function) {
  return authenticateToken(req, res, next as any);
}

// Lazily ensure a user has a prediction paper balance
async function ensureBalance(userId: string): Promise<{ balanceMicroUsd: bigint; realizedPnlMicroUsd: bigint }> {
  const [row] = await db.select()
    .from(predictionPaperBalances)
    .where(eq(predictionPaperBalances.userId, userId))
    .limit(1);

  if (!row) {
    const defaultBalance = BigInt(
      (process.env.PREDICTION_STARTING_BALANCE_USD
        ? parseInt(process.env.PREDICTION_STARTING_BALANCE_USD, 10)
        : 10000) * 1_000_000
    );
    await db.insert(predictionPaperBalances)
      .values({
        userId,
        balanceMicroUsd: defaultBalance,
        realizedPnlMicroUsd: 0n,
      })
      .onConflictDoNothing();
    return { balanceMicroUsd: defaultBalance, realizedPnlMicroUsd: 0n };
  }
  return { balanceMicroUsd: row.balanceMicroUsd, realizedPnlMicroUsd: row.realizedPnlMicroUsd };
}

// ============================================================================
// ROUTES
// ============================================================================

export function registerPredictionMarketRoutes(app: Express): void {
  // --------------------------------------------------------------------------
  // Public market data
  // --------------------------------------------------------------------------

  app.get('/api/predictions/markets', publicApiLimiter, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 200);
      const offset = parseInt(req.query.offset as string || '0', 10);
      const markets = await polymarketGamma.listMarkets({
        active: true,
        closed: false,
        limit,
        offset,
      });
      res.json(markets);
    } catch (err: any) {
      handleError(res, err, 500);
    }
  });

  app.get('/api/predictions/markets/:slug', publicApiLimiter, async (req, res) => {
    try {
      const market = await polymarketGamma.getMarketBySlug(req.params.slug);
      if (!market) {
        return res.status(404).json({ error: 'Market not found' });
      }
      res.json(market);
    } catch (err: any) {
      handleError(res, err, 500);
    }
  });

  app.get('/api/predictions/markets/:tokenId/book', publicApiLimiter, async (req, res) => {
    try {
      const book = await polymarketClob.getOrderBook(req.params.tokenId);
      if (!book) {
        return res.status(404).json({ error: 'Order book not found' });
      }
      res.json(book);
    } catch (err: any) {
      handleError(res, err, 500);
    }
  });

  app.get('/api/predictions/markets/:tokenId/history', publicApiLimiter, async (req, res) => {
    try {
      const interval = (req.query.interval as any) || '1d';
      const history = await polymarketClob.getPriceHistory(req.params.tokenId, { interval });
      res.json(history);
    } catch (err: any) {
      handleError(res, err, 500);
    }
  });

  // --------------------------------------------------------------------------
  // Authenticated trading
  // --------------------------------------------------------------------------

  app.post('/api/predictions/quote', requireAuth, predictionTradeLimiter, async (req, res) => {
    try {
      const parsed = QuoteRequest.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid request' });
      }

      const { conditionId, outcome, side, shares, notionalUsd } = parsed.data;
      const userId = req.userId!;

      const sharesMicro = shares != null
        ? BigInt(Math.floor(shares * 1_000_000))
        : undefined;
      const notionalMicroUsd = notionalUsd != null
        ? BigInt(Math.round(notionalUsd * 1_000_000))
        : undefined;

      const quote = await predictionQuoteService.createQuote({
        userId,
        conditionId,
        outcome,
        side,
        sharesMicro,
        notionalMicroUsd,
      });

      res.json(quote);
    } catch (err: any) {
      handleError(res, err, 400);
    }
  });

  app.post('/api/predictions/trade', requireAuth, predictionTradeLimiter, async (req, res) => {
    try {
      const parsed = TradeRequest.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid request' });
      }

      const { quoteId, idempotencyKey } = parsed.data;
      const userId = req.userId!;

      const quote = predictionQuoteService.consumeQuote(quoteId, userId);
      const result = await executeTrade({ userId, quote, idempotencyKey });

      res.json(result);
    } catch (err: any) {
      handleError(res, err, 400);
    }
  });

  // --------------------------------------------------------------------------
  // Me endpoints
  // --------------------------------------------------------------------------

  app.get('/api/predictions/me/balance', requireAuth, async (req, res) => {
    try {
      const userId = req.userId!;
      const { balanceMicroUsd, realizedPnlMicroUsd } = await ensureBalance(userId);
      res.json({
        balanceUsd: Number(balanceMicroUsd) / 1_000_000,
        realizedPnlUsd: Number(realizedPnlMicroUsd) / 1_000_000,
      });
    } catch (err: any) {
      handleError(res, err, 500);
    }
  });

  app.get('/api/predictions/me/positions', requireAuth, async (req, res) => {
    try {
      const userId = req.userId!;
      const positions = await db.select()
        .from(predictionPositions)
        .where(eq(predictionPositions.userId, userId))
        .orderBy(desc(predictionPositions.createdAt));

      res.json(positions.map(p => ({
        id: p.id,
        conditionId: p.conditionId,
        tokenId: p.tokenId,
        outcome: p.outcome,
        shares: Number(p.sharesMicro) / 1_000_000,
        avgPrice: Number(p.avgPrice),
        costBasisUsd: Number(p.costBasisMicroUsd) / 1_000_000,
        realizedPnlUsd: Number(p.realizedPnlMicroUsd) / 1_000_000,
        resolutionState: p.resolutionState,
        createdAt: p.createdAt,
      })));
    } catch (err: any) {
      handleError(res, err, 500);
    }
  });

  app.get('/api/predictions/me/trades', requireAuth, async (req, res) => {
    try {
      const userId = req.userId!;
      const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 200);
      const offset = parseInt(req.query.offset as string || '0', 10);

      const trades = await db.select()
        .from(predictionTrades)
        .where(eq(predictionTrades.userId, userId))
        .orderBy(desc(predictionTrades.createdAt))
        .limit(limit)
        .offset(offset);

      res.json(trades.map(t => ({
        id: t.id,
        conditionId: t.conditionId,
        tokenId: t.tokenId,
        outcome: t.outcome,
        side: t.side,
        shares: Number(t.sharesMicro) / 1_000_000,
        avgPrice: Number(t.avgPrice),
        slippageBps: t.slippageBps,
        totalUsd: Number(t.totalMicroUsd) / 1_000_000,
        createdAt: t.createdAt,
      })));
    } catch (err: any) {
      handleError(res, err, 500);
    }
  });

  // --------------------------------------------------------------------------
  // Stats
  // --------------------------------------------------------------------------

  app.get('/api/predictions/me/stats', requireAuth, async (req, res) => {
    try {
      const userId = req.userId!;

      // Trade counts by side
      const [buyRow] = await db.select({ count: sql<number>`count(*)` })
        .from(predictionTrades)
        .where(and(eq(predictionTrades.userId, userId), eq(predictionTrades.side, 'BUY')));
      const [sellRow] = await db.select({ count: sql<number>`count(*)` })
        .from(predictionTrades)
        .where(and(eq(predictionTrades.userId, userId), eq(predictionTrades.side, 'SELL')));
      const [totalRow] = await db.select({ count: sql<number>`count(*)` })
        .from(predictionTrades)
        .where(eq(predictionTrades.userId, userId));

      // Volume
      const [volumeRow] = await db.select({ total: sql<number>`COALESCE(SUM(${predictionTrades.totalMicroUsd}), 0)` })
        .from(predictionTrades)
        .where(eq(predictionTrades.userId, userId));

      // Win/loss from positions realized PnL
      const [winRow] = await db.select({ count: sql<number>`count(*)` })
        .from(predictionPositions)
        .where(and(
          eq(predictionPositions.userId, userId),
          sql`${predictionPositions.realizedPnlMicroUsd} > 0`
        ));
      const [lossRow] = await db.select({ count: sql<number>`count(*)` })
        .from(predictionPositions)
        .where(and(
          eq(predictionPositions.userId, userId),
          sql`${predictionPositions.realizedPnlMicroUsd} < 0`
        ));
      const [openPosRow] = await db.select({ count: sql<number>`count(*)` })
        .from(predictionPositions)
        .where(eq(predictionPositions.userId, userId));

      const totalTrades = totalRow?.count || 0;
      const buyCount = buyRow?.count || 0;
      const sellCount = sellRow?.count || 0;
      const winCount = winRow?.count || 0;
      const lossCount = lossRow?.count || 0;
      const openPositionsCount = openPosRow?.count || 0;
      const totalVolumeMicro = BigInt(volumeRow?.total || 0);
      const totalVolumeUsd = Number(totalVolumeMicro) / 1_000_000;
      const avgTradeUsd = totalTrades > 0 ? totalVolumeUsd / totalTrades : 0;
      const winRate = winCount + lossCount > 0 ? winCount / (winCount + lossCount) : 0;

      res.json({
        totalTrades,
        buyCount,
        sellCount,
        winCount,
        lossCount,
        winRate,
        totalVolumeUsd,
        avgTradeUsd,
        openPositionsCount,
      });
    } catch (err: any) {
      handleError(res, err, 500);
    }
  });

  // --------------------------------------------------------------------------
  // SSE
  // --------------------------------------------------------------------------

  app.get('/api/sse/prediction-prices', (req, res) => {
    const idsParam = req.query.ids as string;
    const initialIds = idsParam ? idsParam.split(',') : [];
    const clientId = predictionSseFeed.addClient(res, initialIds);
    if (!clientId) {
      return; // 503 already sent
    }
  });

  app.post('/api/sse/prediction-prices/subscribe', publicApiLimiter, (req, res) => {
    const { clientId, tokenIds } = req.body;
    if (!clientId || !Array.isArray(tokenIds)) {
      return res.status(400).json({ error: 'clientId and tokenIds required' });
    }
    predictionSseFeed.subscribe(clientId, tokenIds);
    res.json({ success: true });
  });

  app.post('/api/sse/prediction-prices/unsubscribe', publicApiLimiter, (req, res) => {
    const { clientId, tokenIds } = req.body;
    if (!clientId || !Array.isArray(tokenIds)) {
      return res.status(400).json({ error: 'clientId and tokenIds required' });
    }
    predictionSseFeed.unsubscribe(clientId, tokenIds);
    res.json({ success: true });
  });
}
