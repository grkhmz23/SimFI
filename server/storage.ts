import { eq, desc, and, sql, gt } from 'drizzle-orm';
import { db } from './db';
import { users, positions, tradeHistory, leaderboardPeriods, telegramSessions, type User, type Position, type Trade, type TelegramSession, type InsertUser, type InsertPosition, type InsertTrade, LAMPORTS_PER_SOL, solToLamports } from '@shared/schema';

export interface IStorage {
  // User operations
  createUser(data: InsertUser & { password: string }): Promise<User>;
  getUserById(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  updateUserProfile(id: string, data: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User | undefined>;
  updateUserBalance(id: string, balanceChange: bigint): Promise<User | undefined>;
  updateUserTotalProfit(id: string, profitChange: bigint): Promise<User | undefined>;

  // Position operations
  createPosition(data: Omit<InsertPosition, 'id'> & { userId: string }): Promise<Position>;
  createOrAggregatePosition(data: Omit<InsertPosition, 'id'> & { userId: string }): Promise<Position>;
  getPositionById(id: string): Promise<Position | undefined>;
  getPositionByUserAndToken(userId: string, tokenAddress: string): Promise<Position | undefined>;
  getUserPositions(userId: string): Promise<Position[]>;
  updatePosition(id: string, data: Partial<Omit<Position, 'id' | 'userId' | 'tokenAddress' | 'tokenName' | 'tokenSymbol' | 'openedAt'>>): Promise<Position | undefined>;
  aggregatePosition(id: string, additionalAmount: bigint, additionalSolSpent: bigint): Promise<Position | undefined>;
  deletePosition(id: string): Promise<void>;

  // Trade operations
  createTrade(data: Omit<InsertTrade, 'id'> & { userId: string }): Promise<Trade>;
  getUserTrades(userId: string, limit?: number, offset?: number): Promise<Trade[]>;
  getUserTradesCount(userId: string): Promise<number>;
  
  // Atomic trade execution
  executeBuyTrade(params: {
    userId: string;
    tokenAddress: string;
    tokenName: string;
    tokenSymbol: string;
    decimals: number;
    entryPrice: bigint;
    amount: bigint;
    solSpent: bigint;
  }): Promise<Position>;
  
  executeSellTrade(params: {
    userId: string;
    positionId: string;
    sellAmount: bigint;
    exitPrice: bigint;
    solReceived: bigint;
    profitLoss: bigint;
    proportionalCost: bigint;
  }): Promise<void>;
  
  // Leaderboard operations
  getTopUsersByTotalProfit(limit: number): Promise<any[]>;
  getTopUsersByPeriodProfit(startTime: Date, endTime: Date, limit: number): Promise<any[]>;
  getCurrentLeaderboardPeriod(): Promise<typeof leaderboardPeriods.$inferSelect | undefined>;
  createLeaderboardPeriod(startTime: Date, endTime: Date): Promise<typeof leaderboardPeriods.$inferSelect>;
  updateLeaderboardPeriodWinner(periodId: string, winnerId: string, winnerProfit: bigint): Promise<void>;
  getPastWinners(limit: number): Promise<any[]>;

  // Telegram session operations
  saveTelegramSession(telegramUserId: string, userId: string, token: string, balance: bigint): Promise<TelegramSession>;
  getTelegramSession(telegramUserId: string): Promise<TelegramSession | undefined>;
  getAllActiveTelegramSessions(): Promise<TelegramSession[]>;
  deleteTelegramSession(telegramUserId: string): Promise<void>;
  deleteExpiredTelegramSessions(): Promise<void>;
}

class DbStorage implements IStorage {
  async createUser(data: InsertUser & { password: string }): Promise<User> {
    const [user] = await db.insert(users).values({
      ...data,
      balance: BigInt(10 * LAMPORTS_PER_SOL),
      totalProfit: 0n,
    }).returning();
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
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }

  async updateUserBalance(id: string, balanceChange: bigint): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({ balance: sql`${users.balance} + ${balanceChange}` })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserTotalProfit(id: string, profitChange: bigint): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({ totalProfit: sql`${users.totalProfit} + ${profitChange}` })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async createPosition(data: Omit<InsertPosition, 'id'> & { userId: string }): Promise<Position> {
    const [position] = await db.insert(positions).values(data).returning();
    return position;
  }

  async createOrAggregatePosition(data: Omit<InsertPosition, 'id'> & { userId: string }): Promise<Position> {
    // Use INSERT ... ON CONFLICT to atomically create or aggregate position
    // This prevents race conditions by using database-level conflict resolution
    const [position] = await db.insert(positions)
      .values(data)
      .onConflictDoUpdate({
        target: [positions.userId, positions.tokenAddress],
        set: {
          // Increment amount and solSpent atomically
          amount: sql`${positions.amount} + ${data.amount}`,
          solSpent: sql`${positions.solSpent} + ${data.solSpent}`,
          // Recalculate weighted average entry price: (total_solSpent * 10^decimals) / total_amount
          // Use numeric division, preserve existing position's decimals (not incoming EXCLUDED)
          entryPrice: sql`FLOOR(((${positions.solSpent} + EXCLUDED.sol_spent)::numeric * power(10::numeric, COALESCE(${positions.decimals}, EXCLUDED.decimals, 6))) / NULLIF((${positions.amount} + EXCLUDED.amount), 0))::bigint`,
        },
      })
      .returning();
    return position;
  }

  async getPositionById(id: string): Promise<Position | undefined> {
    const [position] = await db.select().from(positions).where(eq(positions.id, id));
    return position;
  }

  async getPositionByUserAndToken(userId: string, tokenAddress: string): Promise<Position | undefined> {
    const [position] = await db.select()
      .from(positions)
      .where(and(eq(positions.userId, userId), eq(positions.tokenAddress, tokenAddress)));
    return position;
  }

  async getUserPositions(userId: string): Promise<Position[]> {
    return db.select().from(positions).where(eq(positions.userId, userId)).orderBy(desc(positions.openedAt));
  }

  async updatePosition(id: string, data: Partial<Omit<Position, 'id' | 'userId' | 'tokenAddress' | 'tokenName' | 'tokenSymbol' | 'openedAt'>>): Promise<Position | undefined> {
    const [position] = await db.update(positions).set(data).where(eq(positions.id, id)).returning();
    return position;
  }

  async aggregatePosition(id: string, additionalAmount: bigint, additionalSolSpent: bigint): Promise<Position | undefined> {
    // Use SQL-level increments to avoid race conditions
    // Calculate weighted average entry price: (total_solSpent * 10^decimals) / total_amount
    const [position] = await db.update(positions)
      .set({
        amount: sql`${positions.amount} + ${additionalAmount}`,
        solSpent: sql`${positions.solSpent} + ${additionalSolSpent}`,
        entryPrice: sql`FLOOR(((${positions.solSpent} + ${additionalSolSpent})::numeric * power(10::numeric, COALESCE(${positions.decimals}, 6))) / NULLIF((${positions.amount} + ${additionalAmount}), 0))::bigint`,
      })
      .where(eq(positions.id, id))
      .returning();
    return position;
  }

  async deletePosition(id: string): Promise<void> {
    await db.delete(positions).where(eq(positions.id, id));
  }

  async createTrade(data: Omit<InsertTrade, 'id'> & { userId: string }): Promise<Trade> {
    const [trade] = await db.insert(tradeHistory).values(data).returning();
    return trade;
  }

  async getUserTrades(userId: string, limit: number = 50, offset: number = 0): Promise<Trade[]> {
    return db.select()
      .from(tradeHistory)
      .where(eq(tradeHistory.userId, userId))
      .orderBy(desc(tradeHistory.closedAt))
      .limit(limit)
      .offset(offset);
  }

  async getUserTradesCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(tradeHistory)
      .where(eq(tradeHistory.userId, userId));
    return result[0]?.count || 0;
  }

  async getTopUsersByTotalProfit(limit: number): Promise<any[]> {
    return db.select({
      id: users.id,
      username: users.username,
      walletAddress: users.walletAddress,
      totalProfit: users.totalProfit,
      balance: users.balance,
    })
    .from(users)
    .orderBy(desc(users.totalProfit))
    .limit(limit);
  }

  async getTopUsersByPeriodProfit(startTime: Date, endTime: Date, limit: number): Promise<any[]> {
    const result = await db.select({
      id: users.id,
      username: users.username,
      walletAddress: users.walletAddress,
      periodProfit: sql<number>`COALESCE(SUM(${tradeHistory.profitLoss}), 0)`,
    })
    .from(users)
    .leftJoin(tradeHistory, and(
      eq(tradeHistory.userId, users.id),
      sql`${tradeHistory.closedAt} >= ${startTime}`,
      sql`${tradeHistory.closedAt} < ${endTime}`
    ))
    .groupBy(users.id)
    .orderBy(desc(sql`COALESCE(SUM(${tradeHistory.profitLoss}), 0)`))
    .limit(limit);
    
    return result;
  }

  async getCurrentLeaderboardPeriod(): Promise<typeof leaderboardPeriods.$inferSelect | undefined> {
    // Get most recent period regardless of whether it's active or expired
    const [period] = await db.select()
      .from(leaderboardPeriods)
      .orderBy(desc(leaderboardPeriods.startTime))
      .limit(1);
    return period;
  }

  async createLeaderboardPeriod(startTime: Date, endTime: Date): Promise<typeof leaderboardPeriods.$inferSelect> {
    const [period] = await db.insert(leaderboardPeriods)
      .values({ startTime, endTime })
      .returning();
    return period;
  }

  async updateLeaderboardPeriodWinner(periodId: string, winnerId: string, winnerProfit: bigint): Promise<void> {
    await db.update(leaderboardPeriods)
      .set({ winnerId, winnerProfit })
      .where(eq(leaderboardPeriods.id, periodId));
  }

  async getPastWinners(limitPeriods: number): Promise<any[]> {
    // Get all past closed periods (with winners)
    const periods = await db.select()
      .from(leaderboardPeriods)
      .where(sql`${leaderboardPeriods.winnerId} IS NOT NULL`)
      .orderBy(desc(leaderboardPeriods.endTime))
      .limit(limitPeriods);
    
    // For each period, get the top 3 traders
    const allWinners = [];
    for (const period of periods) {
      const topTraders = await this.getTopUsersByPeriodProfit(
        period.startTime,
        period.endTime,
        3  // Top 3 per period
      );
      
      // Add period info to each trader
      for (const trader of topTraders) {
        allWinners.push({
          id: trader.id,
          username: trader.username,
          walletAddress: trader.walletAddress,
          periodProfit: trader.periodProfit,
          periodStart: period.startTime,
          periodEnd: period.endTime,
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
    tokenAddress: string;
    tokenName: string;
    tokenSymbol: string;
    decimals: number;
    entryPrice: bigint;
    amount: bigint;
    solSpent: bigint;
  }): Promise<Position> {
    return await db.transaction(async (tx) => {
      // 1. Deduct balance
      const [user] = await tx.update(users)
        .set({ balance: sql`${users.balance} - ${params.solSpent}` })
        .where(eq(users.id, params.userId))
        .returning();
      
      if (!user) {
        throw new Error('User not found');
      }
      
      if (user.balance < 0n) {
        throw new Error('Insufficient balance');
      }
      
      // 2. Create or aggregate position
      const [position] = await tx.insert(positions)
        .values({
          userId: params.userId,
          tokenAddress: params.tokenAddress,
          tokenName: params.tokenName,
          tokenSymbol: params.tokenSymbol,
          decimals: params.decimals,
          entryPrice: params.entryPrice,
          amount: params.amount,
          solSpent: params.solSpent,
        })
        .onConflictDoUpdate({
          target: [positions.userId, positions.tokenAddress],
          set: {
            amount: sql`${positions.amount} + ${params.amount}`,
            solSpent: sql`${positions.solSpent} + ${params.solSpent}`,
            entryPrice: sql`FLOOR(((${positions.solSpent} + EXCLUDED.sol_spent)::numeric * power(10::numeric, COALESCE(${positions.decimals}, EXCLUDED.decimals, 6))) / NULLIF((${positions.amount} + EXCLUDED.amount), 0))::bigint`,
          },
        })
        .returning();
      
      return position;
    });
  }

  async executeSellTrade(params: {
    userId: string;
    positionId: string;
    sellAmount: bigint;
    exitPrice: bigint;
    solReceived: bigint;
    profitLoss: bigint;
    proportionalCost: bigint;
  }): Promise<void> {
    await db.transaction(async (tx) => {
      // 1. Get position to validate and get details
      const [position] = await tx.select()
        .from(positions)
        .where(eq(positions.id, params.positionId));
      
      if (!position) {
        throw new Error('Position not found');
      }
      
      if (position.userId !== params.userId) {
        throw new Error('Unauthorized');
      }
      
      // 2. Update user balance and profit
      await tx.update(users)
        .set({
          balance: sql`${users.balance} + ${params.solReceived}`,
          totalProfit: sql`${users.totalProfit} + ${params.profitLoss}`,
        })
        .where(eq(users.id, params.userId));
      
      // 3. Create trade history
      await tx.insert(tradeHistory).values({
        userId: params.userId,
        tokenAddress: position.tokenAddress,
        tokenName: position.tokenName,
        tokenSymbol: position.tokenSymbol,
        decimals: position.decimals || 6,
        entryPrice: position.entryPrice,
        exitPrice: params.exitPrice,
        amount: params.sellAmount,
        solSpent: params.proportionalCost,
        solReceived: params.solReceived,
        profitLoss: params.profitLoss,
        openedAt: position.openedAt,
      });
      
      // 4. Delete position
      await tx.delete(positions)
        .where(eq(positions.id, params.positionId));
      
      // 5. If partial sell, create new position with remaining
      if (params.sellAmount < position.amount) {
        const remainingAmount = position.amount - params.sellAmount;
        const remainingCost = position.solSpent - params.proportionalCost;
        
        await tx.insert(positions).values({
          userId: params.userId,
          tokenAddress: position.tokenAddress,
          tokenName: position.tokenName,
          tokenSymbol: position.tokenSymbol,
          decimals: position.decimals || 6,
          entryPrice: position.entryPrice,
          amount: remainingAmount,
          solSpent: remainingCost,
        });
      }
    });
  }
}

export const storage: IStorage = new DbStorage();
