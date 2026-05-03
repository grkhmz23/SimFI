// server/services/prediction/predictionExecution.ts
// Pure math module for walking the order book and computing fills

import type { OrderBook } from './polymarketClob';

export class InsufficientLiquidityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientLiquidityError';
  }
}

// 1 share = 1,000,000 micro-shares
const MICROS_PER_SHARE = 1_000_000n;

/**
 * Walk the order book for a given side and share count.
 * BUY walks asks ascending; SELL walks bids descending.
 */
export function walkBook(
  book: OrderBook,
  side: 'BUY' | 'SELL',
  sharesMicro: bigint
): { avgPrice: number; consumedMicro: bigint } {
  if (sharesMicro <= 0n) {
    throw new Error('sharesMicro must be positive');
  }

  const levels = side === 'BUY'
    ? [...book.asks].sort((a, b) => a.price - b.price) // ascending
    : [...book.bids].sort((a, b) => b.price - a.price); // descending

  let remaining = sharesMicro;
  let totalCostMicro = 0n; // in micro-USD (price * shares * 1e6)
  let totalSharesMicro = 0n;

  for (const level of levels) {
    if (remaining <= 0n) break;

    const levelSharesMicro = BigInt(Math.floor(level.size * 1_000_000));
    const takeSharesMicro = levelSharesMicro < remaining ? levelSharesMicro : remaining;

    // price is $0..$1, so cost = price * shares
    // To keep bigint: price * takeSharesMicro as number, then round
    const levelCostMicro = BigInt(Math.round(level.price * Number(takeSharesMicro)));

    totalCostMicro += levelCostMicro;
    totalSharesMicro += takeSharesMicro;
    remaining -= takeSharesMicro;
  }

  if (remaining > 0n) {
    throw new InsufficientLiquidityError(
      `Book lacks depth. Needed ${sharesMicro} micro-shares, filled ${totalSharesMicro}`
    );
  }

  const avgPrice = totalSharesMicro > 0n
    ? Number(totalCostMicro) / Number(totalSharesMicro)
    : 0;

  return { avgPrice, consumedMicro: totalSharesMicro };
}

/**
 * Walk the order book by notional USD amount (BUY only).
 * Returns shares bought and average price.
 */
export function walkBookByNotional(
  book: OrderBook,
  side: 'BUY',
  notionalMicroUsd: bigint
): { avgPrice: number; sharesMicro: bigint } {
  if (side !== 'BUY') {
    throw new Error('walkBookByNotional only supports BUY');
  }
  if (notionalMicroUsd <= 0n) {
    throw new Error('notionalMicroUsd must be positive');
  }

  const levels = [...book.asks].sort((a, b) => a.price - b.price);

  let remainingBudgetMicro = notionalMicroUsd;
  let totalCostMicro = 0n;
  let totalSharesMicro = 0n;

  for (const level of levels) {
    if (remainingBudgetMicro <= 0n) break;
    if (level.price <= 0) continue;

    const levelSharesMicro = BigInt(Math.floor(level.size * 1_000_000));
    // Max shares we can buy at this level given remaining budget
    // budget / price = max shares
    const maxSharesAtLevelMicro = BigInt(Math.round(Number(remainingBudgetMicro) / level.price));
    const takeSharesMicro = levelSharesMicro < maxSharesAtLevelMicro ? levelSharesMicro : maxSharesAtLevelMicro;

    if (takeSharesMicro <= 0n) continue;

    const costMicro = BigInt(Math.round(level.price * Number(takeSharesMicro)));
    totalCostMicro += costMicro;
    totalSharesMicro += takeSharesMicro;
    remainingBudgetMicro -= costMicro;
  }

  if (totalSharesMicro <= 0n) {
    throw new InsufficientLiquidityError('Book lacks depth for notional budget');
  }

  const avgPrice = Number(totalCostMicro) / Number(totalSharesMicro);
  return { avgPrice, sharesMicro: totalSharesMicro };
}

/**
 * Compute slippage in basis points vs midpoint.
 */
export function computeSlippageBps(
  avgPrice: number,
  midpoint: number,
  side: 'BUY' | 'SELL'
): number {
  if (midpoint <= 0) return 0;
  const diff = side === 'BUY'
    ? avgPrice - midpoint
    : midpoint - avgPrice;
  return Math.round((diff / midpoint) * 10_000);
}
