import { db } from '../../../db';
import { sbEvents, sbMarkets, sbLeagueActivity, sbBets } from '@shared/schema';
import { eq, and, gte } from 'drizzle-orm';
import { createOddsProvider } from '../providers';

const LEAGUES = (process.env.SPORTSBOOK_LEAGUES || 'basketball_nba,americanfootball_nfl,soccer_epl,soccer_uefa_champs_league').split(',').map(s => s.trim()).filter(Boolean);
const LAZY_WINDOW_MS_RAW = process.env.SPORTSBOOK_ODDS_LAZY_WINDOW_SEC || '600';
const MIN_INTERVAL_MS_RAW = process.env.SPORTSBOOK_ODDS_MIN_INTERVAL_SEC || '300';
const LAZY_WINDOW_MS = (Number.isFinite(parseInt(LAZY_WINDOW_MS_RAW, 10)) ? parseInt(LAZY_WINDOW_MS_RAW, 10) : 600) * 1000;
const MIN_INTERVAL_MS = (Number.isFinite(parseInt(MIN_INTERVAL_MS_RAW, 10)) ? parseInt(MIN_INTERVAL_MS_RAW, 10) : 300) * 1000;

export async function ingestOdds(): Promise<void> {
  const provider = createOddsProvider();
  const now = new Date();

  for (const league of LEAGUES) {
    try {
      // Lazy refresh check: is this league "active"?
      const isActive = await isLeagueActiveForOdds(league, now);
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

      console.log(`[sportsbook-ingest-odds] fetching ${league} via ${provider.name}`);
      const { events, odds } = await provider.fetchEventsWithOdds(league);

      // Upsert events
      for (const ev of events) {
        const existing = await db.select({ status: sbEvents.status })
          .from(sbEvents)
          .where(eq(sbEvents.externalId, ev.externalId))
          .limit(1);

        if (existing.length > 0) {
          // Don't overwrite status if already completed or cancelled
          const currentStatus = existing[0].status;
          if (currentStatus === 'completed' || currentStatus === 'cancelled') {
            await db.update(sbEvents)
              .set({
                homeTeam: ev.homeTeam,
                awayTeam: ev.awayTeam,
                updatedAt: now,
              })
              .where(eq(sbEvents.externalId, ev.externalId));
          } else {
            await db.update(sbEvents)
              .set({
                league: ev.league,
                homeTeam: ev.homeTeam,
                awayTeam: ev.awayTeam,
                commenceTime: ev.commenceTime,
                updatedAt: now,
              })
              .where(eq(sbEvents.externalId, ev.externalId));
          }
        } else {
          await db.insert(sbEvents).values({
            externalId: ev.externalId,
            league: ev.league,
            homeTeam: ev.homeTeam,
            awayTeam: ev.awayTeam,
            commenceTime: ev.commenceTime,
            status: 'scheduled',
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      // Upsert odds: flip isLatest, insert new
      for (const odd of odds) {
        const eventRows = await db.select({ id: sbEvents.id })
          .from(sbEvents)
          .where(eq(sbEvents.externalId, odd.externalEventId))
          .limit(1);

        if (eventRows.length === 0) continue;
        const eventId = eventRows[0].id;

        // Mark previous latest as not latest
        await db.update(sbMarkets)
          .set({ isLatest: false })
          .where(
            and(
              eq(sbMarkets.eventId, eventId),
              eq(sbMarkets.marketType, odd.marketType),
              eq(sbMarkets.bookmakerKey, odd.bookmakerKey),
              eq(sbMarkets.isLatest, true)
            )
          );

        // Insert new latest
        await db.insert(sbMarkets).values({
          eventId,
          marketType: odd.marketType,
          bookmakerKey: odd.bookmakerKey,
          homeOdds: String(odd.homeOdds),
          awayOdds: String(odd.awayOdds),
          drawOdds: odd.drawOdds != null ? String(odd.drawOdds) : null,
          fetchedAt: odd.fetchedAt,
          isLatest: true,
        });
      }

      // Update league activity
      await db.insert(sbLeagueActivity)
        .values({ league, lastIngestAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: sbLeagueActivity.league,
          set: { lastIngestAt: now, updatedAt: now },
        });

      console.log(`[sportsbook-ingest-odds] ${league}: ${events.length} events, ${odds.length} odds snapshots`);
    } catch (err: any) {
      console.error(`[sportsbook-ingest-odds] league=${league} error:`, err.message);
    }
  }
}

async function isLeagueActiveForOdds(league: string, now: Date): Promise<boolean> {
  const windowStart = new Date(now.getTime() - LAZY_WINDOW_MS);

  // Check recent user views
  const activity = await db.select({ lastUserViewAt: sbLeagueActivity.lastUserViewAt })
    .from(sbLeagueActivity)
    .where(eq(sbLeagueActivity.league, league))
    .limit(1);

  if (activity.length > 0 && activity[0].lastUserViewAt) {
    if (new Date(activity[0].lastUserViewAt) >= windowStart) {
      return true;
    }
  }

  // Check open bets on this league with events that haven't started yet
  const openBets = await db.select({ id: sbBets.id })
    .from(sbBets)
    .innerJoin(sbEvents, eq(sbBets.eventId, sbEvents.id))
    .where(
      and(
        eq(sbEvents.league, league),
        eq(sbBets.status, 'open'),
        gte(sbEvents.commenceTime, now)
      )
    )
    .limit(1);

  return openBets.length > 0;
}
