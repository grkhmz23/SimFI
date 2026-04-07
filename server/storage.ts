import { eq, desc, and, sql, gt } from 'drizzle-orm';
import { db } from './db';
import { 
  users, positions, tradeHistory, leaderboardPeriods, telegramSessions,
  userBalances, userWallets,
  type User, type Position, type Trade, type TelegramSession, 
  type InsertUser, type InsertPosition, type InsertTrade,
  type UserBalance, type UserWallet, type Chain,
  LAMPORTS_PER_SOL, getDefaultStartingBalance, CHAINS
} from '@shared/schema';

// =============================================================================
// STORAGE INTERFACES
// =============================================================================

export interface IStorage {
  // User operations
  createUser(data: InsertUser & { password: string }): Promise<User>;
  getUserById(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  updateUserProfile(id: string, data: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User | undefined>;
  
  // Balance operations (per-chain)
  getUserBalance(userId: string, chain: Chain): Promise<bigint>;
  updateUserBalance(userId: string, chain: Chain, balanceChange: bigint): Promise<UserBalance | undefined>;
  updateUserTotalProfit(userId: string, chain: Chain, profitChange: bigint): Promise<UserBalance | undefined>;
  getAllUserBalances(userId: string): Promise<UserBalance[]>;
  
  // Wallet operations (per-chain)
  getUserWallet(userId: string, chain: Chain): Promise<UserWallet | undefined>;
  setUserWallet(userId: string, chain: Chain, address: string): Promise<UserWallet>;
  getAllUserWallets(userId: string): Promise<UserWallet[]>;

  // Position operations
  createPosition(data: Omit<InsertPosition, 'id'> & { userId: string; chain: Chain }): Promise<Position>;
  createOrAggregatePosition(data: Omit<InsertPosition, 'id'> & { userId: string; chain: Chain }): Promise<Position>;
  getPositionById(id: string): Promise<Position | undefined>;
  getPositionByUserAndToken(userId: string, tokenAddress: string, chain: Chain): Promise<Position | undefined>;
  getUserPositions(userId: string, chain?: Chain): Promise<Position[]>;
  updatePosition(id: string, data: Partial<Omit<Position, 'id' | 'userId' | 'tokenAddress' | 'tokenName' | 'tokenSymbol' | 'openedAt' | 'chain'>>): Promise<Position | undefined>;
  aggregatePosition(id: string, additionalAmount: bigint, additionalNativeSpent: bigint): Promise<Position | undefined>;
  deletePosition(id: string): Promise<void>;

  // Trade operations
  createTrade(data: Omit<InsertTrade, 'id'> & { userId: string; chain: Chain }): Promise<Trade>;
  getUserTrades(userId: string, chain?: Chain, limit?: number, offset?: number): Promise<Trade[]>;
  getUserTradesCount(userId: string, chain?: Chain): Promise<number>;

  // Atomic trade execution (chain-aware)
  executeBuyTrade(params: {
    userId: string;
    chain: Chain;
    tokenAddress: string;
    tokenName: string;
    tokenSymbol: string;
    decimals: number;
    entryPrice: bigint;
    amount: bigint;
    nativeSpent: bigint;
  }): Promise<Position>;

  executeSellTrade(params: {
    userId: string;
    positionId: string;
    chain: Chain;
    sellAmount: bigint;
    exitPrice: bigint;
    nativeReceived: bigint;
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
  saveTelegramSession(telegramUserId: string, userId: string, token: string, balance: bigint, chain?: Chain): Promise<TelegramSession>;
  getTelegramSession(telegramUserId: string): Promise<TelegramSession | undefined>;
  getAllActiveTelegramSessions(): Promise<TelegramSession[]>;
  deleteTelegramSession(telegramUserId: string): Promise<void>;
  deleteExpiredTelegramSessions(): Promise<void>;
}

// =============================================================================
// DATABASE STORAGE IMPLEMENTATION
// =============================================================================

class DbStorage implements IStorage {
  
  // ============================================================================
  // USER OPERATIONS
  // ============================================================================
  
  async createUser(data: InsertUser & { password: string }): Promise<User> {
    // Create user with legacy balance for backward compatibility
    const [user] = await db.insert(users).values({
      ...data,
      balance: BigInt(10 * LAMPORTS_PER_SOL), // 10 SOL legacy balance
      totalProfit: 0n,
    }).returning();

    // Initialize per-chain balances (Solana by default)
    for (const chain of CHAINS) {
      await db.insert(userBalances).values({
        userId: user.id,
        chain,
        balance: chain === 'solana' 
          ? getDefaultStartingBalance('solana')  // 10 SOL
          : getDefaultStartingBalance('base'),   // 10 ETH
        totalProfit: 0n,
      }).onConflictDoNothing();
    }

    // Create wallet entry for the primary wallet address
    // Determine chain from address format
    const isEvm = data.walletAddress.startsWith('0x');
    const walletChain: Chain = isEvm ? 'base' : 'solana';
    
    await db.insert(userWallets).values({
      userId: user.id,
      chain: walletChain,
      address: data.walletAddress,
      isPrimary: 1,
    }).onConflictDoNothing();

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

  // ============================================================================
  // BALANCE OPERATIONS (PER-CHAIN)
  // ============================================================================

  async getUserBalance(userId: string, chain: Chain): Promise<bigint> {
    const [balance] = await db.select()
      .from(userBalances)
      .where(and(
        eq(userBalances.userId, userId),
        eq(userBalances.chain, chain)
      ));
    
    return balance?.balance ?? 0n;
  }

  async updateUserBalance(userId: string, chain: Chain, balanceChange: bigint): Promise<UserBalance | undefined> {
    // Ensure balance record exists
    await db.insert(userBalances)
      .values({
        userId,
        chain,
        balance: balanceChange > 0n ? balanceChange : 0n,
        totalProfit: 0n,
      })
      .onConflictDoNothing();

    // Update balance atomically
    const [balance] = await db.update(userBalances)
      .set({ 
        balance: sql`${userBalances.balance} + ${balanceChange}`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(userBalances.userId, userId),
        eq(userBalances.chain, chain)
      ))
      .returning();

    // Also update legacy user.balance for backward compatibility (Solana only)
    if (chain === 'solana') {
      await db.update(users)
        .set({ balance: sql`${users.balance} + ${balanceChange}` })
        .where(eq(users.id, userId));
    }

    return balance;
  }

  async updateUserTotalProfit(userId: string, chain: Chain, profitChange: bigint): Promise<UserBalance | undefined> {
    // Ensure balance record exists
    await db.insert(userBalances)
      .values({
        userId,
        chain,
        balance: getDefaultStartingBalance(chain),
        totalProfit: profitChange > 0n ? profitChange : 0n,
      })
      .onConflictDoNothing();

    const [balance] = await db.update(userBalances)
      .set({ 
        totalProfit: sql`${userBalances.totalProfit} + ${profitChange}`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(userBalances.userId, userId),
        eq(userBalances.chain, chain)
      ))
      .returning();

    // Also update legacy user.totalProfit for backward compatibility
    await db.update(users)
      .set({ totalProfit: sql`${users.totalProfit} + ${profitChange}` })
      .where(eq(users.id, userId));

    return balance;
  }

  async getAllUserBalances(userId: string): Promise<UserBalance[]> {
    return db.select()
      .from(userBalances)
      .where(eq(userBalances.userId, userId))
      .orderBy(userBalances.chain);
  }

  // ============================================================================
  // WALLET OPERATIONS (PER-CHAIN)
  // ============================================================================

  async getUserWallet(userId: string, chain: Chain): Promise<UserWallet | undefined> {
    const [wallet] = await db.select()
      .from(userWallets)
      .where(and(
        eq(userWallets.userId, userId),
        eq(userWallets.chain, chain)
      ));
    return wallet;
  }

  async setUserWallet(userId: string, chain: Chain, address: string): Promise<UserWallet> {
    const [wallet] = await db.insert(userWallets)
      .values({
        userId,
        chain,
        address,
        isPrimary: 1,
      })
      .onConflictDoUpdate({
        target: [userWallets.userId, userWallets.chain],
        set: { address, isPrimary: 1 },
      })
      .returning();

    // If this is the primary wallet, update users table too
    const [existingWallets] = await db.select({ count: sql<number>`count(*)` })
      .from(userWallets)
      .where(eq(userWallets.userId, userId));

    if (existingWallets.count === 1 || chain === 'solana') {
      await db.update(users)
        .set({ walletAddress: address })
        .where(eq(users.id, userId));
    }

    return wallet;
  }

  async getAllUserWallets(userId: string): Promise<UserWallet[]> {
    return db.select()
      .from(userWallets)
      .where(eq(userWallets.userId, userId))
      .orderBy(userWallets.chain);
  }

  // ============================================================================
  // POSITION OPERATIONS
  // ============================================================================

  async createPosition(data: Omit<InsertPosition, 'id'> & { userId: string; chain: Chain }): Promise<Position> {
    const [position] = await db.insert(positions).values({
      ...data,
      chain: data.chain,
    }).returning();
    return position;
  }

  async createOrAggregatePosition(data: Omit<InsertPosition, 'id'> & { userId: string; chain: Chain }): Promise<Position> {
    const [position] = await db.insert(positions)
      .values({
        ...data,
        chain: data.chain,
      })
      .onConflictDoUpdate({
        target: [positions.userId, positions.tokenAddress, positions.chain],
        set: {
          amount: sql`${positions.amount} + ${data.amount}`,
          nativeSpent: sql`${positions.nativeSpent} + ${data.nativeSpent ?? 0n}`,
          entryPrice: sql`FLOOR(((${positions.nativeSpent} + EXCLUDED.native_spent)::numeric * power(10::numeric, COALESCE(${positions.decimals}, EXCLUDED.decimals, 6))) / NULLIF((${positions.amount} + EXCLUDED.amount), 0))::bigint`,
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
      query = db.select()
        .from(positions)
        .where(and(
          eq(positions.userId, userId),
          eq(positions.chain, chain)
        ));
    }
    
    return query.orderBy(desc(positions.openedAt));
  }

  async updatePosition(
    id: string, 
    data: Partial<Omit<Position, 'id' | 'userId' | 'tokenAddress' | 'tokenName' | 'tokenSymbol' | 'openedAt' | 'chain'>>
  ): Promise<Position | undefined> {
    const [position] = await db.update(positions).set(data).where(eq(positions.id, id)).returning();
    return position;
  }

  async aggregatePosition(id: string, additionalAmount: bigint, additionalNativeSpent: bigint): Promise<Position | undefined> {
    const [position] = await db.update(positions)
      .set({
        amount: sql`${positions.amount} + ${additionalAmount}`,
        nativeSpent: sql`${positions.nativeSpent} + ${additionalNativeSpent}`,
        entryPrice: sql`FLOOR(((${positions.nativeSpent} + ${additionalNativeSpent})::numeric * power(10::numeric, COALESCE(${positions.decimals}, 6))) / NULLIF((${positions.amount} + ${additionalAmount}), 0))::bigint`,
      })
      .where(eq(positions.id, id))
      .returning();
    return position;
  }

  async deletePosition(id: string): Promise<void> {
    await db.delete(positions).where(eq(positions.id, id));
  }

  // ============================================================================
  // TRADE OPERATIONS
  // ============================================================================

  async createTrade(data: Omit<InsertTrade, 'id'> & { userId: string; chain: Chain }): Promise<Trade> {
    const [trade] = await db.insert(tradeHistory).values({
      ...data,
      chain: data.chain,
    }).returning();
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
    let condition = eq(tradeHistory.userId, userId);
    
    if (chain) {
      condition = and(condition, eq(tradeHistory.chain, chain))!;
    }
    
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(tradeHistory)
      .where(condition);
    
    return result[0]?.count || 0;
  }

  // ============================================================================
  // ATOMIC TRADE EXECUTION (CHAIN-AWARE)
  // ============================================================================

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
      // 1. Deduct balance from user_balances table (guarded)
      const [balance] = await tx
        .update(userBalances)
        .set({ 
          balance: sql`${userBalances.balance} - ${params.nativeSpent}`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(userBalances.userId, params.userId),
          eq(userBalances.chain, params.chain),
          sql`${userBalances.balance} >= ${params.nativeSpent}`
        ))
        .returning();

      if (!balance) {
        const [exists] = await tx
          .select({ id: userBalances.id })
          .from(userBalances)
          .where(and(
            eq(userBalances.userId, params.userId),
            eq(userBalances.chain, params.chain)
          ));

        if (!exists) throw new Error(`Balance not found for chain: ${params.chain}`);
        throw new Error("Insufficient balance");
      }

      // Also update legacy balance for Solana
      if (params.chain === 'solana') {
        await tx.update(users)
          .set({ balance: sql`${users.balance} - ${params.nativeSpent}` })
          .where(eq(users.id, params.userId));
      }

      // 2. Create or aggregate position (chain-aware)
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
          nativeSpent: params.nativeSpent,
        })
        .onConflictDoUpdate({
          target: [positions.userId, positions.tokenAddress, positions.chain],
          set: {
            amount: sql`${positions.amount} + ${params.amount}`,
            nativeSpent: sql`${positions.nativeSpent} + ${params.nativeSpent}`,
            entryPrice: sql`FLOOR(((${positions.nativeSpent} + EXCLUDED.native_spent)::numeric * power(10::numeric, COALESCE(${positions.decimals}, EXCLUDED.decimals, 6))) / NULLIF((${positions.amount} + EXCLUDED.amount), 0))::bigint`,
          },
        })
        .returning();

      return position;
    });
  }

  async executeSellTrade(params: {
    userId: string;
    positionId: string;
    chain: Chain;
    sellAmount: bigint;
    exitPrice: bigint;
    nativeReceived: bigint;
    profitLoss: bigint;
    proportionalCost: bigint;
  }): Promise<void> {
    await db.transaction(async (tx) => {
      // Lock the position row
      await tx.execute(
        sql`SELECT 1 FROM ${positions} WHERE ${positions.id} = ${params.positionId} FOR UPDATE`
      );

      const [position] = await tx
        .select()
        .from(positions)
        .where(eq(positions.id, params.positionId));

      if (!position) throw new Error("Position not found");
      if (position.userId !== params.userId) throw new Error("Unauthorized");
      if (position.chain !== params.chain) throw new Error("Chain mismatch");

      if (params.sellAmount <= 0n) throw new Error("Sell amount must be positive");
      if (params.sellAmount > position.amount) throw new Error("Sell amount exceeds position size");

      const decimals = position.decimals || 6;
      const decimalDivisor = BigInt(10 ** decimals);

      // Recompute server-side
      const nativeReceived = (params.sellAmount * params.exitPrice) / decimalDivisor;
      const proportionalCost = (position.nativeSpent * params.sellAmount) / position.amount;
      const profitLoss = nativeReceived - proportionalCost;

      // Update user balance
      const [updatedBalance] = await tx
        .update(userBalances)
        .set({
          balance: sql`${userBalances.balance} + ${nativeReceived}`,
          totalProfit: sql`${userBalances.totalProfit} + ${profitLoss}`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(userBalances.userId, params.userId),
          eq(userBalances.chain, params.chain)
        ))
        .returning();

      if (!updatedBalance) throw new Error("Balance not found");

      // Also update legacy user table for Solana
      if (params.chain === 'solana') {
        await tx.update(users)
          .set({
            balance: sql`${users.balance} + ${nativeReceived}`,
            totalProfit: sql`${users.totalProfit} + ${profitLoss}`,
          })
          .where(eq(users.id, params.userId));
      }

      // Create trade history
      await tx.insert(tradeHistory).values({
        userId: params.userId,
        chain: params.chain,
        tokenAddress: position.tokenAddress,
        tokenName: position.tokenName,
        tokenSymbol: position.tokenSymbol,
        decimals,
        entryPrice: position.entryPrice,
        exitPrice: params.exitPrice,
        amount: params.sellAmount,
        nativeSpent: proportionalCost,
        nativeReceived,
        profitLoss,
        openedAt: position.openedAt,
      });

      // Update or delete position
      if (params.sellAmount < position.amount) {
        const remainingAmount = position.amount - params.sellAmount;
        const remainingCost = position.nativeSpent - proportionalCost;

        const [updated] = await tx
          .update(positions)
          .set({
            amount: remainingAmount,
            nativeSpent: remainingCost,
          })
          .where(and(
            eq(positions.id, params.positionId),
            eq(positions.userId, params.userId),
            eq(positions.chain, params.chain)
          ))
          .returning({ id: positions.id });

        if (!updated) throw new Error("Failed to update position");
      } else {
        const deleted = await tx
          .delete(positions)
          .where(and(
            eq(positions.id, params.positionId),
            eq(positions.userId, params.userId),
            eq(positions.chain, params.chain)
          ))
          .returning({ id: positions.id });

        if (deleted.length === 0) throw new Error("Position already closed");
      }
    });
  }

  // ============================================================================
  // LEADERBOARD OPERATIONS
  // ============================================================================

  async getTopUsersByTotalProfit(limit: number): Promise<any[]> {
    // Aggregate total profit across all chains
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
    const periods = await db.select()
      .from(leaderboardPeriods)
      .where(sql`${leaderboardPeriods.winnerId} IS NOT NULL`)
      .orderBy(desc(leaderboardPeriods.endTime))
      .limit(limitPeriods);

    const allWinners = [];
    for (const period of periods) {
      const topTraders = await this.getTopUsersByPeriodProfit(
        period.startTime,
        period.endTime,
        3
      );

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

  // ============================================================================
  // TELEGRAM SESSION OPERATIONS
  // ============================================================================

  async saveTelegramSession(
    telegramUserId: string, 
    userId: string, 
    token: string, 
    balance: bigint,
    chain: Chain = 'solana'
  ): Promise<TelegramSession> {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const [session] = await db.insert(telegramSessions)
      .values({
        telegramUserId,
        userId,
        token,
        balance,
        chain,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: telegramSessions.telegramUserId,
        set: {
          userId,
          token,
          balance,
          chain,
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

// =============================================================================
// EXPORT SINGLETON
// =============================================================================

export const storage: IStorage = new DbStorage();
