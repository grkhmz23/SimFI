// server/services/prediction/predictionExecutionTx.ts
// Atomic database execution for prediction-market paper trades

import { db } from '../../db';
import { predictionPaperBalances, predictionPositions, predictionTrades, predictionMarkets } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import type { Quote } from './predictionQuoteService.js';

const STARTING_BALANCE_MICRO_USD = BigInt(
  (process.env.PREDICTION_STARTING_BALANCE_USD ? parseInt(process.env.PREDICTION_STARTING_BALANCE_USD, 10) : 10000) * 1_000_000
);

interface ExecuteTradeParams {
  userId: string;
  quote: Quote;
  idempotencyKey?: string;
}

interface ExecuteTradeResult {
  tradeId: string;
  filledShares: number;
  avgPrice: number;
  slippageBps: number;
  totalUsd: number;
  newBalanceUsd: number;
  position: { shares: number; avgPrice: number } | null;
}

export async function executeTrade(params: ExecuteTradeParams): Promise<ExecuteTradeResult> {
  const { userId, quote, idempotencyKey } = params;

  return await db.transaction(async (tx) => {
    // (1) Idempotency check
    if (idempotencyKey) {
      const [existing] = await tx.select()
        .from(predictionTrades)
        .where(
          and(
            eq(predictionTrades.userId, userId),
            eq(predictionTrades.idempotencyKey, idempotencyKey)
          )
        )
        .limit(1);

      if (existing) {
        // Replay-safe: return the existing trade's result
        const balanceRow = await tx.select()
          .from(predictionPaperBalances)
          .where(eq(predictionPaperBalances.userId, userId))
          .limit(1);
        const balanceMicro = balanceRow[0]?.balanceMicroUsd ?? 0n;

        return {
          tradeId: existing.id,
          filledShares: Number(existing.sharesMicro) / 1_000_000,
          avgPrice: Number(existing.avgPrice),
          slippageBps: existing.slippageBps,
          totalUsd: Number(existing.totalMicroUsd) / 1_000_000,
          newBalanceUsd: Number(balanceMicro) / 1_000_000,
          position: null, // skip position reconstruction on replay
        };
      }
    }

    // (2) Lock balance (or create default)
    const [balanceRow] = await tx.select()
      .from(predictionPaperBalances)
      .where(eq(predictionPaperBalances.userId, userId))
      .for('update')
      .limit(1);

    let balanceMicro: bigint;
    if (!balanceRow) {
      await tx.insert(predictionPaperBalances)
        .values({
          userId,
          balanceMicroUsd: STARTING_BALANCE_MICRO_USD,
          realizedPnlMicroUsd: 0n,
        })
        .onConflictDoNothing();
      balanceMicro = STARTING_BALANCE_MICRO_USD;
    } else {
      balanceMicro = balanceRow.balanceMicroUsd;
    }

    // (3) Lock position if exists
    const [positionRow] = await tx.select()
      .from(predictionPositions)
      .where(
        and(
          eq(predictionPositions.userId, userId),
          eq(predictionPositions.tokenId, quote.tokenId)
        )
      )
      .for('update')
      .limit(1);

    // (4) Check guards
    if (quote.side === 'BUY') {
      if (balanceMicro < quote.totalMicroUsd) {
        throw new Error('Insufficient balance');
      }
    } else {
      // SELL
      if (!positionRow || positionRow.sharesMicro < quote.sharesMicro) {
        throw new Error('Insufficient shares to sell');
      }
    }

    // (5) Apply state changes
    let newBalanceMicro: bigint;
    let newPositionShares: bigint;
    let newPositionCostBasis: bigint;
    let newPositionAvgPrice: number;
    let positionId: string | null = null;

    if (quote.side === 'BUY') {
      newBalanceMicro = balanceMicro - quote.totalMicroUsd;

      if (positionRow) {
        newPositionShares = positionRow.sharesMicro + quote.sharesMicro;
        newPositionCostBasis = positionRow.costBasisMicroUsd + quote.totalMicroUsd;
        newPositionAvgPrice = Number(newPositionCostBasis) / Number(newPositionShares);
        positionId = positionRow.id;
      } else {
        newPositionShares = quote.sharesMicro;
        newPositionCostBasis = quote.totalMicroUsd;
        newPositionAvgPrice = quote.avgPrice;
      }
    } else {
      // SELL
      const proceedsMicroUsd = quote.totalMicroUsd;
      const proportionalCostBasis =
        (quote.sharesMicro * positionRow!.costBasisMicroUsd) / positionRow!.sharesMicro;
      const realizedPnlMicro = proceedsMicroUsd - proportionalCostBasis;

      newBalanceMicro = balanceMicro + proceedsMicroUsd;
      newPositionShares = positionRow!.sharesMicro - quote.sharesMicro;
      newPositionCostBasis = positionRow!.costBasisMicroUsd - proportionalCostBasis;
      newPositionAvgPrice = newPositionShares > 0n
        ? Number(newPositionCostBasis) / Number(newPositionShares)
        : 0;
      positionId = positionRow!.id;

      // Update realized PnL on balance row
      await tx.update(predictionPaperBalances)
        .set({
          realizedPnlMicroUsd: sql`${predictionPaperBalances.realizedPnlMicroUsd} + ${realizedPnlMicro}`,
        })
        .where(eq(predictionPaperBalances.userId, userId));
    }

    // Update balance
    await tx.insert(predictionPaperBalances)
      .values({
        userId,
        balanceMicroUsd: newBalanceMicro,
        realizedPnlMicroUsd: 0n,
      })
      .onConflictDoUpdate({
        target: predictionPaperBalances.userId,
        set: { balanceMicroUsd: newBalanceMicro },
      });

    // Upsert or delete position
    if (newPositionShares > 0n) {
      if (positionId) {
        await tx.update(predictionPositions)
          .set({
            sharesMicro: newPositionShares,
            avgPrice: String(newPositionAvgPrice),
            costBasisMicroUsd: newPositionCostBasis,
            updatedAt: new Date(),
          })
          .where(eq(predictionPositions.id, positionId));
      } else {
        const [newPos] = await tx.insert(predictionPositions)
          .values({
            userId,
            conditionId: quote.conditionId,
            tokenId: quote.tokenId,
            outcome: quote.outcome,
            sharesMicro: newPositionShares,
            avgPrice: String(newPositionAvgPrice),
            costBasisMicroUsd: newPositionCostBasis,
          })
          .returning();
        positionId = newPos.id;
      }
    } else if (positionId) {
      await tx.delete(predictionPositions)
        .where(eq(predictionPositions.id, positionId));
      positionId = null;
    }

    // (6) Insert trade row
    const [trade] = await tx.insert(predictionTrades)
      .values({
        userId,
        conditionId: quote.conditionId,
        tokenId: quote.tokenId,
        outcome: quote.outcome,
        side: quote.side,
        sharesMicro: quote.sharesMicro,
        avgPrice: String(quote.avgPrice),
        slippageBps: quote.slippageBps,
        feeMicroUsd: 0n,
        totalMicroUsd: quote.totalMicroUsd,
        bookSnapshot: quote.bookSnapshot,
        idempotencyKey: idempotencyKey || null,
      })
      .returning();

    // Fetch final balance for response
    const [finalBalance] = await tx.select()
      .from(predictionPaperBalances)
      .where(eq(predictionPaperBalances.userId, userId))
      .limit(1);

    return {
      tradeId: trade.id,
      filledShares: Number(quote.sharesMicro) / 1_000_000,
      avgPrice: quote.avgPrice,
      slippageBps: quote.slippageBps,
      totalUsd: Number(quote.totalMicroUsd) / 1_000_000,
      newBalanceUsd: Number(finalBalance?.balanceMicroUsd ?? 0n) / 1_000_000,
      position: newPositionShares > 0n
        ? {
            shares: Number(newPositionShares) / 1_000_000,
            avgPrice: newPositionAvgPrice,
          }
        : null,
    };
  });
}
