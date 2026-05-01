import { eq, desc, asc, and, sql, gt } from 'drizzle-orm';
import { db } from './db';
import { 
  users, positions, tradeHistory, leaderboardPeriods, telegramSessions, userAchievements, referrals, follows, watchlist, communityPicks, communityVotes,
  type User, type Position, type Trade, type TelegramSession, type UserAchievement, type Referral, type Follow, type WatchlistItem, type CommunityPick, type CommunityVote,
  type InsertUser, type InsertPosition, type InsertTrade, 
  LAMPORTS_PER_SOL, WEI_PER_ETH, type Chain, type BadgeId
} from '@shared/schema';
import { atomicToDecimal, decimalToAtomic } from './lib/priceDecimal';

export interface IStorage {
  // User operations
  createUser(data: InsertUser & { password: string }): Promise<User>;
  getUserById(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  updateUserProfile(id: string, data: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User | undefined>;
  incrementTokenVersion(id: string): Promise<User | undefined>;
  updateLastLogin(id: string, ip: string): Promise<User | undefined>;
  
  // Balance operations - chain-specific
  updateUserBalance(id: string, balanceChange: bigint, chain: Chain): Promise<User | undefined>;
  updateUserTotalProfit(id: string, profitChange: bigint, chain: Chain): Promise<User | undefined>;
  
  // Position operations - chain-aware
  createPosition(data: Omit<InsertPosition, 'id'> & { userId: string }): Promise<Position>;
  createOrAggregatePosition(data: Omit<InsertPosition, 'id'> & { userId: string }): Promise<Position>;
  getPositionById(id: string): Promise<Position | undefined>;
  getPositionByUserAndToken(userId: string, tokenAddress: string, chain: Chain): Promise<Position | undefined>;
  getUserPositions(userId: string, chain?: Chain): Promise<Position[]>;
  updatePosition(id: string, data: Partial<Omit<Position, 'id' | 'userId' | 'tokenAddress' | 'tokenName' | 'tokenSymbol' | 'openedAt'>>): Promise<Position | undefined>;
  aggregatePosition(id: string, additionalAmount: bigint, additionalNativeSpent: bigint): Promise<Position | undefined>;
  deletePosition(id: string): Promise<void>;

  // Trade operations - chain-aware
  createTrade(data: Omit<InsertTrade, 'id'> & { userId: string }): Promise<Trade>;
  getUserTrades(userId: string, chain?: Chain, limit?: number, offset?: number): Promise<Trade[]>;
  getUserTradesCount(userId: string, chain?: Chain): Promise<number>;

  // Atomic trade execution - chain-aware
  executeBuyTrade(params: {
    userId: string;
    chain: Chain;
    tokenAddress: string;
    tokenName: string;
    tokenSymbol: string;
    decimals: number;
    entryPrice: bigint;
    amount: bigint;
    nativeSpent: bigint; // lamports for Solana, wei for Base
  }): Promise<Position>;

  executeSellTrade(params: {
    userId: string;
    positionId: string;
    sellAmount: bigint;
    exitPrice: bigint;
    nativeReceived: bigint; // lamports for Solana, wei for Base
    profitLoss: bigint;
    proportionalCost: bigint;
    isFullSell?: boolean;
  }): Promise<void>;

  // Leaderboard operations - chain-aware
  getTopUsersByTotalProfit(limit: number, chain: Chain): Promise<any[]>;
  getTopUsersByPeriodProfit(startTime: Date, endTime: Date, limit: number, chain: Chain): Promise<any[]>;
  getCurrentLeaderboardPeriod(chain: Chain): Promise<typeof leaderboardPeriods.$inferSelect | undefined>;
  createLeaderboardPeriod(startTime: Date, endTime: Date, chain: Chain): Promise<typeof leaderboardPeriods.$inferSelect>;
  updateLeaderboardPeriodWinner(periodId: string, winnerId: string, winnerProfit: bigint): Promise<void>;
  getPastWinners(limit: number, chain?: Chain): Promise<any[]>;

  // Telegram session operations
  saveTelegramSession(telegramUserId: string, userId: string, token: string, balance: bigint): Promise<TelegramSession>;
  getTelegramSession(telegramUserId: string): Promise<TelegramSession | undefined>;
  getAllActiveTelegramSessions(): Promise<TelegramSession[]>;
  deleteTelegramSession(telegramUserId: string): Promise<void>;
  deleteExpiredTelegramSessions(): Promise<void>;

  // Achievement operations (Phase 2)
  getUserAchievements(userId: string): Promise<UserAchievement[]>;
  unlockAchievement(userId: string, badgeId: BadgeId): Promise<UserAchievement | undefined>;
  hasAchievement(userId: string, badgeId: BadgeId): Promise<boolean>;

  // Referral operations (Phase 4)
  getReferralByReferee(refereeId: string): Promise<Referral | undefined>;
  createReferral(referrerId: string, refereeId: string, code: string): Promise<Referral>;
  convertReferral(refereeId: string): Promise<boolean>;
  convertReferralAndReward(refereeId: string, referrerId: string, rewardAmount: bigint, chain: Chain): Promise<boolean>;
  getReferralStats(userId: string): Promise<{ total: number; converted: number; pending: number }>;
  getTopReferrers(limit: number): Promise<any[]>;

  // Follow operations (Phase 5)
  followUser(followerId: string, followingId: string): Promise<void>;
  unfollowUser(followerId: string, followingId: string): Promise<void>;
  isFollowing(followerId: string, followingId: string): Promise<boolean>;
  getFollowerCount(userId: string): Promise<number>;
  getFollowingCount(userId: string): Promise<number>;

  // Watchlist operations (Phase 9)
  addToWatchlist(userId: string, data: { chain: Chain; tokenAddress: string; tokenName: string; tokenSymbol: string; decimals: number }): Promise<WatchlistItem>;
  removeFromWatchlist(userId: string, watchlistId: string): Promise<void>;
  getUserWatchlist(userId: string, chain?: Chain): Promise<WatchlistItem[]>;
  isInWatchlist(userId: string, tokenAddress: string, chain: Chain): Promise<boolean>;

  // Community Alpha / Voting (Phase 6)
  createCommunityPick(userId: string, data: { chain: Chain; tokenAddress: string; tokenName: string; tokenSymbol: string; reason?: string }): Promise<CommunityPick>;
  deleteCommunityPick(userId: string, pickId: string): Promise<void>;
  getCommunityPicks(chain?: Chain, sortBy?: 'votes' | 'new', currentUserId?: string): Promise<(CommunityPick & { username: string; hasVoted?: boolean })[]>;
  voteOnPick(userId: string, pickId: string): Promise<{ voteCount: number }>;
  removeVoteFromPick(userId: string, pickId: string): Promise<{ voteCount: number }>;
  hasVotedOnPick(userId: string, pickId: string): Promise<boolean>;

  // Public trader stats (Phase 5)
  getPublicTraderStats(username: string): Promise<any | undefined>;
  getBestWorstTrades(userId: string, chain?: Chain): Promise<{ best: Trade | undefined; worst: Trade | undefined }>;
  getTradeWinLoss(userId: string, chain?: Chain): Promise<{ winCount: number; lossCount: number; totalCount: number }>;
  getAverageHoldTime(userId: string): Promise<number>;

  // Streak operations (Phase 8)
  getUserStreak(userId: string): Promise<{ streakCount: number; lastStreakDate: Date | null }>;
  updateUserStreak(userId: string, streakCount: number, lastStreakDate: Date | null): Promise<void>;
  claimStreakBonus(userId: string, bonusWei: bigint): Promise<void>;
  claimStreakAtomic(userId: string, streakCount: number, lastStreakDate: Date, bonusWei: bigint): Promise<void>;
}

class DbStorage implements IStorage {
  // =========================================================================
  // PRICE DECIMAL HELPERS (persistence boundary)
  // =========================================================================

  private nativeDecimalsForChain(chain: Chain): number {
    return chain === 'solana' ? 9 : 18;
  }

  private hydratePosition(row: any): Position {
    const nativeDecimals = this.nativeDecimalsForChain(row.chain as Chain);
    return {
      ...row,
      entryPrice: decimalToAtomic(row.entryPrice, nativeDecimals),
      amount: BigInt(row.amount),
      solSpent: BigInt(row.solSpent),
    } as Position;
  }

  private hydrateTrade(row: any): Trade {
    const nativeDecimals = this.nativeDecimalsForChain(row.chain as Chain);
    return {
      ...row,
      entryPrice: decimalToAtomic(row.entryPrice, nativeDecimals),
      exitPrice: decimalToAtomic(row.exitPrice, nativeDecimals),
      amount: BigInt(row.amount),
      solSpent: BigInt(row.solSpent),
      solReceived: BigInt(row.solReceived),
      profitLoss: BigInt(row.profitLoss),
    } as Trade;
  }

  async createUser(data: InsertUser & { password: string }): Promise<User> {
    // Set default balances based on provided wallets
    const solanaBalance = data.solanaWalletAddress ? BigInt(10 * LAMPORTS_PER_SOL) : 0n;
    const baseBalance = data.baseWalletAddress ? BigInt(5) * WEI_PER_ETH : 0n;
    
    // Use provided wallet addresses, fallback to legacy walletAddress for Solana
    const [user] = await db.insert(users).values({
      ...data,
      walletAddress: data.solanaWalletAddress || (data as any).walletAddress, // Legacy compatibility
      balance: solanaBalance,
      baseBalance: baseBalance,
      totalProfit: 0n,
      baseTotalProfit: 0n,
    } as any).returning();
    return user;
  }

  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async updateUserProfile(id: string, data: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User | undefined> {
    // Handle wallet address updates - maintain backward compatibility
    const updateData: any = { ...data };
    
    // If updating solanaWalletAddress, also update legacy walletAddress for compatibility
    if (data.solanaWalletAddress !== undefined) {
      updateData.walletAddress = data.solanaWalletAddress;
    }
    
    // Clean up undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });
    
    const [user] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();
    return user;
  }

  async incrementTokenVersion(id: string): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateLastLogin(id: string, ip: string): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({ lastLoginAt: new Date(), lastLoginIp: ip })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserBalance(id: string, balanceChange: bigint, chain: Chain): Promise<User | undefined> {
    if (chain === 'solana') {
      const [user] = await db.update(users)
        .set({ balance: sql`${users.balance} + ${balanceChange}` })
        .where(eq(users.id, id))
        .returning();
      return user;
    } else {
      // Base chain
      const [user] = await db.update(users)
        .set({ baseBalance: sql`${users.baseBalance} + ${balanceChange}` })
        .where(eq(users.id, id))
        .returning();
      return user;
    }
  }

  async updateUserTotalProfit(id: string, profitChange: bigint, chain: Chain): Promise<User | undefined> {
    if (chain === 'solana') {
      const [user] = await db.update(users)
        .set({ totalProfit: sql`${users.totalProfit} + ${profitChange}` })
        .where(eq(users.id, id))
        .returning();
      return user;
    } else {
      // Base chain
      const [user] = await db.update(users)
        .set({ baseTotalProfit: sql`${users.baseTotalProfit} + ${profitChange}` })
        .where(eq(users.id, id))
        .returning();
      return user;
    }
  }

  async createPosition(data: Omit<InsertPosition, 'id'> & { userId: string }): Promise<Position> {
    const nativeDecimals = this.nativeDecimalsForChain(data.chain as Chain);
    const [rawPosition] = await db.insert(positions).values({
      ...data,
      entryPrice: atomicToDecimal(data.entryPrice as any, nativeDecimals),
      amount: (data.amount as any)?.toString?.() ?? data.amount,
      solSpent: (data.solSpent as any)?.toString?.() ?? data.solSpent,
    } as any).returning();
    return this.hydratePosition(rawPosition);
  }

  async createOrAggregatePosition(data: Omit<InsertPosition, 'id'> & { userId: string }): Promise<Position> {
    const nativeDecimals = this.nativeDecimalsForChain(data.chain as Chain);
    const [rawPosition] = await db.insert(positions)
      .values({
        ...data,
        entryPrice: atomicToDecimal(data.entryPrice as any, nativeDecimals),
        amount: (data.amount as any)?.toString?.() ?? data.amount,
        solSpent: (data.solSpent as any)?.toString?.() ?? data.solSpent,
      } as any)
      .onConflictDoUpdate({
        target: [positions.userId, positions.tokenAddress, positions.chain],
        set: {
          amount: sql`${positions.amount} + ${data.amount}`,
          solSpent: sql`${positions.solSpent} + ${data.solSpent}`,
          entryPrice: sql`ROUND(
            FLOOR(
              (
                (${positions.solSpent} + EXCLUDED.sol_spent)::numeric
                * power(10::numeric, COALESCE(EXCLUDED.decimals, ${positions.decimals}, 6))
              )
              / NULLIF((${positions.amount} + EXCLUDED.amount), 0)
            )::numeric
            / power(10::numeric, CASE WHEN EXCLUDED.chain = 'solana' THEN 9 ELSE 18 END),
            18
          )`,
        },
      })
      .returning();
    return this.hydratePosition(rawPosition);
  }

  async getPositionById(id: string): Promise<Position | undefined> {
    const [rawPosition] = await db.select().from(positions).where(eq(positions.id, id));
    return rawPosition ? this.hydratePosition(rawPosition) : undefined;
  }

  async getPositionByUserAndToken(userId: string, tokenAddress: string, chain: Chain): Promise<Position | undefined> {
    const [rawPosition] = await db.select()
      .from(positions)
      .where(and(
        eq(positions.userId, userId), 
        eq(positions.tokenAddress, tokenAddress),
        eq(positions.chain, chain)
      ));
    return rawPosition ? this.hydratePosition(rawPosition) : undefined;
  }

  async getUserPositions(userId: string, chain?: Chain): Promise<Position[]> {
    let query = db.select().from(positions).where(eq(positions.userId, userId));
    
    if (chain) {
      query = db.select().from(positions).where(and(
        eq(positions.userId, userId),
        eq(positions.chain, chain)
      ));
    }
    
    const rows = await query.orderBy(desc(positions.openedAt));
    return rows.map(r => this.hydratePosition(r));
  }

  async updatePosition(id: string, data: Partial<Omit<Position, 'id' | 'userId' | 'tokenAddress' | 'tokenName' | 'tokenSymbol' | 'openedAt'>>): Promise<Position | undefined> {
    const updateData: any = { ...data };
    if (data.entryPrice !== undefined) {
      const [existing] = await db.select({ chain: positions.chain }).from(positions).where(eq(positions.id, id));
      if (existing) {
        updateData.entryPrice = atomicToDecimal(data.entryPrice as any, this.nativeDecimalsForChain(existing.chain as Chain));
      }
    }
    const [rawPosition] = await db.update(positions).set(updateData).where(eq(positions.id, id)).returning();
    return rawPosition ? this.hydratePosition(rawPosition) : undefined;
  }

  async aggregatePosition(id: string, additionalAmount: bigint, additionalNativeSpent: bigint): Promise<Position | undefined> {
    const [rawPosition] = await db.update(positions)
      .set({
        amount: sql`${positions.amount} + ${additionalAmount}`,
        solSpent: sql`${positions.solSpent} + ${additionalNativeSpent}`,
        entryPrice: sql`ROUND(
          FLOOR(
            (
              (${positions.solSpent} + ${additionalNativeSpent})::numeric
              * power(10::numeric, COALESCE(${positions.decimals}, 6))
            )
            / NULLIF((${positions.amount} + ${additionalAmount}), 0)
          )::numeric
          / power(10::numeric, CASE WHEN ${positions.chain} = 'solana' THEN 9 ELSE 18 END),
          18
        )`,
      })
      .where(eq(positions.id, id))
      .returning();
    return rawPosition ? this.hydratePosition(rawPosition) : undefined;
  }

  async deletePosition(id: string): Promise<void> {
    await db.delete(positions).where(eq(positions.id, id));
  }

  async createTrade(data: Omit<InsertTrade, 'id'> & { userId: string }): Promise<Trade> {
    const [trade] = await db.insert(tradeHistory).values(data).returning();
    return trade;
  }

  async getUserTrades(userId: string, chain?: Chain, limit: number = 50, offset: number = 0): Promise<Trade[]> {
    let query = db.select()
      .from(tradeHistory)
      .where(eq(tradeHistory.userId, userId));
    
    if (chain) {
      query = db.select()
        .from(tradeHistory)
        .where(and(
          eq(tradeHistory.userId, userId),
          eq(tradeHistory.chain, chain)
        ));
    }
    
    const rows = await query
      .orderBy(desc(tradeHistory.closedAt))
      .limit(limit)
      .offset(offset);
    return rows.map(r => this.hydrateTrade(r));
  }

  async getUserTradesCount(userId: string, chain?: Chain): Promise<number> {
    let query = db.select({ count: sql<number>`count(*)` })
      .from(tradeHistory)
      .where(eq(tradeHistory.userId, userId));
    
    if (chain) {
      query = db.select({ count: sql<number>`count(*)` })
        .from(tradeHistory)
        .where(and(
          eq(tradeHistory.userId, userId),
          eq(tradeHistory.chain, chain)
        ));
    }
    
    const result = await query;
    return result[0]?.count || 0;
  }

  async getTopUsersByTotalProfit(limit: number, chain: Chain): Promise<any[]> {
    if (chain === 'solana') {
      return db.select({
        id: users.id,
        username: users.username,
        walletAddress: users.solanaWalletAddress,
        totalProfit: users.totalProfit,
        balance: users.balance,
      })
      .from(users)
      .orderBy(desc(users.totalProfit))
      .limit(limit);
    } else {
      // Base chain
      return db.select({
        id: users.id,
        username: users.username,
        walletAddress: users.baseWalletAddress,
        totalProfit: users.baseTotalProfit,
        balance: users.baseBalance,
      })
      .from(users)
      .orderBy(desc(users.baseTotalProfit))
      .limit(limit);
    }
  }

  async getTopUsersByPeriodProfit(startTime: Date, endTime: Date, limit: number, chain: Chain): Promise<any[]> {
    const walletField = chain === 'solana' ? users.solanaWalletAddress : users.baseWalletAddress;
    
    const result = await db.select({
      id: users.id,
      username: users.username,
      walletAddress: walletField,
      periodProfit: sql<string>`COALESCE(SUM(${tradeHistory.profitLoss}), 0)`,
    })
    .from(users)
    .leftJoin(tradeHistory, and(
      eq(tradeHistory.userId, users.id),
      eq(tradeHistory.chain, chain),
      sql`${tradeHistory.closedAt} >= ${startTime}`,
      sql`${tradeHistory.closedAt} < ${endTime}`
    ))
    .groupBy(users.id)
    .orderBy(desc(sql`COALESCE(SUM(${tradeHistory.profitLoss}), 0)`))
    .limit(limit);

    return result;
  }

  async getCurrentLeaderboardPeriod(chain: Chain): Promise<typeof leaderboardPeriods.$inferSelect | undefined> {
    // Get most recent period for the specified chain
    const [period] = await db.select()
      .from(leaderboardPeriods)
      .where(eq(leaderboardPeriods.chain, chain))
      .orderBy(desc(leaderboardPeriods.startTime))
      .limit(1);
    return period;
  }

  async createLeaderboardPeriod(startTime: Date, endTime: Date, chain: Chain): Promise<typeof leaderboardPeriods.$inferSelect> {
    const [period] = await db.insert(leaderboardPeriods)
      .values({ startTime, endTime, chain })
      .returning();
    return period;
  }

  async updateLeaderboardPeriodWinner(periodId: string, winnerId: string, winnerProfit: bigint): Promise<void> {
    await db.update(leaderboardPeriods)
      .set({ winnerId, winnerProfit })
      .where(eq(leaderboardPeriods.id, periodId));
  }

  async getPastWinners(limitPeriods: number, chain?: Chain): Promise<any[]> {
    // Get all past closed periods (with winners)
    let periodsQuery = db.select()
      .from(leaderboardPeriods)
      .where(sql`${leaderboardPeriods.winnerId} IS NOT NULL`);
    
    if (chain) {
      periodsQuery = db.select()
        .from(leaderboardPeriods)
        .where(and(
          sql`${leaderboardPeriods.winnerId} IS NOT NULL`,
          eq(leaderboardPeriods.chain, chain)
        ));
    }
    
    const periods = await periodsQuery
      .orderBy(desc(leaderboardPeriods.endTime))
      .limit(limitPeriods);

    // For each period, get the top 3 traders
    const allWinners = [];
    for (const period of periods) {
      const topTraders = await this.getTopUsersByPeriodProfit(
        period.startTime,
        period.endTime,
        3,  // Top 3 per period
        period.chain as Chain
      );

      // Add period info to each trader
      for (const trader of topTraders) {
        allWinners.push({
          id: trader.id,
          username: trader.username,
          walletAddress: trader.walletAddress,
          periodProfit: BigInt(trader.periodProfit || '0'),
          periodStart: period.startTime,
          periodEnd: period.endTime,
          chain: period.chain,
        });
      }
    }

    return allWinners;
  }

  async saveTelegramSession(telegramUserId: string, userId: string, token: string, balance: bigint): Promise<TelegramSession> {
    // Session expires in 30 days
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const [session] = await db.insert(telegramSessions)
      .values({
        telegramUserId,
        userId,
        token,
        balance,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: telegramSessions.telegramUserId,
        set: {
          userId,
          token,
          balance,
          expiresAt,
        },
      })
      .returning();

    return session;
  }

  async getTelegramSession(telegramUserId: string): Promise<TelegramSession | undefined> {
    const [session] = await db.select()
      .from(telegramSessions)
      .where(and(
        eq(telegramSessions.telegramUserId, telegramUserId),
        gt(telegramSessions.expiresAt, new Date())
      ));
    return session;
  }

  async getAllActiveTelegramSessions(): Promise<TelegramSession[]> {
    return db.select()
      .from(telegramSessions)
      .where(gt(telegramSessions.expiresAt, new Date()));
  }

  async deleteTelegramSession(telegramUserId: string): Promise<void> {
    await db.delete(telegramSessions)
      .where(eq(telegramSessions.telegramUserId, telegramUserId));
  }

  async deleteExpiredTelegramSessions(): Promise<void> {
    await db.delete(telegramSessions)
      .where(sql`${telegramSessions.expiresAt} <= NOW()`);
  }

  async executeBuyTrade(params: {
    userId: string;
    chain: Chain;
    tokenAddress: string;
    tokenName: string;
    tokenSymbol: string;
    decimals: number;
    entryPrice: bigint;
    amount: bigint;
    nativeSpent: bigint;
  }): Promise<Position> {
    return await db.transaction(async (tx) => {
      // 1. Deduct balance (guarded: prevents negative balances under concurrency)
      let user;
      if (params.chain === 'solana') {
        const [result] = await tx
          .update(users)
          .set({ balance: sql`${users.balance} - ${params.nativeSpent}` })
          .where(and(
            eq(users.id, params.userId),
            sql`${users.balance} >= ${params.nativeSpent}`
          ))
          .returning();
        user = result;
      } else {
        // Base chain
        const [result] = await tx
          .update(users)
          .set({ baseBalance: sql`${users.baseBalance} - ${params.nativeSpent}` })
          .where(and(
            eq(users.id, params.userId),
            sql`${users.baseBalance} >= ${params.nativeSpent}`
          ))
          .returning();
        user = result;
      }

      if (!user) {
        const [exists] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, params.userId));

        if (!exists) throw new Error("User not found");
        throw new Error("Insufficient balance");
      }

      // 2. Lock position row to prevent race conditions with concurrent sells
      await tx.execute(
        sql`SELECT 1 FROM ${positions} WHERE ${positions.userId} = ${params.userId} AND ${positions.tokenAddress} = ${params.tokenAddress} AND ${positions.chain} = ${params.chain} FOR UPDATE`
      );

      // 3. Create or aggregate position
      const nativeDecimals = this.nativeDecimalsForChain(params.chain);
      const [rawPosition] = await tx.insert(positions)
        .values({
          userId: params.userId,
          chain: params.chain,
          tokenAddress: params.tokenAddress,
          tokenName: params.tokenName,
          tokenSymbol: params.tokenSymbol,
          decimals: params.decimals,
          entryPrice: atomicToDecimal(params.entryPrice, nativeDecimals),
          amount: params.amount.toString(),
          solSpent: params.nativeSpent.toString(),
        } as any)
        .onConflictDoUpdate({
          target: [positions.userId, positions.tokenAddress, positions.chain],
          set: {
            amount: sql`${positions.amount} + ${params.amount}`,
            solSpent: sql`${positions.solSpent} + ${params.nativeSpent}`,
            entryPrice: sql`ROUND(
              FLOOR(
                (
                  (${positions.solSpent} + EXCLUDED.sol_spent)::numeric
                  * power(10::numeric, COALESCE(EXCLUDED.decimals, ${positions.decimals}, 6))
                )
                / NULLIF((${positions.amount} + EXCLUDED.amount), 0)
              )::numeric
              / power(10::numeric, CASE WHEN EXCLUDED.chain = 'solana' THEN 9 ELSE 18 END),
              18
            )`,
          },
        })
        .returning();

      return this.hydratePosition(rawPosition);
    });
  }

  async executeSellTrade(params: {
    userId: string;
    positionId: string;
    sellAmount: bigint;
    exitPrice: bigint;
    nativeReceived: bigint;
    profitLoss: bigint;
    proportionalCost: bigint;
    isFullSell?: boolean;
  }): Promise<void> {
    await db.transaction(async (tx) => {
      // Lock the position row to prevent concurrent/double-sell
      await tx.execute(
        sql`SELECT 1 FROM ${positions} WHERE ${positions.id} = ${params.positionId} FOR UPDATE`
      );

      const [position] = await tx
        .select()
        .from(positions)
        .where(eq(positions.id, params.positionId));

      if (!position) throw new Error("Position not found");
      if (position.userId !== params.userId) throw new Error("Unauthorized");

      const positionAmount = BigInt(position.amount);
      const positionSolSpent = BigInt(position.solSpent);

      // For full sells, use the exact locked position amount (prevents race conditions)
      const sellAmount = params.isFullSell ? positionAmount : params.sellAmount;

      if (sellAmount <= 0n) throw new Error("Sell amount must be positive");
      if (sellAmount > positionAmount) throw new Error("Sell amount exceeds position size");

      const decimals = position.decimals ?? 6;
      if (decimals < 0 || decimals > 78 || !Number.isFinite(decimals)) {
        throw new Error(`Invalid decimals: ${decimals}`);
      }
      const decimalDivisor = BigInt(10 ** decimals);

      // Trust caller-provided nativeReceived (computed precisely in route handler)
      // Recompute proportional cost and profit/loss from locked position data
      const nativeReceived = params.nativeReceived;
      const proportionalCost = (positionSolSpent * sellAmount) / positionAmount;
      const profitLoss = nativeReceived - proportionalCost;

      // Update user balance and profit based on chain
      let updatedUser;
      if (position.chain === 'solana') {
        const [result] = await tx
          .update(users)
          .set({
            balance: sql`${users.balance} + ${nativeReceived}`,
            totalProfit: sql`${users.totalProfit} + ${profitLoss}`,
          })
          .where(eq(users.id, params.userId))
          .returning();
        updatedUser = result;
      } else {
        // Base chain
        const [result] = await tx
          .update(users)
          .set({
            baseBalance: sql`${users.baseBalance} + ${nativeReceived}`,
            baseTotalProfit: sql`${users.baseTotalProfit} + ${profitLoss}`,
          })
          .where(eq(users.id, params.userId))
          .returning();
        updatedUser = result;
      }

      if (!updatedUser) throw new Error("User not found");

      // Create trade history
      const nativeDecimals = this.nativeDecimalsForChain(position.chain as Chain);
      await tx.insert(tradeHistory).values({
        userId: params.userId,
        chain: position.chain as Chain,
        tokenAddress: position.tokenAddress,
        tokenName: position.tokenName,
        tokenSymbol: position.tokenSymbol,
        decimals,
        entryPrice: String(position.entryPrice),
        exitPrice: atomicToDecimal(params.exitPrice, nativeDecimals),
        amount: sellAmount.toString(),
        solSpent: proportionalCost.toString(),
        solReceived: nativeReceived.toString(),
        profitLoss: profitLoss.toString(),
        openedAt: position.openedAt,
      } as any);

      // Use UPDATE for partial sells, DELETE only for full sells
      if (sellAmount < positionAmount) {
        // PARTIAL SELL: Update position with remaining amount
        const remainingAmount = positionAmount - sellAmount;
        const remainingCost = positionSolSpent - proportionalCost;

        const [updated] = await tx
          .update(positions)
          .set({
            amount: remainingAmount.toString(),
            solSpent: remainingCost.toString(),
          })
          .where(and(eq(positions.id, params.positionId), eq(positions.userId, params.userId)))
          .returning({ id: positions.id });

        if (!updated) throw new Error("Failed to update position");
      } else {
        // FULL SELL: Delete the position entirely
        const deleted = await tx
          .delete(positions)
          .where(and(eq(positions.id, params.positionId), eq(positions.userId, params.userId)))
          .returning({ id: positions.id });

        if (deleted.length === 0) throw new Error("Position already closed");
      }
    });
  }

  // ============================================================================
  // Achievements (Phase 2)
  // ============================================================================

  async getUserAchievements(userId: string): Promise<UserAchievement[]> {
    return db.select().from(userAchievements).where(eq(userAchievements.userId, userId));
  }

  async unlockAchievement(userId: string, badgeId: BadgeId): Promise<UserAchievement | undefined> {
    try {
      const [achievement] = await db.insert(userAchievements)
        .values({ userId, badgeId })
        .onConflictDoNothing()
        .returning();
      return achievement;
    } catch {
      return undefined;
    }
  }

  async hasAchievement(userId: string, badgeId: BadgeId): Promise<boolean> {
    const [row] = await db.select({ count: sql<number>`count(*)` })
      .from(userAchievements)
      .where(and(eq(userAchievements.userId, userId), eq(userAchievements.badgeId, badgeId)));
    return (row?.count || 0) > 0;
  }

  // ============================================================================
  // Referrals (Phase 4)
  // ============================================================================

  async getReferralByReferee(refereeId: string): Promise<Referral | undefined> {
    const [row] = await db.select().from(referrals).where(eq(referrals.refereeId, refereeId));
    return row;
  }

  async createReferral(referrerId: string, refereeId: string, code: string): Promise<Referral> {
    const [row] = await db.insert(referrals)
      .values({ referrerId, refereeId, code })
      .returning();
    return row;
  }

  async convertReferral(refereeId: string): Promise<boolean> {
    const result = await db.update(referrals)
      .set({ status: 'converted' })
      .where(and(eq(referrals.refereeId, refereeId), eq(referrals.status, 'pending')))
      .returning();
    return result.length > 0;
  }

  async convertReferralAndReward(refereeId: string, referrerId: string, rewardAmount: bigint, chain: Chain): Promise<boolean> {
    return await db.transaction(async (tx) => {
      const [referral] = await tx
        .update(referrals)
        .set({ status: 'converted' })
        .where(and(eq(referrals.refereeId, refereeId), eq(referrals.status, 'pending')))
        .returning();

      if (!referral) return false;

      if (chain === 'solana') {
        await tx
          .update(users)
          .set({ balance: sql`${users.balance} + ${rewardAmount}` })
          .where(eq(users.id, referrerId));
      } else {
        await tx
          .update(users)
          .set({ baseBalance: sql`${users.baseBalance} + ${rewardAmount}` })
          .where(eq(users.id, referrerId));
      }

      return true;
    });
  }

  async getReferralStats(userId: string): Promise<{ total: number; converted: number; pending: number }> {
    const [totalRow] = await db.select({ count: sql<number>`count(*)` })
      .from(referrals)
      .where(eq(referrals.referrerId, userId));
    const [convertedRow] = await db.select({ count: sql<number>`count(*)` })
      .from(referrals)
      .where(and(eq(referrals.referrerId, userId), eq(referrals.status, 'converted')));
    const total = totalRow?.count || 0;
    const converted = convertedRow?.count || 0;
    return { total, converted, pending: total - converted };
  }

  async getTopReferrers(limit: number): Promise<any[]> {
    return db.select({
      id: users.id,
      username: users.username,
      totalReferrals: sql<number>`count(${referrals.id})`,
      convertedReferrals: sql<number>`sum(CASE WHEN ${referrals.status} = 'converted' THEN 1 ELSE 0 END)`,
    })
    .from(users)
    .leftJoin(referrals, eq(referrals.referrerId, users.id))
    .groupBy(users.id)
    .orderBy(desc(sql`count(${referrals.id})`))
    .limit(limit);
  }

  // ============================================================================
  // Follows (Phase 5)
  // ============================================================================

  async followUser(followerId: string, followingId: string): Promise<void> {
    await db.insert(follows)
      .values({ followerId, followingId })
      .onConflictDoNothing();
  }

  async unfollowUser(followerId: string, followingId: string): Promise<void> {
    await db.delete(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)));
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const [row] = await db.select({ count: sql<number>`count(*)` })
      .from(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)));
    return (row?.count || 0) > 0;
  }

  async getFollowerCount(userId: string): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)` })
      .from(follows)
      .where(eq(follows.followingId, userId));
    return row?.count || 0;
  }

  async getFollowingCount(userId: string): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)` })
      .from(follows)
      .where(eq(follows.followerId, userId));
    return row?.count || 0;
  }

  // ============================================================================
  // Public Trader Stats (Phase 5)
  // ============================================================================

  async getPublicTraderStats(username: string): Promise<any | undefined> {
    const [user] = await db.select({
      id: users.id,
      username: users.username,
      createdAt: users.createdAt,
      // Wallet addresses and exact balances are private — only return existence flags
      hasSolanaWallet: sql<boolean>`CASE WHEN ${users.solanaWalletAddress} IS NOT NULL THEN true ELSE false END`,
      hasBaseWallet: sql<boolean>`CASE WHEN ${users.baseWalletAddress} IS NOT NULL THEN true ELSE false END`,
    })
    .from(users)
    .where(eq(users.username, username));
    return user;
  }

  async getBestWorstTrades(userId: string, chain?: Chain): Promise<{ best: Trade | undefined; worst: Trade | undefined }> {
    let whereClause = eq(tradeHistory.userId, userId);
    if (chain) {
      whereClause = and(whereClause, eq(tradeHistory.chain, chain)) as any;
    }
    const [bestRaw] = await db.select().from(tradeHistory).where(whereClause).orderBy(desc(tradeHistory.profitLoss)).limit(1);
    const [worstRaw] = await db.select().from(tradeHistory).where(whereClause).orderBy(asc(tradeHistory.profitLoss)).limit(1);
    return {
      best: bestRaw ? this.hydrateTrade(bestRaw) : undefined,
      worst: worstRaw ? this.hydrateTrade(worstRaw) : undefined,
    };
  }

  async getTradeWinLoss(userId: string, chain?: Chain): Promise<{ winCount: number; lossCount: number; totalCount: number }> {
    let whereClause = eq(tradeHistory.userId, userId);
    if (chain) {
      whereClause = and(whereClause, eq(tradeHistory.chain, chain)) as any;
    }
    const [totalRow] = await db.select({ count: sql<number>`count(*)` }).from(tradeHistory).where(whereClause);
    const [winRow] = await db.select({ count: sql<number>`count(*)` }).from(tradeHistory).where(and(whereClause, sql`${tradeHistory.profitLoss} > 0`));
    const [lossRow] = await db.select({ count: sql<number>`count(*)` }).from(tradeHistory).where(and(whereClause, sql`${tradeHistory.profitLoss} < 0`));
    return {
      totalCount: totalRow?.count || 0,
      winCount: winRow?.count || 0,
      lossCount: lossRow?.count || 0,
    };
  }

  async getAverageHoldTime(userId: string): Promise<number> {
    const [row] = await db.select({
      avgSeconds: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (${tradeHistory.closedAt} - ${tradeHistory.openedAt}))), 0)`
    })
    .from(tradeHistory)
    .where(eq(tradeHistory.userId, userId));
    return row?.avgSeconds || 0;
  }

  // ============================================================================
  // Streaks (Phase 8)
  // ============================================================================

  async getUserStreak(userId: string): Promise<{ streakCount: number; lastStreakDate: Date | null }> {
    const [user] = await db.select({ streakCount: users.streakCount, lastStreakDate: users.lastStreakDate })
      .from(users)
      .where(eq(users.id, userId));
    return { streakCount: user?.streakCount || 0, lastStreakDate: user?.lastStreakDate || null };
  }

  async updateUserStreak(userId: string, streakCount: number, lastStreakDate: Date | null): Promise<void> {
    await db.update(users)
      .set({ streakCount, lastStreakDate: lastStreakDate ? new Date(lastStreakDate) : null })
      .where(eq(users.id, userId));
  }

  async claimStreakBonus(userId: string, bonusWei: bigint): Promise<void> {
    await db.update(users)
      .set({ baseBalance: sql`${users.baseBalance} + ${bonusWei}` })
      .where(eq(users.id, userId));
  }

  async claimStreakAtomic(userId: string, streakCount: number, lastStreakDate: Date, bonusWei: bigint): Promise<void> {
    await db.transaction(async (tx) => {
      // Lock user row and verify streak hasn't been claimed today
      const [user] = await tx
        .select({ lastStreakDate: users.lastStreakDate })
        .from(users)
        .where(eq(users.id, userId))
        .for('update');

      if (user?.lastStreakDate) {
        const existing = new Date(user.lastStreakDate);
        existing.setHours(0, 0, 0, 0);
        const today = new Date(lastStreakDate);
        today.setHours(0, 0, 0, 0);
        if (existing.getTime() >= today.getTime()) {
          throw new Error('Streak already claimed today');
        }
      }

      await tx
        .update(users)
        .set({ streakCount, lastStreakDate: new Date(lastStreakDate) })
        .where(eq(users.id, userId));

      await tx
        .update(users)
        .set({ baseBalance: sql`${users.baseBalance} + ${bonusWei}` })
        .where(eq(users.id, userId));
    });
  }

  // ============================================================================
  // Watchlist (Phase 9)
  // ============================================================================

  async addToWatchlist(userId: string, data: { chain: Chain; tokenAddress: string; tokenName: string; tokenSymbol: string; decimals: number }): Promise<WatchlistItem> {
    const [item] = await db.insert(watchlist)
      .values({
        userId,
        chain: data.chain,
        tokenAddress: data.tokenAddress,
        tokenName: data.tokenName,
        tokenSymbol: data.tokenSymbol,
        decimals: data.decimals,
      })
      .onConflictDoNothing()
      .returning();
    return item as WatchlistItem;
  }

  async removeFromWatchlist(userId: string, watchlistId: string): Promise<void> {
    await db.delete(watchlist)
      .where(and(eq(watchlist.id, watchlistId), eq(watchlist.userId, userId)));
  }

  async getUserWatchlist(userId: string, chain?: Chain): Promise<WatchlistItem[]> {
    let query = db.select().from(watchlist).where(eq(watchlist.userId, userId));
    if (chain) {
      query = db.select().from(watchlist).where(and(eq(watchlist.userId, userId), eq(watchlist.chain, chain))) as any;
    }
    const rows = await query.orderBy(desc(watchlist.createdAt));
    return rows as WatchlistItem[];
  }

  async isInWatchlist(userId: string, tokenAddress: string, chain: Chain): Promise<boolean> {
    const [row] = await db.select({ count: sql<number>`count(*)` })
      .from(watchlist)
      .where(and(eq(watchlist.userId, userId), eq(watchlist.tokenAddress, tokenAddress), eq(watchlist.chain, chain)));
    return (row?.count || 0) > 0;
  }

  // ============================================================================
  // Community Alpha / Voting (Phase 6)
  // ============================================================================

  async createCommunityPick(
    userId: string,
    data: { chain: Chain; tokenAddress: string; tokenName: string; tokenSymbol: string; reason?: string }
  ): Promise<CommunityPick> {
    const [pick] = await db.insert(communityPicks)
      .values({
        userId,
        chain: data.chain,
        tokenAddress: data.tokenAddress,
        tokenName: data.tokenName,
        tokenSymbol: data.tokenSymbol,
        reason: data.reason ?? null,
        voteCount: 0,
      })
      .returning();
    return pick as CommunityPick;
  }

  async deleteCommunityPick(userId: string, pickId: string): Promise<void> {
    await db.delete(communityPicks)
      .where(and(eq(communityPicks.id, pickId), eq(communityPicks.userId, userId)));
  }

  async getCommunityPicks(
    chain?: Chain,
    sortBy: 'votes' | 'new' = 'votes',
    currentUserId?: string
  ): Promise<(CommunityPick & { username: string; hasVoted?: boolean })[]> {
    const baseQuery = chain
      ? db.select().from(communityPicks).where(eq(communityPicks.chain, chain))
      : db.select().from(communityPicks);

    const rows = await baseQuery.orderBy(
      sortBy === 'votes' ? desc(communityPicks.voteCount) : desc(communityPicks.createdAt)
    );

    // Fetch usernames
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const userRows = userIds.length > 0
      ? await db.select({ id: users.id, username: users.username }).from(users).where(sql`${users.id} IN (${sql.join(userIds, sql`, `)})`)
      : [];
    const usernameMap = new Map(userRows.map((u) => [u.id, u.username]));

    // Check votes if current user provided
    let votedSet = new Set<string>();
    if (currentUserId) {
      const voteRows = await db.select({ pickId: communityVotes.pickId })
        .from(communityVotes)
        .where(and(eq(communityVotes.userId, currentUserId), sql`${communityVotes.pickId} IN (${sql.join(rows.map((r) => r.id), sql`, `)})`));
      votedSet = new Set(voteRows.map((v) => v.pickId));
    }

    return rows.map((r) => ({
      ...r,
      username: usernameMap.get(r.userId) ?? 'Unknown',
      hasVoted: currentUserId ? votedSet.has(r.id) : undefined,
    })) as (CommunityPick & { username: string; hasVoted?: boolean })[];
  }

  async voteOnPick(userId: string, pickId: string): Promise<{ voteCount: number }> {
    const result = await db.insert(communityVotes)
      .values({ pickId, userId })
      .onConflictDoNothing()
      .returning({ id: communityVotes.id });

    if (result.length === 0) {
      const [pick] = await db.select({ voteCount: communityPicks.voteCount })
        .from(communityPicks)
        .where(eq(communityPicks.id, pickId));
      return { voteCount: pick?.voteCount ?? 0 };
    }

    const [updated] = await db.update(communityPicks)
      .set({ voteCount: sql`${communityPicks.voteCount} + 1` })
      .where(eq(communityPicks.id, pickId))
      .returning({ voteCount: communityPicks.voteCount });

    return { voteCount: updated?.voteCount ?? 0 };
  }

  async removeVoteFromPick(userId: string, pickId: string): Promise<{ voteCount: number }> {
    const result = await db.delete(communityVotes)
      .where(and(eq(communityVotes.pickId, pickId), eq(communityVotes.userId, userId)))
      .returning({ id: communityVotes.id });

    if (result.length === 0) {
      const [pick] = await db.select({ voteCount: communityPicks.voteCount })
        .from(communityPicks)
        .where(eq(communityPicks.id, pickId));
      return { voteCount: pick?.voteCount ?? 0 };
    }

    const [updated] = await db.update(communityPicks)
      .set({ voteCount: sql`${communityPicks.voteCount} - 1` })
      .where(eq(communityPicks.id, pickId))
      .returning({ voteCount: communityPicks.voteCount });

    return { voteCount: updated?.voteCount ?? 0 };
  }

  async hasVotedOnPick(userId: string, pickId: string): Promise<boolean> {
    const [row] = await db.select({ count: sql<number>`count(*)` })
      .from(communityVotes)
      .where(and(eq(communityVotes.userId, userId), eq(communityVotes.pickId, pickId)));
    return (row?.count || 0) > 0;
  }
}

export const storage: IStorage = new DbStorage();
