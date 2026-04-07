import { sql } from "drizzle-orm";
import { pgTable, text, varchar, bigint, integer, timestamp, unique, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// =============================================================================
// CHAIN SUPPORT - Multi-chain configuration
// =============================================================================

/**
 * Supported blockchain chains
 */
export const CHAINS = ['solana', 'base'] as const;
export type Chain = typeof CHAINS[number];

/**
 * Chain ID enum for database
 */
export const chainEnum = pgEnum('chain', CHAINS);

/**
 * Chain configuration constants
 */
export const CHAIN_CONFIG = {
  solana: {
    id: 'solana' as Chain,
    name: 'Solana',
    nativeSymbol: 'SOL',
    nativeName: 'Solana',
    decimals: 9,
  },
  base: {
    id: 'base' as Chain,
    name: 'Base',
    nativeSymbol: 'ETH',
    nativeName: 'Ethereum',
    decimals: 18,
  },
} as const;

// Legacy constant for backward compatibility
// 1 SOL = 1,000,000,000 Lamports
export const LAMPORTS_PER_SOL = 1_000_000_000;

// =============================================================================
// USERS TABLE
// =============================================================================

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  // Primary wallet address (usually Solana for backward compatibility)
  walletAddress: text("wallet_address").notNull(),
  // Legacy balance field - aggregates all chains for backward compatibility
  // Will be deprecated in favor of user_balances table
  balance: bigint("balance", { mode: "bigint" }).notNull().default(sql`10000000000`),
  totalProfit: bigint("total_profit", { mode: "bigint" }).notNull().default(sql`0`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// =============================================================================
// USER BALANCES - Per-chain balances
// =============================================================================

/**
 * User balances per chain
 * Allows users to have separate balances on each supported chain
 */
export const userBalances = pgTable("user_balances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  chain: chainEnum("chain").notNull(),
  balance: bigint("balance", { mode: "bigint" }).notNull(),
  totalProfit: bigint("total_profit", { mode: "bigint" }).notNull().default(sql`0`),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // Unique constraint: one balance row per user per chain
  userChainUnique: unique().on(table.userId, table.chain),
}));

// =============================================================================
// USER WALLETS - Multiple wallet addresses per user
// =============================================================================

/**
 * User wallet addresses per chain
 * Allows users to have different addresses on different chains
 */
export const userWallets = pgTable("user_wallets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  chain: chainEnum("chain").notNull(),
  address: text("address").notNull(),
  isPrimary: integer("is_primary").notNull().default(0), // 1 = primary for this chain
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Unique constraint: one address per user per chain
  userChainWalletUnique: unique().on(table.userId, table.chain),
}));

// =============================================================================
// POSITIONS - Updated with chain support
// =============================================================================

export const positions = pgTable("positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  chain: chainEnum("chain").notNull().default('solana'), // NEW: chain identifier
  tokenAddress: text("token_address").notNull(),
  tokenName: text("token_name").notNull(),
  tokenSymbol: text("token_symbol").notNull(),
  decimals: integer("decimals").notNull().default(6),
  entryPrice: bigint("entry_price", { mode: "bigint" }).notNull(),
  amount: bigint("amount", { mode: "bigint" }).notNull(),
  // Renamed from solSpent to nativeSpent (in chain's base units)
  nativeSpent: bigint("native_spent", { mode: "bigint" }).notNull(),
  openedAt: timestamp("opened_at").defaultNow().notNull(),
}, (table) => ({
  // Updated unique constraint to include chain
  userTokenChainUnique: unique().on(table.userId, table.tokenAddress, table.chain),
}));

// =============================================================================
// TRADE HISTORY - Updated with chain support
// =============================================================================

export const tradeHistory = pgTable("trade_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  chain: chainEnum("chain").notNull().default('solana'), // NEW: chain identifier
  tokenAddress: text("token_address").notNull(),
  tokenName: text("token_name").notNull(),
  tokenSymbol: text("token_symbol").notNull(),
  decimals: integer("decimals").notNull().default(6),
  entryPrice: bigint("entry_price", { mode: "bigint" }).notNull(),
  exitPrice: bigint("exit_price", { mode: "bigint" }).notNull(),
  amount: bigint("amount", { mode: "bigint" }).notNull(),
  // Renamed from solSpent/solReceived to native equivalents
  nativeSpent: bigint("native_spent", { mode: "bigint" }).notNull(),
  nativeReceived: bigint("native_received", { mode: "bigint" }).notNull(),
  profitLoss: bigint("profit_loss", { mode: "bigint" }).notNull(),
  openedAt: timestamp("opened_at").notNull(),
  closedAt: timestamp("closed_at").defaultNow().notNull(),
});

// =============================================================================
// LEADERBOARD PERIODS
// =============================================================================

