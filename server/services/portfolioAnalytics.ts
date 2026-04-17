import { db } from "../db";
import { tradeHistory, users } from "@shared/schema";
import { eq, and, sql, desc, asc } from "drizzle-orm";
import type { Chain, Trade } from "@shared/schema";

const INITIAL_BALANCE_SOL = 10;
const INITIAL_BALANCE_ETH = 5;

export interface PortfolioAnalytics {
  balanceHistory: { date: string; balance: number }[];
  winCount: number;
  lossCount: number;
  bestTrade: Trade | null;
  worstTrade: Trade | null;
  dailyPnl: { date: string; pnl: number }[];
}

export const portfolioAnalytics = {
  async getAnalytics(userId: string, chain: Chain): Promise<PortfolioAnalytics> {
    const [user] = await db.select({
      balance: users.balance,
      baseBalance: users.baseBalance,
    }).from(users).where(eq(users.id, userId));

    const trades = await db.select()
      .from(tradeHistory)
      .where(and(eq(tradeHistory.userId, userId), eq(tradeHistory.chain, chain)))
      .orderBy(asc(tradeHistory.closedAt));

    const { winCount, lossCount } = await this.getWinLossCounts(userId, chain);
    const { best, worst } = await this.getBestWorst(userId, chain);

    // Build balance history by replaying trades
    const isSolana = chain === 'solana';
    const nativeDecimals = isSolana ? 9 : 18;
    const initialBalance = isSolana ? INITIAL_BALANCE_SOL : INITIAL_BALANCE_ETH;
    const currentBalanceNative = Number(isSolana ? user?.balance : user?.baseBalance) / (10 ** nativeDecimals);

    // If no trades, return flat line from initial to current
    if (trades.length === 0) {
      const today = new Date().toISOString().split('T')[0];
      return {
        balanceHistory: [
          { date: today, balance: initialBalance },
          { date: today, balance: currentBalanceNative },
        ],
        winCount,
        lossCount,
        bestTrade: best || null,
        worstTrade: worst || null,
        dailyPnl: [],
      };
    }

    // Replay trades chronologically
    let runningBalance = initialBalance;
    const balanceHistory: { date: string; balance: number }[] = [];
    const dailyPnlMap = new Map<string, number>();

    for (const trade of trades) {
      const pnlNative = Number(trade.profitLoss) / (10 ** nativeDecimals);
      runningBalance += pnlNative;
      const date = new Date(trade.closedAt).toISOString().split('T')[0];
      balanceHistory.push({ date, balance: runningBalance });
      dailyPnlMap.set(date, (dailyPnlMap.get(date) || 0) + pnlNative);
    }

    // Ensure current balance is at the end
    const lastPoint = balanceHistory[balanceHistory.length - 1];
    const today = new Date().toISOString().split('T')[0];
    if (lastPoint.date !== today || Math.abs(lastPoint.balance - currentBalanceNative) > 0.0001) {
      balanceHistory.push({ date: today, balance: currentBalanceNative });
    }

    // Daily PnL sorted by date
    const dailyPnl = Array.from(dailyPnlMap.entries())
      .map(([date, pnl]) => ({ date, pnl }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7); // Last 7 days

    return {
      balanceHistory,
      winCount,
      lossCount,
      bestTrade: best || null,
      worstTrade: worst || null,
      dailyPnl,
    };
  },

  async getWinLossCounts(userId: string, chain: Chain): Promise<{ winCount: number; lossCount: number }> {
    const [winRow] = await db.select({ count: sql<number>`count(*)` })
      .from(tradeHistory)
      .where(and(
        eq(tradeHistory.userId, userId),
        eq(tradeHistory.chain, chain),
        sql`${tradeHistory.profitLoss} > 0`
      ));
    const [lossRow] = await db.select({ count: sql<number>`count(*)` })
      .from(tradeHistory)
      .where(and(
        eq(tradeHistory.userId, userId),
        eq(tradeHistory.chain, chain),
        sql`${tradeHistory.profitLoss} < 0`
      ));
    return {
      winCount: winRow?.count || 0,
      lossCount: lossRow?.count || 0,
    };
  },

  async getBestWorst(userId: string, chain: Chain): Promise<{ best: Trade | undefined; worst: Trade | undefined }> {
    const [best] = await db.select()
      .from(tradeHistory)
      .where(and(eq(tradeHistory.userId, userId), eq(tradeHistory.chain, chain)))
      .orderBy(sql`${tradeHistory.profitLoss} DESC`)
      .limit(1);
    const [worst] = await db.select()
      .from(tradeHistory)
      .where(and(eq(tradeHistory.userId, userId), eq(tradeHistory.chain, chain)))
      .orderBy(sql`${tradeHistory.profitLoss} ASC`)
      .limit(1);
    return { best, worst };
  }
};
