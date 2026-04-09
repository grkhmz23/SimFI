import { eq, desc, and, sql, gt } from 'drizzle-orm';
import { db } from './db';
import { 
  users, positions, tradeHistory, leaderboardPeriods, telegramSessions, 
  type User, type Position, type Trade, type TelegramSession, 
  type InsertUser, type InsertPosition, type InsertTrade, 
  LAMPORTS_PER_SOL, WEI_PER_ETH, type Chain 
} from '@shared/schema';

export interface IStorage {
  // User operations
  createUser(data: InsertUser & { password: string }): Promise<User>;
  getUserById(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  updateUserProfile(id: string, data: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User | undefined>;
  
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
}

class DbStorage implements IStorage {
  async createUser(data: InsertUser & { password: string }): Promise<User> {
    // Set default balances based on provided wallets
    const solanaBalance = data.solanaWalletAddress ? BigInt(10 * LAMPORTS_PER_SOL) : 0n;
    const baseBalance = data.baseWalletAddress ? BigInt(5) * WEI_PER_ETH : 0n;
    
    // Use provided wallet addresses, fallback to legacy walletAddress for Solana
    const [user] = await db.insert(users).values({
      ...data,
      walletAddress: data.solanaWalletAddress || data.walletAddress, // Legacy compatibility
      balance: solanaBalance,
      baseBalance: baseBalance,
      totalProfit: 0n,
      baseTotalProfit: 0n,
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
    const [position] = await db.insert(positions).values(data).returning();
    return position;
  }

  async createOrAggregatePosition(data: Omit<InsertPosition, 'id'> & { userId: string }): Promise<Position> {
    // Use INSERT ... ON CONFLICT to atomically create or aggregate position
    // This prevents race conditions by using database-level conflict resolution
    const [position] = await db.insert(positions)
      .values(data)
      .onConflictDoUpdate({
        target: [positions.userId, positions.tokenAddress, positions.chain],
        set: {
          // Increment amount and solSpent atomically
          amount: sql`${positions.amount} + ${data.amount}`,
          solSpent: sql`${positions.solSpent} + ${data.solSpent}`,
          // Recalculate weighted average entry price: (total_solSpent * 10^decimals) / total_amount
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

  async getPositionByUserAndToken(userId: string, tokenAddress: string, chain: Chain): Promise<Position | undefined> {
    const [position] = await db.select()
      .from(positions)
      .where(and(
        eq(positions.userId, userId), 
        eq(positions.tokenAddress, tokenAddress),
        eq(positions.chain, chain)
      ));
    return position;
  }

  async getUserPositions(userId: string, chain?: Chain): Promise<Position[]> {
    let query = db.select().from(positions).where(eq(positions.userId, userId));
    
    if (chain) {
      query = db.select().from(positions).where(and(
        eq(positions.userId, userId),
        eq(positions.chain, chain)
      ));
    }
    
    return query.orderBy(desc(positions.openedAt));
  }

  async updatePosition(id: string, data: Partial<Omit<Position, 'id' | 'userId' | 'tokenAddress' | 'tokenName' | 'tokenSymbol' | 'openedAt'>>): Promise<Position | undefined> {
    const [position] = await db.update(positions).set(data).where(eq(positions.id, id)).returning();
    return position;
  }

  async aggregatePosition(id: string, additionalAmount: bigint, additionalNativeSpent: bigint): Promise<Position | undefined> {
    // Use SQL-level increments to avoid race conditions
    const [position] = await db.update(positions)
      .set({
        amount: sql`${positions.amount} + ${additionalAmount}`,
        solSpent: sql`${positions.solSpent} + ${additionalNativeSpent}`,
        entryPrice: sql`FLOOR(((${positions.solSpent} + ${additionalNativeSpent})::numeric * power(10::numeric, COALESCE(${positions.decimals}, 6))) / NULLIF((${positions.amount} + ${additionalAmount}), 0))::bigint`,
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
    
    return query
      .orderBy(desc(tradeHistory.closedAt))
      .limit(limit)
      .offset(offset);
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
      periodProfit: sql<number>`COALESCE(SUM(${tradeHistory.profitLoss}), 0)`,
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
          periodProfit: trader.periodProfit,
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

      // 2. Create or aggregate position
      const [position] = await tx.insert(positions)
        .values({
          userId: params.userId,
          chain: params.chain,
          tokenAddress: params.tokenAddress,
          tokenName: params.tokenName,
          tokenSymbol: params.tokenSymbol,
          decimals: params.decimals,
          entryPrice: params.entryPrice,
          amount: params.amount,
          solSpent: params.nativeSpent,
        })
        .onConflictDoUpdate({
          target: [positions.userId, positions.tokenAddress, positions.chain],
          set: {
            amount: sql`${positions.amount} + ${params.amount}`,
            solSpent: sql`${positions.solSpent} + ${params.nativeSpent}`,
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
    nativeReceived: bigint;
    profitLoss: bigint;
    proportionalCost: bigint;
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

      if (params.sellAmount <= 0n) throw new Error("Sell amount must be positive");
      if (params.sellAmount > position.amount) throw new Error("Sell amount exceeds position size");

      const decimals = position.decimals || 6;
      const decimalDivisor = BigInt(10 ** decimals);

      // Recompute server-side to avoid trusting caller-provided math
      const nativeReceived = (params.sellAmount * params.exitPrice) / decimalDivisor;
      const proportionalCost = (position.solSpent * params.sellAmount) / position.amount;
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
      await tx.insert(tradeHistory).values({
        userId: params.userId,
        chain: position.chain as Chain,
        tokenAddress: position.tokenAddress,
        tokenName: position.tokenName,
        tokenSymbol: position.tokenSymbol,
        decimals,
        entryPrice: position.entryPrice,
        exitPrice: params.exitPrice,
        amount: params.sellAmount,
        solSpent: proportionalCost,
        solReceived: nativeReceived,
        profitLoss,
        openedAt: position.openedAt,
      });

      // Use UPDATE for partial sells, DELETE only for full sells
      if (params.sellAmount < position.amount) {
        // PARTIAL SELL: Update position with remaining amount
        const remainingAmount = position.amount - params.sellAmount;
        const remainingCost = position.solSpent - proportionalCost;

        const [updated] = await tx
          .update(positions)
          .set({
            amount: remainingAmount,
            solSpent: remainingCost,
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
}

export const storage: IStorage = new DbStorage();
