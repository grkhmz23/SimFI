import { db } from '../../db';
import { users, sbEvents, sbMarkets, sbBets } from '@shared/schema';
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
  potentialPayout: bigint;
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
        potentialPayout: params.potentialPayout,
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

export function humanToAtomicStake(stakeHuman: number, chain: Chain): bigint {
  if (chain === 'solana') {
    return BigInt(Math.floor(stakeHuman * LAMPORTS_PER_SOL));
  } else {
    return BigInt(Math.floor(stakeHuman * 1e18));
  }
}

export function atomicToHumanStake(stakeAtomic: bigint, chain: Chain): number {
  if (chain === 'solana') {
    return Number(stakeAtomic) / LAMPORTS_PER_SOL;
  } else {
    return Number(stakeAtomic) / 1e18;
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