export const leaderboardPeriods = pgTable("leaderboard_periods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  winnerId: varchar("winner_id").references(() => users.id),
  winnerProfit: bigint("winner_profit", { mode: "bigint" }),
});

// =============================================================================
// TELEGRAM SESSIONS - Updated with chain support
// =============================================================================

export const telegramSessions = pgTable("telegram_sessions", {
  telegramUserId: text("telegram_user_id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  token: text("token").notNull(),
  // Default chain for this telegram session
  chain: chainEnum("chain").notNull().default('solana'),
  balance: bigint("balance", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

// =============================================================================
// Rewards Engine Tables
// =============================================================================

export type PayoutPlanEntry = {
  rank: 1 | 2 | 3;
  wallet: string;
  amountLamports: string;
  userId?: string | null;
  profitLamports?: string;
  tradeCount?: number;
};

export const rewardsState = pgTable("rewards_state", {
  id: integer("id").primaryKey().default(1),

  carryRewardsLamports: bigint("carry_rewards_lamports", { mode: "bigint" }).notNull().default(sql`0`),
  treasuryAccruedLamports: bigint("treasury_accrued_lamports", { mode: "bigint" }).notNull().default(sql`0`),

  lastProcessedPeriodId: varchar("last_processed_period_id").references(() => leaderboardPeriods.id),
  lastProcessedPeriodEnd: timestamp("last_processed_period_end"),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const rewardsEpochs = pgTable("rewards_epochs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  leaderboardPeriodId: varchar("leaderboard_period_id").notNull().references(() => leaderboardPeriods.id),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),

  rewardsPoolBps: integer("rewards_pool_bps").notNull().default(5000),

  beforeBalanceLamports: bigint("before_balance_lamports", { mode: "bigint" }),
  afterBalanceLamports: bigint("after_balance_lamports", { mode: "bigint" }),

  totalInflowLamports: bigint("total_inflow_lamports", { mode: "bigint" }).notNull().default(sql`0`),
  rewardInflowLamports: bigint("reward_inflow_lamports", { mode: "bigint" }).notNull().default(sql`0`),
  treasuryInflowLamports: bigint("treasury_inflow_lamports", { mode: "bigint" }).notNull().default(sql`0`),

  carryInLamports: bigint("carry_in_lamports", { mode: "bigint" }).notNull().default(sql`0`),
  totalPotLamports: bigint("total_pot_lamports", { mode: "bigint" }).notNull().default(sql`0`),

  claimStartedAt: timestamp("claim_started_at"),
  claimCompletedAt: timestamp("claim_completed_at"),
  claimTxSignatures: jsonb("claim_tx_signatures").$type<string[]>().default(sql`'[]'::jsonb`),

  payoutPlan: jsonb("payout_plan").$type<PayoutPlanEntry[]>().default(sql`'[]'::jsonb`),
  payoutStartedAt: timestamp("payout_started_at"),
  payoutCompletedAt: timestamp("payout_completed_at"),
  payoutTxSignature: text("payout_tx_signature"),
  totalPaidLamports: bigint("total_paid_lamports", { mode: "bigint" }).notNull().default(sql`0`),

  status: varchar("status", { length: 20 }).notNull().default("created"),
  failureReason: text("failure_reason"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  periodUnique: unique("rewards_epochs_period_unique").on(t.leaderboardPeriodId),
}));

export const rewardsWinners = pgTable("rewards_winners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  epochId: varchar("epoch_id").notNull().references(() => rewardsEpochs.id, { onDelete: "cascade" }),

  rank: integer("rank").notNull(),
  walletAddress: text("wallet_address").notNull(),
  userId: varchar("user_id").references(() => users.id),

  profitLamports: bigint("profit_lamports", { mode: "bigint" }).notNull().default(sql`0`),
  tradeCount: integer("trade_count").notNull().default(0),
  payoutLamports: bigint("payout_lamports", { mode: "bigint" }).notNull().default(sql`0`),

  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  epochRankUnique: unique("rewards_winners_epoch_rank_unique").on(t.epochId, t.rank),
  epochWalletUnique: unique("rewards_winners_epoch_wallet_unique").on(t.epochId, t.walletAddress),
}));

// =============================================================================
// Insert Schemas
// =============================================================================

// Solana address regex (Base58)
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
// EVM address regex (0x + 40 hex chars)
const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  balance: true,
  totalProfit: true,
  createdAt: true,
}).extend({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().email(),
  password: z.string().min(6),
  // Allow either Solana or EVM address format
  walletAddress: z.string().refine(
    (val) => SOLANA_ADDRESS_REGEX.test(val) || EVM_ADDRESS_REGEX.test(val),
    {
      message: "Invalid wallet address. Must be a valid Solana (Base58) or EVM (0x...) address",
    }
  ),
});

export const insertUserBalanceSchema = createInsertSchema(userBalances).omit({
  id: true,
  updatedAt: true,
});

export const insertUserWalletSchema = createInsertSchema(userWallets).omit({
  id: true,
  createdAt: true,
}).extend({
  // Validate address format based on chain
  address: z.string().refine((val) => {
    // This will be validated at runtime based on chain
    return SOLANA_ADDRESS_REGEX.test(val) || EVM_ADDRESS_REGEX.test(val);
  }, {
    message: "Invalid wallet address format",
  }),
});

export const insertPositionSchema = createInsertSchema(positions).omit({
  id: true,
  userId: true,
  openedAt: true,
});

export const insertTradeSchema = createInsertSchema(tradeHistory).omit({
  id: true,
  userId: true,
  closedAt: true,
});

// =============================================================================
// Types
// =============================================================================

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertUserBalance = z.infer<typeof insertUserBalanceSchema>;
export type InsertUserWallet = z.infer<typeof insertUserWalletSchema>;
export type User = typeof users.$inferSelect;
export type UserBalance = typeof userBalances.$inferSelect;
export type UserWallet = typeof userWallets.$inferSelect;
export type Position = typeof positions.$inferSelect;
export type Trade = typeof tradeHistory.$inferSelect;
export type LeaderboardPeriod = typeof leaderboardPeriods.$inferSelect;
export type TelegramSession = typeof telegramSessions.$inferSelect;
export type RewardsState = typeof rewardsState.$inferSelect;
export type RewardsEpoch = typeof rewardsEpochs.$inferSelect;
export type RewardsWinner = typeof rewardsWinners.$inferSelect;
export type InsertPosition = z.infer<typeof insertPositionSchema>;
export type InsertTrade = z.infer<typeof insertTradeSchema>;

// =============================================================================
// Interfaces
// =============================================================================

export interface Token {
  tokenAddress: string;
  name: string;
  symbol: string;
  decimals?: number;
  price: number;
  priceUsd?: number;
  marketCap: number;
  volume24h?: number;
  priceChange24h?: number;
  creator?: string;
  timestamp?: string;
  icon?: string;
  chain?: Chain; // NEW: chain identifier
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest extends InsertUser {}

export interface AuthResponse {
  token: string;
  user: Omit<User, 'password'>;
}

// Updated BuyRequest with chain support
export interface BuyRequest {
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  nativeAmount: number; // Renamed from solAmount
  price: number;
  chain: Chain; // NEW: chain identifier
}

// Updated SellRequest with chain support
export interface SellRequest {
  positionId: string;
  amount?: number;
  exitPrice: number;
  chain?: Chain; // Optional - can be inferred from position
}

export interface LeaderboardEntry {
  id: string;
  username: string;
  walletAddress?: string;
  totalProfit?: number;
  periodProfit?: number;
  balance?: number;
  rank?: number;
}

// =============================================================================
// Utility Functions (Backward Compatible)
// =============================================================================

/**
 * @deprecated Use parseToBaseUnits from chain-utils.ts instead
 */
export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

/**
 * @deprecated Use formatFromBaseUnits from chain-utils.ts instead
 */
export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

// =============================================================================
// Chain-aware utility functions
// =============================================================================

/**
 * Get default starting balance for a chain (in base units)
 */
export function getDefaultStartingBalance(chain: Chain): bigint {
  const defaults: Record<Chain, bigint> = {
    solana: 10_000_000_000n,           // 10 SOL
    base: 10_000_000_000_000_000_000n, // 10 ETH
  };
  return defaults[chain];
}

/**
 * Get native symbol for a chain
 */
export function getNativeSymbol(chain: Chain): string {
  return CHAIN_CONFIG[chain].nativeSymbol;
}

/**
 * Get decimals for a chain
 */
export function getChainDecimals(chain: Chain): number {
  return CHAIN_CONFIG[chain].decimals;
}

/**
 * Format base units to display string for a chain
 */
export function formatBaseUnits(chain: Chain, baseUnits: bigint): string {
  const decimals = getChainDecimals(chain);
  const multiplier = BigInt(10) ** BigInt(decimals);
  
  const wholePart = baseUnits / multiplier;
  const fracPart = baseUnits % multiplier;
  
  if (fracPart === 0n) {
    return wholePart.toString();
  }
  
  let fracStr = fracPart.toString().padStart(decimals, '0');
  fracStr = fracStr.replace(/0+$/, '');
  
  return `${wholePart}.${fracStr}`;
}

/**
 * Parse decimal string to base units for a chain
 */
export function parseToBaseUnits(chain: Chain, amount: string): bigint {
  const decimals = getChainDecimals(chain);
  const parts = amount.split('.');
  const wholePart = parts[0] || '0';
  let fracPart = parts[1] || '';
  
  if (fracPart.length > decimals) {
    fracPart = fracPart.slice(0, decimals);
  } else {
    fracPart = fracPart.padEnd(decimals, '0');
  }
  
  return BigInt(wholePart + fracPart);
}
