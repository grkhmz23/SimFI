import { db } from '../../../db';
import { sbEvents, sbBets, sbMarkets, users } from '@shared/schema';
import { eq, and, sql, lt } from 'drizzle-orm';

const VOID_AFTER_MS = parseInt(process.env.SPORTSBOOK_BET_VOID_AFTER_HOURS || '168', 10) * 60 * 60 * 1000;

export async function settleBets(): Promise<void> {
  const now = new Date();

  // ========================================================================
  // 1. Settle completed events
  // ========================================================================
  const openBetsOnCompleted = await db.select({
    bet: sbBets,
    event: sbEvents,
    market: sbMarkets,
  })
    .from(sbBets)
    .innerJoin(sbEvents, eq(sbBets.eventId, sbEvents.id))
    .innerJoin(sbMarkets, eq(sbBets.marketId, sbMarkets.id))
    .where(
      and(
        eq(sbBets.status, 'open'),
        eq(sbEvents.status, 'completed')
      )
    );

  for (const { bet, event, market } of openBetsOnCompleted) {
    try {
      const homeScore = event.homeScore ?? 0;
      const awayScore = event.awayScore ?? 0;

      let outcome: 'home' | 'away' | 'draw';
      if (homeScore > awayScore) outcome = 'home';
      else if (awayScore > homeScore) outcome = 'away';
      else outcome = 'draw';

      let newStatus: 'won' | 'lost' | 'void';
      let payoutAmount: bigint;

      if (bet.selection === outcome) {
        newStatus = 'won';
        payoutAmount = bet.potentialPayout;
      } else if (outcome === 'draw' && bet.selection !== 'draw' && market.drawOdds == null) {
        // 2-way market draw push → void, refund stake
        newStatus = 'void';
        payoutAmount = bet.stake;
      } else {
        newStatus = 'lost';
        payoutAmount = 0n;
      }

      await db.transaction(async (tx) => {
        // Credit balance if payout > 0
        if (payoutAmount > 0n) {
          if (bet.chain === 'solana') {
            await tx.update(users)
              .set({ balance: sql`${users.balance} + ${payoutAmount}` })
              .where(eq(users.id, bet.userId));
          } else {
            await tx.update(users)
              .set({ baseBalance: sql`${users.baseBalance} + ${payoutAmount}` })
              .where(eq(users.id, bet.userId));
          }
        }

        // Update bet
        await tx.update(sbBets)
          .set({
            status: newStatus,
            payoutAmount,
            settledAt: now,
            notes: `Settled: ${outcome} wins (${homeScore}-${awayScore})`,
          })
          .where(eq(sbBets.id, bet.id));
      });

      console.log(`[sportsbook-settler] settled bet=${bet.id} event=${event.id} outcome=${outcome} status=${newStatus} payout=${payoutAmount}`);
    } catch (err: any) {
      console.error(`[sportsbook-settler] failed to settle bet=${bet.id}:`, err.message);
    }
  }

  // ========================================================================
  // 2. Void stale events (no result within void window)
  // ========================================================================
  const voidCutoff = new Date(now.getTime() - VOID_AFTER_MS);

  const staleBets = await db.select({
    bet: sbBets,
    event: sbEvents,
  })
    .from(sbBets)
    .innerJoin(sbEvents, eq(sbBets.eventId, sbEvents.id))
    .where(
      and(
        eq(sbBets.status, 'open'),
        lt(sbEvents.commenceTime, voidCutoff),
        sql`${sbEvents.status} != 'completed'`
      )
    );

  for (const { bet, event } of staleBets) {
    try {
      await db.transaction(async (tx) => {
        // Refund stake
        if (bet.chain === 'solana') {
          await tx.update(users)
            .set({ balance: sql`${users.balance} + ${bet.stake}` })
            .where(eq(users.id, bet.userId));
        } else {
          await tx.update(users)
            .set({ baseBalance: sql`${users.baseBalance} + ${bet.stake}` })
            .where(eq(users.id, bet.userId));
        }

        await tx.update(sbBets)
          .set({
            status: 'void',
            payoutAmount: bet.stake,
            settledAt: now,
            notes: `Voided: no result within ${VOID_AFTER_MS / 3600000}h of start`,
          })
          .where(eq(sbBets.id, bet.id));
      });

      console.log(`[sportsbook-settler] voided bet=${bet.id} event=${event.id} (stale)`);
    } catch (err: any) {
      console.error(`[sportsbook-settler] failed to void bet=${bet.id}:`, err.message);
    }
  }
}
