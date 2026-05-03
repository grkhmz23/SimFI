// server/services/prediction/predictionSettler.ts
// Cron loop: resolves closed markets and settles open positions

import { db } from '../../db';
import { predictionMarkets, predictionPositions, predictionPaperBalances, predictionTrades } from '@shared/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { polymarketGamma } from './polymarketGamma';
import { polymarketWs } from './polymarketWs';

const SETTLE_INTERVAL_SECONDS = parseInt(process.env.PREDICTION_SETTLE_INTERVAL_SECONDS || '60', 10);
const ADVISORY_LOCK_KEY = 987654321; // unique, must not collide with leaderboard's lock key
const WS_MAX_SUBS = parseInt(process.env.PREDICTION_WS_MAX_SUBSCRIPTIONS || '200', 10);

let settleTimer: NodeJS.Timeout | null = null;
let isRunning = false;

export function startPredictionSettler(): void {
  if (settleTimer) return;
  console.log(`[prediction-settler] starting interval=${SETTLE_INTERVAL_SECONDS}s`);
  // Run immediately on start, then on interval
  runSettlerLoop().catch((err) => console.error('[prediction-settler] initial run failed:', err));
  settleTimer = setInterval(() => {
    runSettlerLoop().catch((err) => console.error('[prediction-settler] loop error:', err));
  }, SETTLE_INTERVAL_SECONDS * 1000);
}

export function stopPredictionSettler(): void {
  if (settleTimer) {
    clearInterval(settleTimer);
    settleTimer = null;
  }
  console.log('[prediction-settler] stopped');
}

