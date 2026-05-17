import { db } from '../../db';
import { users, sbEvents, sbBets } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import type { Chain } from '@shared/schema';
import { LAMPORTS_PER_SOL, WEI_PER_ETH } from '@shared/schema';

const MIN_STAKE_SOL = 0.01;
const MIN_STAKE_ETH = 0.01;
const MAX_STAKE_SOL = 1_000_000;
const MAX_STAKE_ETH = 1_000_000;
const MAX_ODDS = 1000.0;

export interface BetExecutionParams {
  userId: string;
  eventId: string;
  marketId: string;
  selection: "home" | "away" | "draw";
  chain: Chain;
  stakeAtomic: bigint;
  oddsAtPlacement: number;
  bookmakerKey: string;
  idempotencyKey?: string;
}

export interface BetExecutionResult {
  betId: string;
  userId: string;
  eventId: string;
  selection: string;
  chain: string;
  stake: string;
  oddsAtPlacement: number;
  potentialPayout: string;
  status: string;
  placedAt: Date;
}

/**
 * Convert a decimal string (e.g. "1.5") to atomic units without floating-point loss.
 */
function decimalStringToAtomic(value: string, decimals: number): bigint {
  const clean = value.replace(',', '.').trim();
  const negative = clean.startsWith('-');
  const unsigned = negative ? clean.slice(1) : clean;
  const [wholeStr, fracStr = ''] = unsigned.split('.');
  const whole = BigInt(wholeStr || '0');
  const frac = fracStr.padEnd(decimals, '0').slice(0, decimals);
  const fracVal = BigInt(frac);
  const multiplier = BigInt('1' + '0'.repeat(decimals));
  const result = whole * multiplier + fracVal;
  return negative ? -result : result;
}

export function humanToAtomicStake(stakeHumanStr: string, chain: Chain): bigint {
  if (chain === 'solana') {
    return decimalStringToAtomic(stakeHumanStr, 9);
  } else {
    return decimalStringToAtomic(stakeHumanStr, 18);
  }
}

export function atomicToHumanStake(stakeAtomic: bigint, chain: Chain): number {
  if (chain === 'solana') {
    return Number(stakeAtomic) / LAMPORTS_PER_SOL;
  } else {
    return Number(stakeAtomic) / Number(WEI_PER_ETH);
  }
}

export function validateStake(stakeHuman: number, chain: Chain): { valid: boolean; error?: string } {
  const min = chain === 'solana' ? MIN_STAKE_SOL : MIN_STAKE_ETH;
  const max = chain === 'solana' ? MAX_STAKE_SOL : MAX_STAKE_ETH;

  if (stakeHuman < min) {
    return { valid: false, error: `Minimum stake is ${min} ${chain === 'solana' ? 'SOL' : 'ETH'}` };
  }
  if (stakeHuman > max) {
    return { valid: false, error: `Maximum stake is ${max} ${chain === 'solana' ? 'SOL' : 'ETH'}` };
  }
  return { valid: true };
}

export function validateOdds(odds: number): { valid: boolean; error?: string } {
  if (odds <= 1.0) {
    return { valid: false, error: "Odds must be greater than 1.0" };
  }
  if (odds > MAX_ODDS) {
    return { valid: false, error: `Maximum odds is ${MAX_ODDS}` };
  }
  return { valid: true };
}

export async function executeBet(params: BetExecutionParams): Promise<BetExecutionResult> {
  return await db.transaction(async (tx) => {
    // Idempotency check
    if (params.idempotencyKey) {
      const existing = await tx.select()
        .from(sbBets)
        .where(
          and(
            eq(sbBets.userId, params.userId),
            eq(sbBets.idempotencyKey, params.idempotencyKey)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        const bet = existing[0];
        return {
          betId: bet.id,
          userId: bet.userId,
          eventId: bet.eventId,
          selection: bet.selection,
          chain: bet.chain,
          stake: bet.stake.toString(),
          oddsAtPlacement: Number(bet.oddsAtPlacement),
          potentialPayout: bet.potentialPayout.toString(),
          status: bet.status,
          placedAt: bet.placedAt,
        };
      }
    }

    // Re-verify event is still open for betting (race-condition guard)
    const [event] = await tx.select()
      .from(sbEvents)
      .where(eq(sbEvents.id, params.eventId))
      .limit(1);

    if (!event) {
      throw Object.assign(new Error("Event not found"), { code: "EVENT_NOT_FOUND" });
    }

    if (event.status !== 'scheduled') {
      throw Object.assign(new Error("Event is no longer open for betting"), { code: "EVENT_LOCKED" });
    }

    if (event.commenceTime <= new Date()) {
      throw Object.assign(new Error("Event has already started"), { code: "EVENT_LOCKED" });
    }

    // Compute potential payout from exact atomic stake and odds using integer arithmetic
    const oddsBps = Math.round(params.oddsAtPlacement * 10000);
    const potentialPayout = params.stakeAtomic * BigInt(oddsBps) / 10000n;

    // Debit balance with guard
    let user;
    if (params.chain === 'solana') {
      const [result] = await tx
        .update(users)
        .set({ balance: sql`${users.balance} - ${params.stakeAtomic}` })
        .where(
          and(
            eq(users.id, params.userId),
            sql`${users.balance} >= ${params.stakeAtomic}`
          )
        )
        .returning();
      user = result;
    } else {
      const [result] = await tx
        .update(users)
        .set({ baseBalance: sql`${users.baseBalance} - ${params.stakeAtomic}` })
        .where(
          and(
            eq(users.id, params.userId),
            sql`${users.baseBalance} >= ${params.stakeAtomic}`
          )
        )
        .returning();
      user = result;
    }

    if (!user) {
      const [exists] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, params.userId))
        .limit(1);

      if (!exists) throw Object.assign(new Error("User not found"), { code: "USER_NOT_FOUND" });
      throw Object.assign(new Error("Insufficient balance"), { code: "INSUFFICIENT_BALANCE" });
    }

    // Insert bet
    const [bet] = await tx.insert(sbBets)
      .values({
        userId: params.userId,
        chain: params.chain,
        eventId: params.eventId,
        marketId: params.marketId,
        selection: params.selection,
        stake: params.stakeAtomic,
        oddsAtPlacement: String(params.oddsAtPlacement),
        potentialPayout,
        status: 'open',
        bookmakerKey: params.bookmakerKey,
        idempotencyKey: params.idempotencyKey || null,
      })
      .returning();

    return {
      betId: bet.id,
      userId: bet.userId,
      eventId: bet.eventId,
      selection: bet.selection,
      chain: bet.chain,
      stake: bet.stake.toString(),
      oddsAtPlacement: Number(bet.oddsAtPlacement),
      potentialPayout: bet.potentialPayout.toString(),
      status: bet.status,
      placedAt: bet.placedAt,
    };
  });
}
