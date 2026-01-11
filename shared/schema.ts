import { sql } from "drizzle-orm";
import { pgTable, text, varchar, bigint, integer, timestamp, unique, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// 1 SOL = 1,000,000,000 Lamports
export const LAMPORTS_PER_SOL = 1_000_000_000;

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  walletAddress: text("wallet_address").notNull(),
  balance: bigint("balance", { mode: "bigint" }).notNull().default(sql`10000000000`),
  totalProfit: bigint("total_profit", { mode: "bigint" }).notNull().default(sql`0`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const positions = pgTable("positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  tokenAddress: text("token_address").notNull(),
  tokenName: text("token_name").notNull(),
  tokenSymbol: text("token_symbol").notNull(),
  decimals: integer("decimals").notNull().default(6),
  entryPrice: bigint("entry_price", { mode: "bigint" }).notNull(),
  amount: bigint("amount", { mode: "bigint" }).notNull(),
  solSpent: bigint("sol_spent", { mode: "bigint" }).notNull(),
  openedAt: timestamp("opened_at").defaultNow().notNull(),
}, (table) => ({
  userTokenUnique: unique().on(table.userId, table.tokenAddress),
}));

export const tradeHistory = pgTable("trade_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  tokenAddress: text("token_address").notNull(),
  tokenName: text("token_name").notNull(),
  tokenSymbol: text("token_symbol").notNull(),
  decimals: integer("decimals").notNull().default(6),
  entryPrice: bigint("entry_price", { mode: "bigint" }).notNull(),
  exitPrice: bigint("exit_price", { mode: "bigint" }).notNull(),
  amount: bigint("amount", { mode: "bigint" }).notNull(),
  solSpent: bigint("sol_spent", { mode: "bigint" }).notNull(),
  solReceived: bigint("sol_received", { mode: "bigint" }).notNull(),
  profitLoss: bigint("profit_loss", { mode: "bigint" }).notNull(),
  openedAt: timestamp("opened_at").notNull(),
  closedAt: timestamp("closed_at").defaultNow().notNull(),
});

export const leaderboardPeriods = pgTable("leaderboard_periods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  winnerId: varchar("winner_id").references(() => users.id),
  winnerProfit: bigint("winner_profit", { mode: "bigint" }),
});

export const telegramSessions = pgTable("telegram_sessions", {
  telegramUserId: text("telegram_user_id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  token: text("token").notNull(),
  balance: bigint("balance", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

// =============================================================================
// Rewards Engine Tables (FINAL - keyed by leaderboard_period_id)
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

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  balance: true,
  totalProfit: true,
  createdAt: true,
}).extend({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().email(),
  password: z.string().min(6),
  walletAddress: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
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
export type User = typeof users.$inferSelect;
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

export interface BuyRequest {
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  solAmount: number;
  price: number;
}

export interface SellRequest {
  positionId: string;
  amount?: number;
  exitPrice: number;
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
// Utility Functions
// =============================================================================

export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}