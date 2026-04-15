import { storage } from "../storage";
import { db } from "../db";
import { tradeHistory, positions, users, type BadgeId, type Chain, LAMPORTS_PER_SOL, WEI_PER_ETH } from "@shared/schema";
import { eq, and, sql, count, gte } from "drizzle-orm";

export const achievementEngine = {
  async checkTradeBadges(userId: string, chain: Chain): Promise<void> {
    // first_trade
    const hasFirstTrade = await storage.hasAchievement(userId, 'first_trade');
    if (!hasFirstTrade) {
      const [tradeCount] = await db.select({ count: sql<number>`count(*)` })
        .from(tradeHistory)
        .where(eq(tradeHistory.userId, userId));
      if ((tradeCount?.count || 0) >= 1) {
        await storage.unlockAchievement(userId, 'first_trade');
      }
    }

    // base_beginner
    if (chain === 'base') {
      const hasBaseBeginner = await storage.hasAchievement(userId, 'base_beginner');
      if (!hasBaseBeginner) {
        const [baseTrades] = await db.select({ count: sql<number>`count(*)` })
          .from(tradeHistory)
          .where(and(eq(tradeHistory.userId, userId), eq(tradeHistory.chain, 'base')));
        if ((baseTrades?.count || 0) >= 5) {
          await storage.unlockAchievement(userId, 'base_beginner');
        }
      }
    }

    // solana_veteran
    if (chain === 'solana') {
      const hasSolanaVeteran = await storage.hasAchievement(userId, 'solana_veteran');
      if (!hasSolanaVeteran) {
        const [solTrades] = await db.select({ count: sql<number>`count(*)` })
          .from(tradeHistory)
          .where(and(eq(tradeHistory.userId, userId), eq(tradeHistory.chain, 'solana')));
        if ((solTrades?.count || 0) >= 5) {
          await storage.unlockAchievement(userId, 'solana_veteran');
        }
      }
    }
  },

  async checkProfitBadges(userId: string): Promise<void> {
    const user = await storage.getUserById(userId);
    if (!user) return;

    // profit_1eth
    const hasProfit1Eth = await storage.hasAchievement(userId, 'profit_1eth');
    if (!hasProfit1Eth && user.baseTotalProfit >= WEI_PER_ETH) {
      await storage.unlockAchievement(userId, 'profit_1eth');
    }

    // profit_10sol
    const hasProfit10Sol = await storage.hasAchievement(userId, 'profit_10sol');
    if (!hasProfit10Sol && user.totalProfit >= BigInt(10 * LAMPORTS_PER_SOL)) {
      await storage.unlockAchievement(userId, 'profit_10sol');
    }
  },

  async checkGreenDay(userId: string): Promise<void> {
    const hasGreenDay = await storage.hasAchievement(userId, 'green_day');
    if (hasGreenDay) return;

    // Check if any calendar day had positive total PnL
    const result = await db.execute(sql`
      SELECT DATE(${tradeHistory.closedAt}) as day, SUM(${tradeHistory.profitLoss}) as total_pnl
      FROM ${tradeHistory}
      WHERE ${tradeHistory.userId} = ${userId}
      GROUP BY DATE(${tradeHistory.closedAt})
      HAVING SUM(${tradeHistory.profitLoss}) > 0
      LIMIT 1
    `);
    if (result.rows.length > 0) {
      await storage.unlockAchievement(userId, 'green_day');
    }
  },

  async checkDiamondHands(userId: string): Promise<void> {
    const hasDiamondHands = await storage.hasAchievement(userId, 'diamond_hands');
    if (hasDiamondHands) return;

    // Check open positions held >24h
    const [row] = await db.select({ count: sql<number>`count(*)` })
      .from(positions)
      .where(and(
        eq(positions.userId, userId),
        sql`${positions.openedAt} <= NOW() - INTERVAL '24 hours'`
      ));
    if ((row?.count || 0) > 0) {
      await storage.unlockAchievement(userId, 'diamond_hands');
    }
  },

  async checkTop10(userId: string): Promise<void> {
    const hasTop10 = await storage.hasAchievement(userId, 'top_10');
    if (hasTop10) return;

    // Check if user ever ranked top 10 in any period
    const result = await db.execute(sql`
      WITH ranked_periods AS (
        SELECT
          ${tradeHistory.userId} as uid,
          DATE_TRUNC('day', ${tradeHistory.closedAt}) as period,
          SUM(${tradeHistory.profitLoss}) as pnl,
          ROW_NUMBER() OVER (PARTITION BY DATE_TRUNC('day', ${tradeHistory.closedAt}) ORDER BY SUM(${tradeHistory.profitLoss}) DESC) as rank
        FROM ${tradeHistory}
        GROUP BY ${tradeHistory.userId}, DATE_TRUNC('day', ${tradeHistory.closedAt})
      )
      SELECT 1 FROM ranked_periods WHERE uid = ${userId} AND rank <= 10
      LIMIT 1
    `);
    if (result.rows.length > 0) {
      await storage.unlockAchievement(userId, 'top_10');
    }
  },

  async runAllChecks(userId: string, chain?: Chain): Promise<void> {
    if (chain) {
      await this.checkTradeBadges(userId, chain);
    }
    await this.checkProfitBadges(userId);
    await this.checkGreenDay(userId);
    await this.checkDiamondHands(userId);
    await this.checkTop10(userId);
  }
};
