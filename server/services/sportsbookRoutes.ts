import type { Express, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateToken } from '../middleware/auth';
import { db } from '../db';
import { sbEvents, sbMarkets, sbBets, sbLeagueActivity, users } from '@shared/schema';
import { eq, and, desc, sql, gte, lte, asc, inArray } from 'drizzle-orm';
import { PlaceBetRequest } from './sportsbook/schemas';
import { executeBet, humanToAtomicStake, validateStake, validateOdds } from './sportsbook/executeBet';

// ============================================================================
// RATE LIMITERS
// ============================================================================

const sportsbookTradeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many bet requests, please slow down' },
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
  const code = err?.code || 'UNKNOWN';
  const message = err?.message || 'Bad request';
  console.error('[sportsbook] route error:', { code, message });
  res.status(status).json({ error: message, code });
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  return authenticateToken(req, res, next);
}

async function touchLeagueActivity(league: string): Promise<void> {
  const now = new Date();
  await db.insert(sbLeagueActivity)
    .values({ league, lastUserViewAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: sbLeagueActivity.league,
      set: { lastUserViewAt: now, updatedAt: now },
    });
}

async function touchAllLeaguesWithOpenBets(): Promise<void> {
  const now = new Date();
  const leagues = await db.select({ league: sbEvents.league })
    .from(sbBets)
    .innerJoin(sbEvents, eq(sbBets.eventId, sbEvents.id))
    .where(eq(sbBets.status, 'open'))
    .groupBy(sbEvents.league);

  for (const { league } of leagues) {
    await db.insert(sbLeagueActivity)
      .values({ league, lastUserViewAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: sbLeagueActivity.league,
        set: { lastUserViewAt: now, updatedAt: now },
      });
  }
}

