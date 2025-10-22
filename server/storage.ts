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
          // Recalculate average entry price using the EXCLUDED (new) values
          entryPrice: sql`((${positions.solSpent} + EXCLUDED.sol_spent) * 1000000000) / (${positions.amount} + EXCLUDED.amount)`,
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
    // Calculate new average entry price atomically: (total_sol_spent * 1_000_000_000) / total_amount
    const [position] = await db.update(positions)
      .set({
        amount: sql`${positions.amount} + ${additionalAmount}`,
        solSpent: sql`${positions.solSpent} + ${additionalSolSpent}`,
        entryPrice: sql`((${positions.solSpent} + ${additionalSolSpent}) * 1000000000) / (${positions.amount} + ${additionalAmount})`,
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

  async getPastWinners(limit: number): Promise<any[]> {
    const result = await db.select({
      id: users.id,
      username: users.username,
      walletAddress: users.walletAddress,
      periodProfit: leaderboardPeriods.winnerProfit,
      periodStart: leaderboardPeriods.startTime,
      periodEnd: leaderboardPeriods.endTime,
    })
    .from(leaderboardPeriods)
    .leftJoin(users, eq(users.id, leaderboardPeriods.winnerId))
    .where(sql`${leaderboardPeriods.winnerId} IS NOT NULL`)
    .orderBy(desc(leaderboardPeriods.endTime))
    .limit(limit);
    
    return result;
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
}

export const storage: IStorage = new DbStorage();