async function runSettlerLoop(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  try {
    // Acquire PostgreSQL advisory lock (leader election)
    const lockResult = await db.execute(
      sql`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) as acquired`
    );
    const acquired = (lockResult.rows[0] as any)?.acquired === true;
    if (!acquired) {
      return; // Another instance is running the settler
    }

    try {
      await syncMarkets();
      await settleClosedMarkets();
      await updateWsSubscriptions();
    } finally {
      await db.execute(sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`);
    }
  } finally {
    isRunning = false;
  }
}

async function syncMarkets(): Promise<void> {
  try {
    // Fetch active markets from Gamma (closed=false)
    const gammaMarkets = await polymarketGamma.listMarkets({
      closed: false,
      active: true,
      limit: 200,
    });

    for (const market of gammaMarkets) {
      await db.insert(predictionMarkets)
        .values({
          conditionId: market.conditionId,
          slug: market.slug,
          question: market.question,
          description: market.description,
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
            description: market.description,
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
  } catch (err: any) {
    console.error('[prediction-settler] syncMarkets error:', err.message);
  }
}

async function settleClosedMarkets(): Promise<void> {
  // Find markets that are closed=false in DB but whose endDate has passed,
  // or markets we know are closed from Gamma. We'll also check any market
  // with open positions periodically by re-fetching from Gamma.
  const openMarketsWithPositions = await db.execute<{ condition_id: string }>(sql`
    SELECT DISTINCT pm.condition_id
    FROM ${predictionMarkets} pm
    INNER JOIN ${predictionPositions} pp ON pp.condition_id = pm.condition_id
    WHERE pm.closed = false
  `);

  const conditionIds = openMarketsWithPositions.rows.map((r: any) => r.condition_id);
  if (conditionIds.length === 0) return;

  // Re-fetch these markets from Gamma to see if they've closed
  const chunkSize = 20;
  for (let i = 0; i < conditionIds.length; i += chunkSize) {
    const chunk = conditionIds.slice(i, i + chunkSize);
    try {
      const gammaMarkets = await polymarketGamma.listMarkets({
        condition_ids: chunk.join(','),
        limit: chunk.length,
      });

      for (const market of gammaMarkets) {
        if (!market.closed) continue;

        // Determine winner from outcomePrices
        let winningOutcome: 'YES' | 'NO' | 'VOID' = 'VOID';
        if (market.outcomePrices.length >= 2) {
          const yesPrice = market.outcomePrices[0];
          const noPrice = market.outcomePrices[1];
          if (yesPrice >= 0.99 && noPrice <= 0.01) {
            winningOutcome = 'YES';
          } else if (noPrice >= 0.99 && yesPrice <= 0.01) {
            winningOutcome = 'NO';
          } else if (yesPrice <= 0.01 && noPrice <= 0.01) {
            winningOutcome = 'VOID';
          }
        }

        await db.transaction(async (tx) => {
          // Update market as closed
          await tx.update(predictionMarkets)
            .set({
              closed: true,
              winningOutcome,
            })
            .where(eq(predictionMarkets.conditionId, market.conditionId));

          // Fetch all open positions for this market's two tokens
          const positions = await tx.select()
            .from(predictionPositions)
            .where(
              and(
                eq(predictionPositions.conditionId, market.conditionId),
                sql`${predictionPositions.resolutionState} IS NULL`
              )
            )
            .for('update');

          for (const pos of positions) {
            const isWin =
              (pos.outcome === 'YES' && winningOutcome === 'YES') ||
              (pos.outcome === 'NO' && winningOutcome === 'NO');
            const isVoid = winningOutcome === 'VOID';

            let creditMicroUsd: bigint;
            let realizedPnlDelta: bigint;
            let settlePrice: number;

            if (isWin) {
              creditMicroUsd = pos.sharesMicro * 1_000_000n;
              realizedPnlDelta = creditMicroUsd - pos.costBasisMicroUsd;
              settlePrice = 1.0;
            } else if (isVoid) {
              creditMicroUsd = pos.costBasisMicroUsd;
              realizedPnlDelta = 0n;
              settlePrice = Number(pos.avgPrice);
            } else {
              creditMicroUsd = 0n;
              realizedPnlDelta = -pos.costBasisMicroUsd;
              settlePrice = 0.0;
            }

            // Credit balance
            if (creditMicroUsd > 0n) {
              await tx.insert(predictionPaperBalances)
                .values({
                  userId: pos.userId,
                  balanceMicroUsd: creditMicroUsd,
                  realizedPnlMicroUsd: 0n,
                })
                .onConflictDoUpdate({
                  target: predictionPaperBalances.userId,
                  set: {
                    balanceMicroUsd: sql`${predictionPaperBalances.balanceMicroUsd} + ${creditMicroUsd}`,
                  },
                });
            }

            // Update realized PnL
            await tx.update(predictionPaperBalances)
              .set({
                realizedPnlMicroUsd: sql`${predictionPaperBalances.realizedPnlMicroUsd} + ${realizedPnlDelta}`,
              })
              .where(eq(predictionPaperBalances.userId, pos.userId));

            // Insert settlement trade row
            await tx.insert(predictionTrades)
              .values({
                userId: pos.userId,
                conditionId: pos.conditionId,
                tokenId: pos.tokenId,
                outcome: pos.outcome,
                side: 'SELL',
                sharesMicro: pos.sharesMicro,
                avgPrice: String(settlePrice),
                slippageBps: 0,
                feeMicroUsd: 0n,
                totalMicroUsd: creditMicroUsd,
                bookSnapshot: JSON.stringify({ settlement: true, winningOutcome }),
              });

            // Delete position
            await tx.delete(predictionPositions)
              .where(eq(predictionPositions.id, pos.id));
          }
        });

        console.log(`[prediction-settler] settled market ${market.conditionId} → ${winningOutcome}`);
      }
    } catch (err: any) {
      console.error('[prediction-settler] settle chunk error:', err.message);
    }
  }
}

async function updateWsSubscriptions(): Promise<void> {
  try {
    // Union of: (token IDs in any open position) ∪ (top active markets by volume)
    const positionTokens = await db.execute(sql`
      SELECT DISTINCT token_id FROM ${predictionPositions}
    `);
    const posTokenIds = new Set(positionTokens.rows.map((r: any) => r.token_id));

    const topMarkets = await db.select({
      yesTokenId: predictionMarkets.yesTokenId,
      noTokenId: predictionMarkets.noTokenId,
    })
      .from(predictionMarkets)
      .where(
        and(
          eq(predictionMarkets.closed, false),
          eq(predictionMarkets.active, true)
        )
      )
      .limit(100);

    for (const m of topMarkets) {
      posTokenIds.add(m.yesTokenId);
      posTokenIds.add(m.noTokenId);
    }

    const tokenIds = Array.from(posTokenIds).slice(0, WS_MAX_SUBS);
    polymarketWs.subscribe(tokenIds);
  } catch (err: any) {
    console.error('[prediction-settler] updateWsSubscriptions error:', err.message);
  }
}
