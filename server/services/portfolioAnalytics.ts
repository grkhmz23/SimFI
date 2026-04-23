import { db } from "../db";
import { tradeHistory, users } from "@shared/schema";
import { eq, and, sql, desc, asc } from "drizzle-orm";
import type { Chain, Trade } from "@shared/schema";
import { getNativePrice } from "../nativePrice";

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

export interface TradeAnalytics {
  overview: {
    totalTrades: number;
    winRate: number;
    avgHoldTimeHours: number;
    totalRealizedPnlNative: number;
    totalRealizedPnlUsd: number;
  };
  pnlTimeline: { date: string; cumulativePnlNative: number; cumulativePnlUsd: number }[];
  winRateByToken: {
    tokenSymbol: string;
    tokenAddress: string;
    chain: string;
    trades: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnlNative: number;
    avgPnlNative: number;
  }[];
  durationDistribution: {
    bucket: string;
    label: string;
    count: number;
    winRate: number;
  }[];
  topWinners: Trade[];
  topLosers: Trade[];
  monthlySummary: {
    month: string;
    trades: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnlNative: number;
    totalPnlUsd: number;
  }[];
  chainComparison: {
    chain: string;
    trades: number;
    winRate: number;
    totalPnlNative: number;
    totalPnlUsd: number;
  }[];
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
  },

  // ============================================================================
  // Trade Analytics Dashboard (Phase 3)
  // ============================================================================

  async getTradeAnalytics(userId: string, chain?: Chain): Promise<TradeAnalytics> {
    // Fetch all trades for the user (optionally filtered by chain)
    let tradesQuery = db.select().from(tradeHistory).where(eq(tradeHistory.userId, userId));
    if (chain) {
      tradesQuery = db.select().from(tradeHistory).where(
        and(eq(tradeHistory.userId, userId), eq(tradeHistory.chain, chain))
      ) as any;
    }
    const trades = await tradesQuery.orderBy(asc(tradeHistory.closedAt));

    // Fetch user for balance / native price context
    const [user] = await db.select({
      balance: users.balance,
      baseBalance: users.baseBalance,
    }).from(users).where(eq(users.id, userId));

    if (trades.length === 0) {
      return {
        overview: { totalTrades: 0, winRate: 0, avgHoldTimeHours: 0, totalRealizedPnlNative: 0, totalRealizedPnlUsd: 0 },
        pnlTimeline: [],
        winRateByToken: [],
        durationDistribution: [],
        topWinners: [],
        topLosers: [],
        monthlySummary: [],
        chainComparison: [],
      };
    }

    // Native prices for USD conversion
    // Fetch live prices instead of using hardcoded fallbacks
    const [solPrice, ethPrice] = await Promise.all([
      getNativePrice('solana'),
      getNativePrice('base'),
    ]);
    const solPriceUsd = solPrice ?? 150;
    const ethPriceUsd = ethPrice ?? 3000;

    // Compute overview stats
    let totalWins = 0;
    let totalLosses = 0;
    let totalHoldSeconds = 0;
    let totalPnlSol = 0;
    let totalPnlEth = 0;

    for (const trade of trades) {
      const pnl = Number(trade.profitLoss);
      if (pnl > 0) totalWins++;
      else if (pnl < 0) totalLosses++;

      const holdMs = new Date(trade.closedAt).getTime() - new Date(trade.openedAt).getTime();
      totalHoldSeconds += holdMs / 1000;

      if (trade.chain === 'solana') {
        totalPnlSol += pnl / 1e9;
      } else {
        totalPnlEth += pnl / 1e18;
      }
    }

    const totalTrades = trades.length;
    const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;
    const avgHoldTimeHours = totalTrades > 0 ? (totalHoldSeconds / totalTrades) / 3600 : 0;
    const totalRealizedPnlNative = 0; // Mixed chains, use USD instead
    const totalRealizedPnlUsd = (totalPnlSol * solPriceUsd) + (totalPnlEth * ethPriceUsd);

    // PnL Timeline (cumulative)
    const pnlTimeline: { date: string; cumulativePnlNative: number; cumulativePnlUsd: number }[] = [];
    let cumulativeSol = 0;
    let cumulativeEth = 0;
    for (const trade of trades) {
      const pnl = Number(trade.profitLoss);
      if (trade.chain === 'solana') {
        cumulativeSol += pnl / 1e9;
      } else {
        cumulativeEth += pnl / 1e18;
      }
      const date = new Date(trade.closedAt).toISOString().split('T')[0];
      const cumulativeUsd = (cumulativeSol * solPriceUsd) + (cumulativeEth * ethPriceUsd);
      pnlTimeline.push({
        date,
        cumulativePnlNative: cumulativeSol + cumulativeEth,
        cumulativePnlUsd: cumulativeUsd,
      });
    }

    // Win Rate by Token
    const tokenStats = new Map<string, {
      tokenSymbol: string;
      tokenAddress: string;
      chain: string;
      trades: number;
      wins: number;
      losses: number;
      totalPnlNative: number;
    }>();

    for (const trade of trades) {
      const key = `${trade.tokenAddress}-${trade.chain}`;
      const existing = tokenStats.get(key);
      const pnlNative = trade.chain === 'solana' ? Number(trade.profitLoss) / 1e9 : Number(trade.profitLoss) / 1e18;

      if (existing) {
        existing.trades++;
        existing.totalPnlNative += pnlNative;
        if (Number(trade.profitLoss) > 0) existing.wins++;
        else if (Number(trade.profitLoss) < 0) existing.losses++;
      } else {
        tokenStats.set(key, {
          tokenSymbol: trade.tokenSymbol,
          tokenAddress: trade.tokenAddress,
          chain: trade.chain,
          trades: 1,
          wins: Number(trade.profitLoss) > 0 ? 1 : 0,
          losses: Number(trade.profitLoss) < 0 ? 1 : 0,
          totalPnlNative: pnlNative,
        });
      }
    }

    const winRateByToken = Array.from(tokenStats.values())
      .map((t) => ({
        ...t,
        winRate: t.trades > 0 ? (t.wins / t.trades) * 100 : 0,
        avgPnlNative: t.trades > 0 ? t.totalPnlNative / t.trades : 0,
      }))
      .sort((a, b) => b.totalPnlNative - a.totalPnlNative);

    // Duration Distribution
    const buckets = [
      { max: 3600, label: '< 1h', key: '<1h' },
      { max: 21600, label: '1-6h', key: '1-6h' },
      { max: 86400, label: '6-24h', key: '6-24h' },
      { max: Infinity, label: '> 24h', key: '>24h' },
    ];

    const bucketStats = buckets.map((b) => ({ bucket: b.key, label: b.label, count: 0, wins: 0, losses: 0 }));

    for (const trade of trades) {
      const holdSeconds = (new Date(trade.closedAt).getTime() - new Date(trade.openedAt).getTime()) / 1000;
      const bucketIndex = buckets.findIndex((b) => holdSeconds < b.max);
      if (bucketIndex >= 0) {
        bucketStats[bucketIndex].count++;
        if (Number(trade.profitLoss) > 0) bucketStats[bucketIndex].wins++;
        else if (Number(trade.profitLoss) < 0) bucketStats[bucketIndex].losses++;
      }
    }

    const durationDistribution = bucketStats.map((b) => ({
      bucket: b.bucket,
      label: b.label,
      count: b.count,
      winRate: b.count > 0 ? (b.wins / b.count) * 100 : 0,
    }));

    // Top Winners / Losers
    const sortedByPnl = [...trades].sort((a, b) => Number(b.profitLoss) - Number(a.profitLoss));
    const topWinners = sortedByPnl.slice(0, 5);
    const topLosers = sortedByPnl.slice(-5).reverse();

    // Monthly Summary
    const monthMap = new Map<string, { trades: number; wins: number; losses: number; totalPnlSol: number; totalPnlEth: number }>();

    for (const trade of trades) {
      const month = trade.closedAt.toISOString().slice(0, 7); // YYYY-MM
      const existing = monthMap.get(month) || { trades: 0, wins: 0, losses: 0, totalPnlSol: 0, totalPnlEth: 0 };
      existing.trades++;
      if (Number(trade.profitLoss) > 0) existing.wins++;
      else if (Number(trade.profitLoss) < 0) existing.losses++;
      if (trade.chain === 'solana') {
        existing.totalPnlSol += Number(trade.profitLoss) / 1e9;
      } else {
        existing.totalPnlEth += Number(trade.profitLoss) / 1e18;
      }
      monthMap.set(month, existing);
    }

    const monthlySummary = Array.from(monthMap.entries())
      .map(([month, data]) => ({
        month,
        trades: data.trades,
        wins: data.wins,
        losses: data.losses,
        winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
        totalPnlNative: data.totalPnlSol + data.totalPnlEth,
        totalPnlUsd: (data.totalPnlSol * solPriceUsd) + (data.totalPnlEth * ethPriceUsd),
      }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6); // Last 6 months

    // Chain Comparison
    const chainMap = new Map<string, { trades: number; wins: number; losses: number; totalPnlSol: number; totalPnlEth: number }>();

    for (const trade of trades) {
      const c = trade.chain;
      const existing = chainMap.get(c) || { trades: 0, wins: 0, losses: 0, totalPnlSol: 0, totalPnlEth: 0 };
      existing.trades++;
      if (Number(trade.profitLoss) > 0) existing.wins++;
      else if (Number(trade.profitLoss) < 0) existing.losses++;
      if (trade.chain === 'solana') {
        existing.totalPnlSol += Number(trade.profitLoss) / 1e9;
      } else {
        existing.totalPnlEth += Number(trade.profitLoss) / 1e18;
      }
      chainMap.set(c, existing);
    }

    const chainComparison = Array.from(chainMap.entries()).map(([chain, data]) => ({
      chain,
      trades: data.trades,
      winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
      totalPnlNative: chain === 'solana' ? data.totalPnlSol : data.totalPnlEth,
      totalPnlUsd: chain === 'solana' ? data.totalPnlSol * solPriceUsd : data.totalPnlEth * ethPriceUsd,
    }));

    return {
      overview: {
        totalTrades,
        winRate,
        avgHoldTimeHours,
        totalRealizedPnlNative,
        totalRealizedPnlUsd,
      },
      pnlTimeline,
      winRateByToken,
      durationDistribution,
      topWinners,
      topLosers,
      monthlySummary,
      chainComparison,
    };
  }
};