function serializeEvent(row: typeof sbEvents.$inferSelect) {
  return {
    id: row.id,
    externalId: row.externalId,
    league: row.league,
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    commenceTime: row.commenceTime,
    status: row.status,
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    completedAt: row.completedAt,
    voidedReason: row.voidedReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function serializeMarket(row: typeof sbMarkets.$inferSelect) {
  return {
    id: row.id,
    eventId: row.eventId,
    marketType: row.marketType,
    bookmakerKey: row.bookmakerKey,
    homeOdds: Number(row.homeOdds),
    awayOdds: Number(row.awayOdds),
    drawOdds: row.drawOdds != null ? Number(row.drawOdds) : null,
    fetchedAt: row.fetchedAt,
    isLatest: row.isLatest,
  };
}

function serializeBet(row: typeof sbBets.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    chain: row.chain,
    eventId: row.eventId,
    marketId: row.marketId,
    selection: row.selection,
    stake: row.stake.toString(),
    oddsAtPlacement: Number(row.oddsAtPlacement),
    potentialPayout: row.potentialPayout.toString(),
    status: row.status,
    placedAt: row.placedAt,
    settledAt: row.settledAt,
    payoutAmount: row.payoutAmount?.toString() ?? null,
    bookmakerKey: row.bookmakerKey,
    notes: row.notes,
  };
}

// ============================================================================
// ROUTES
// ============================================================================

export function registerSportsbookRoutes(app: Express): void {
  // --------------------------------------------------------------------------
  // GET /api/sportsbook/leagues
  // --------------------------------------------------------------------------
  app.get('/api/sportsbook/leagues', publicApiLimiter, async (_req, res) => {
    try {
      await touchAllLeaguesWithOpenBets();

      const rows = await db.select({
        league: sbEvents.league,
        eventCount: sql<number>`count(*)::int`,
        upcomingCount: sql<number>`count(*) filter (where ${sbEvents.commenceTime} > now())::int`,
      })
        .from(sbEvents)
        .where(
          and(
            sql`${sbEvents.status} != 'completed'`,
            sql`${sbEvents.status} != 'cancelled'`
          )
        )
        .groupBy(sbEvents.league)
        .orderBy(desc(sql`count(*)`));

      res.json(rows);
    } catch (err: any) {
      handleError(res, err, 500);
    }
  });

  // --------------------------------------------------------------------------
  // GET /api/sportsbook/events
  // --------------------------------------------------------------------------
  app.get('/api/sportsbook/events', publicApiLimiter, async (req, res) => {
    try {
      const league = req.query.league as string | undefined;
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;

      if (league) {
        await touchLeagueActivity(league);
      }

      const conditions = [];
      if (league) conditions.push(eq(sbEvents.league, league));
      if (from) conditions.push(gte(sbEvents.commenceTime, new Date(from)));
      if (to) conditions.push(lte(sbEvents.commenceTime, new Date(to)));

      const events = await db.select()
        .from(sbEvents)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(sbEvents.commenceTime))
        .limit(200);

      const eventIds = events.map((e) => e.id);
      const markets = eventIds.length > 0
        ? await db.select()
            .from(sbMarkets)
            .where(
              and(
                inArray(sbMarkets.eventId, eventIds),
                eq(sbMarkets.isLatest, true)
              )
            )
        : [];

      const marketsByEvent = new Map<string, typeof sbMarkets.$inferSelect>();
      for (const m of markets) {
        marketsByEvent.set(m.eventId, m);
      }

      const result = events.map((ev) => ({
        ...serializeEvent(ev),
        market: marketsByEvent.has(ev.id) ? serializeMarket(marketsByEvent.get(ev.id)!) : null,
      }));

      res.json(result);
    } catch (err: any) {
      handleError(res, err, 500);
    }
  });

  // --------------------------------------------------------------------------
  // GET /api/sportsbook/events/:id
  // --------------------------------------------------------------------------
  app.get('/api/sportsbook/events/:id', publicApiLimiter, async (req, res) => {
    try {
      const eventId = req.params.id;
      const [event] = await db.select()
        .from(sbEvents)
        .where(eq(sbEvents.id, eventId))
        .limit(1);

      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      await touchLeagueActivity(event.league);

      const marketHistory = await db.select()
        .from(sbMarkets)
        .where(eq(sbMarkets.eventId, eventId))
        .orderBy(desc(sbMarkets.fetchedAt))
        .limit(20);

      res.json({
        event: serializeEvent(event),
        latestMarket: marketHistory.length > 0 ? serializeMarket(marketHistory[0]) : null,
        marketHistory: marketHistory.map(serializeMarket),
      });
    } catch (err: any) {
      handleError(res, err, 500);
    }
  });

  // --------------------------------------------------------------------------
  // POST /api/sportsbook/bets
  // --------------------------------------------------------------------------
  app.post('/api/sportsbook/bets', requireAuth, sportsbookTradeLimiter, async (req, res) => {
    try {
      const body = PlaceBetRequest.parse(req.body);
      const userId = (req as any).userId as string;
      const now = new Date();

      // 1. Load event
      const [event] = await db.select()
        .from(sbEvents)
        .where(eq(sbEvents.id, body.eventId))
        .limit(1);

      if (!event) {
        return res.status(404).json({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
      }

      if (event.status !== 'scheduled') {
        return res.status(409).json({ error: 'Event is no longer open for betting', code: 'EVENT_LOCKED' });
      }

      if (event.commenceTime <= now) {
        return res.status(409).json({ error: 'Event has already started', code: 'EVENT_LOCKED' });
      }

      // 2. Load latest market
      const [market] = await db.select()
        .from(sbMarkets)
        .where(
          and(
            eq(sbMarkets.eventId, body.eventId),
            eq(sbMarkets.marketType, 'h2h'),
            eq(sbMarkets.isLatest, true)
          )
        )
        .limit(1);

      if (!market) {
        return res.status(503).json({ error: 'No odds available for this event', code: 'MARKET_UNAVAILABLE' });
      }

      // 3. Read current odds for selection
      let currentOdds: number;
      if (body.selection === 'home') currentOdds = Number(market.homeOdds);
      else if (body.selection === 'away') currentOdds = Number(market.awayOdds);
      else currentOdds = market.drawOdds != null ? Number(market.drawOdds) : 0;

      if (currentOdds <= 0) {
        return res.status(503).json({ error: 'Odds not available for this selection', code: 'MARKET_UNAVAILABLE' });
      }

      // 4. Slippage check
      const slippagePct = Math.abs(currentOdds - body.expectedOdds) / body.expectedOdds * 10000;
      if (slippagePct > body.slippageBps) {
        return res.status(409).json({
          error: 'Odds have moved',
          code: 'ODDS_MOVED',
          currentOdds,
          expectedOdds: body.expectedOdds,
        });
      }

      // 5. Stake validation
      const stakeHuman = parseFloat(body.stake);
      if (isNaN(stakeHuman) || stakeHuman <= 0) {
        return res.status(400).json({ error: 'Invalid stake', code: 'INVALID_STAKE' });
      }

      const stakeValidation = validateStake(stakeHuman, body.chain);
      if (!stakeValidation.valid) {
        return res.status(400).json({ error: stakeValidation.error, code: 'INVALID_STAKE' });
      }

      const oddsValidation = validateOdds(currentOdds);
      if (!oddsValidation.valid) {
        return res.status(400).json({ error: oddsValidation.error, code: 'INVALID_ODDS' });
      }

      const stakeAtomic = humanToAtomicStake(body.stake, body.chain);

      // 6. Execute bet (atomic debit + insert; potentialPayout computed internally)
      const result = await executeBet({
        userId,
        eventId: body.eventId,
        marketId: market.id,
        selection: body.selection,
        chain: body.chain,
        stakeAtomic,
        oddsAtPlacement: currentOdds,
        bookmakerKey: market.bookmakerKey,
        idempotencyKey: body.idempotencyKey,
      });

      res.status(201).json(result);
    } catch (err: any) {
      if (err.code === 'INSUFFICIENT_BALANCE') {
        return res.status(402).json({ error: err.message, code: 'INSUFFICIENT_BALANCE' });
      }
      handleError(res, err, 400);
    }
  });

  // --------------------------------------------------------------------------
  // GET /api/sportsbook/bets
  // --------------------------------------------------------------------------
  app.get('/api/sportsbook/bets', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId as string;
      const statusFilter = req.query.status as string | undefined;

      const conditions = [eq(sbBets.userId, userId)];
      if (statusFilter === 'open') {
        conditions.push(eq(sbBets.status, 'open'));
      } else if (statusFilter === 'settled') {
        conditions.push(sql`${sbBets.status} != 'open'`);
      }

      const rows = await db.select({
        bet: sbBets,
        homeTeam: sbEvents.homeTeam,
        awayTeam: sbEvents.awayTeam,
        commenceTime: sbEvents.commenceTime,
      })
        .from(sbBets)
        .leftJoin(sbEvents, eq(sbBets.eventId, sbEvents.id))
        .where(and(...conditions))
        .orderBy(desc(sbBets.placedAt))
        .limit(200);

      res.json(rows.map(({ bet, homeTeam, awayTeam, commenceTime }) => ({
        ...serializeBet(bet),
        homeTeam: homeTeam ?? null,
        awayTeam: awayTeam ?? null,
        commenceTime: commenceTime?.toISOString() ?? null,
      })));
    } catch (err: any) {
      handleError(res, err, 500);
    }
  });

  // --------------------------------------------------------------------------
  // GET /api/sportsbook/leaderboard
  // --------------------------------------------------------------------------
  app.get('/api/sportsbook/leaderboard', publicApiLimiter, async (req, res) => {
    try {
      const league = req.query.league as string | undefined;
      const period = req.query.period as string | undefined; // 'all' | 'week' | 'month'

      let startTime: Date | undefined;
      const now = new Date();
      if (period === 'week') {
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (period === 'month') {
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      // Aggregate realized PnL per user from settled bets
      const conditions = [sql`${sbBets.status} != 'open'`];
      if (league) {
        conditions.push(eq(sbEvents.league, league));
      }
      if (startTime) {
        conditions.push(gte(sbBets.placedAt, startTime));
      }

      const rows = await db.select({
        userId: sbBets.userId,
        username: users.username,
        totalBets: sql<number>`count(*)::int`,
        wonBets: sql<number>`count(*) filter (where ${sbBets.status} = 'won')::int`,
        totalStaked: sql<string>`sum(${sbBets.stake})::text`,
        totalPayout: sql<string>`sum(${sbBets.payoutAmount})::text`,
        netPnl: sql<string>`(coalesce(sum(${sbBets.payoutAmount}), 0) - coalesce(sum(${sbBets.stake}), 0))::text`,
      })
        .from(sbBets)
        .innerJoin(users, eq(sbBets.userId, users.id))
        .innerJoin(sbEvents, eq(sbBets.eventId, sbEvents.id))
        .where(and(...conditions))
        .groupBy(sbBets.userId, users.username)
        .orderBy(desc(sql`(coalesce(sum(${sbBets.payoutAmount}), 0) - coalesce(sum(${sbBets.stake}), 0))`))
        .limit(100);

      res.json(rows.map((r, i) => ({
        rank: i + 1,
        userId: r.userId,
        username: r.username,
        totalBets: r.totalBets,
        wonBets: r.wonBets,
        totalStaked: r.totalStaked,
        totalPayout: r.totalPayout,
        netPnl: r.netPnl,
      })));
    } catch (err: any) {
      handleError(res, err, 500);
    }
  });
}

