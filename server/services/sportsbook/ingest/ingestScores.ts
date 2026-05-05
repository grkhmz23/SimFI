import { db } from '../../../db';
import { sbEvents, sbLeagueActivity, sbBets } from '@shared/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { createOddsProvider } from '../providers';

const LEAGUES = (process.env.SPORTSBOOK_LEAGUES || 'basketball_nba,americanfootball_nfl,soccer_epl,soccer_uefa_champs_league').split(',').map(s => s.trim()).filter(Boolean);
const ACTIVE_BEFORE_MS = parseInt(process.env.SPORTSBOOK_SCORES_ACTIVE_BEFORE_SEC || '21600', 10) * 1000;
const ACTIVE_AFTER_MS = parseInt(process.env.SPORTSBOOK_SCORES_ACTIVE_AFTER_SEC || '14400', 10) * 1000;
const MIN_INTERVAL_MS = parseInt(process.env.SPORTSBOOK_ODDS_MIN_INTERVAL_SEC || '300', 10) * 1000;

export async function ingestScores(): Promise<void> {
  const provider = createOddsProvider();
  const now = new Date();

  for (const league of LEAGUES) {
    try {
      // Active window check
      const isActive = await isLeagueActiveForScores(league, now);
      if (!isActive) {
        continue;
      }

      // Min interval check
      const activity = await db.select()
        .from(sbLeagueActivity)
        .where(eq(sbLeagueActivity.league, league))
        .limit(1);

      const lastIngestAt = activity[0]?.lastIngestAt;
      if (lastIngestAt && now.getTime() - new Date(lastIngestAt).getTime() < MIN_INTERVAL_MS) {
        continue;
      }

      console.log(`[sportsbook-ingest-scores] fetching ${league} via ${provider.name}`);
      const scores = await provider.fetchScores(league, 3);

      for (const score of scores) {
        const eventRows = await db.select({ id: sbEvents.id })
          .from(sbEvents)
          .where(eq(sbEvents.externalId, score.externalEventId))
          .limit(1);

        if (eventRows.length === 0) continue;

        const eventId = eventRows[0].id;

        // Don't overwrite completed/cancelled events
        const existing = await db.select({ status: sbEvents.status })
          .from(sbEvents)
          .where(eq(sbEvents.id, eventId))
          .limit(1);

        if (existing.length > 0) {
          const currentStatus = existing[0].status;
          if (currentStatus === 'completed' || currentStatus === 'cancelled') {
            continue;
          }
        }

        await db.update(sbEvents)
          .set({
            status: score.status,
            homeScore: score.homeScore,
            awayScore: score.awayScore,
            completedAt: score.completedAt,
            rawScores: score.raw != null ? JSON.stringify(score.raw) : null,
            updatedAt: now,
          })
          .where(eq(sbEvents.id, eventId));
      }

      // Update league activity
      await db.insert(sbLeagueActivity)
        .values({ league, lastIngestAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: sbLeagueActivity.league,
          set: { lastIngestAt: now, updatedAt: now },
        });

      console.log(`[sportsbook-ingest-scores] ${league}: ${scores.length} score updates`);
    } catch (err: any) {
      console.error(`[sportsbook-ingest-scores] league=${league} error:`, err.message);
    }
  }
}

async function isLeagueActiveForScores(league: string, now: Date): Promise<boolean> {
  const windowStart = new Date(now.getTime() - ACTIVE_BEFORE_MS);
  const windowEnd = new Date(now.getTime() + ACTIVE_AFTER_MS);

  // Events in active time window
  const upcomingEvents = await db.select({ id: sbEvents.id })
    .from(sbEvents)
    .where(
      and(
        eq(sbEvents.league, league),
        gte(sbEvents.commenceTime, windowStart),
        lte(sbEvents.commenceTime, windowEnd)
      )
    )
    .limit(1);

  if (upcomingEvents.length > 0) return true;

  // Open bets on this league where event is not completed
  const openBets = await db.select({ id: sbBets.id })
    .from(sbBets)
    .innerJoin(sbEvents, eq(sbBets.eventId, sbEvents.id))
    .where(
      and(
        eq(sbEvents.league, league),
        eq(sbBets.status, 'open'),
        sql`${sbEvents.status} != 'completed'`
      )
    )
    .limit(1);

  return openBets.length > 0;
}
