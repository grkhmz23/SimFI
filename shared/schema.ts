import { sql } from "drizzle-orm";
import { pgTable, text, varchar, bigint, integer, timestamp, unique, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// =============================================================================
// Chain Constants
// =============================================================================

// Solana: 1 SOL = 1,000,000,000 Lamports
export const LAMPORTS_PER_SOL = 1_000_000_000;

// Base/ETH: 1 ETH = 1,000,000,000,000,000,000 Wei (10^18)
export const WEI_PER_ETH = 1_000_000_000_000_000_000n;

// Chain type
export type Chain = 'base' | 'solana';

// =============================================================================
// Database Tables
// =============================================================================

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  // Solana wallet (kept for backward compatibility, but prefer solanaWalletAddress)
  walletAddress: text("wallet_address"),
  // Explicit chain-specific wallet addresses
  solanaWalletAddress: text("solana_wallet_address"),
  baseWalletAddress: text("base_wallet_address"),
  // Chain-specific balances
  balance: bigint("balance", { mode: "bigint" }).notNull().default(sql`10000000000`), // Solana balance (lamports)
  baseBalance: bigint("base_balance", { mode: "bigint" }).notNull().default(sql`5000000000000000000`), // Base balance (wei) - 5 ETH default
  // Profits
  totalProfit: bigint("total_profit", { mode: "bigint" }).notNull().default(sql`0`), // Solana profit
  baseTotalProfit: bigint("base_total_profit", { mode: "bigint" }).notNull().default(sql`0`), // Base profit
  // User preferences
  preferredChain: text("preferred_chain").notNull().default('base'),
  // Streak tracking (Phase 8)
  streakCount: integer("streak_count").notNull().default(0),
  lastStreakDate: timestamp("last_streak_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const positions = pgTable("positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  chain: text("chain").notNull().default('solana'), // 'base' | 'solana'
  tokenAddress: text("token_address").notNull(),
  tokenName: text("token_name").notNull(),
  tokenSymbol: text("token_symbol").notNull(),
  decimals: integer("decimals").notNull().default(6),
  entryPrice: bigint("entry_price", { mode: "bigint" }).notNull(), // lamports or wei per token
  amount: bigint("amount", { mode: "bigint" }).notNull(), // token amount in smallest unit
  solSpent: bigint("sol_spent", { mode: "bigint" }).notNull(), // native token spent (lamports or wei)
  openedAt: timestamp("opened_at").defaultNow().notNull(),
}, (table) => ({
  // Unique constraint now includes chain
  userTokenChainUnique: unique().on(table.userId, table.tokenAddress, table.chain),
}));

export const tradeHistory = pgTable("trade_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  chain: text("chain").notNull().default('solana'), // 'base' | 'solana'
  tokenAddress: text("token_address").notNull(),
  tokenName: text("token_name").notNull(),
  tokenSymbol: text("token_symbol").notNull(),
  decimals: integer("decimals").notNull().default(6),
  entryPrice: bigint("entry_price", { mode: "bigint" }).notNull(),
  exitPrice: bigint("exit_price", { mode: "bigint" }).notNull(),
  amount: bigint("amount", { mode: "bigint" }).notNull(),
  solSpent: bigint("sol_spent", { mode: "bigint" }).notNull(), // native token spent
  solReceived: bigint("sol_received", { mode: "bigint" }).notNull(), // native token received
  profitLoss: bigint("profit_loss", { mode: "bigint" }).notNull(),
  openedAt: timestamp("opened_at").notNull(),
  closedAt: timestamp("closed_at").defaultNow().notNull(),
});

export const leaderboardPeriods = pgTable("leaderboard_periods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chain: text("chain").notNull().default('solana'), // 'base' | 'solana'
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
// Achievement Badges (Phase 2)
// =============================================================================

export const BADGE_IDS = [
  'first_trade',
  'base_beginner',
  'solana_veteran',
  'green_day',
  'top_10',
  'diamond_hands',
  'profit_1eth',
  'profit_10sol',
] as const;

export type BadgeId = typeof BADGE_IDS[number];

export const userAchievements = pgTable("user_achievements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  badgeId: text("badge_id").notNull(),
  unlockedAt: timestamp("unlocked_at").defaultNow().notNull(),
}, (t) => ({
  userBadgeUnique: unique("user_achievements_user_badge_unique").on(t.userId, t.badgeId),
}));

// =============================================================================
// Referrals (Phase 4)
// =============================================================================

export const referrals = pgTable("referrals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referrerId: varchar("referrer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  refereeId: varchar("referee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  status: text("status").notNull().default('pending'), // pending, converted
  rewardClaimed: integer("reward_claimed").notNull().default(0), // 0 = false, 1 = true
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  refereeUnique: unique("referrals_referee_unique").on(t.refereeId),
}));

// =============================================================================
// Social Follows (Phase 5)
// =============================================================================

export const follows = pgTable("follows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  followerId: varchar("follower_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  followingId: varchar("following_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  followUnique: unique("follows_follower_following_unique").on(t.followerId, t.followingId),
}));

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

// Solana address validation regex
const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
// Base/EVM address validation regex (0x followed by 40 hex characters)
const baseAddressRegex = /^0x[a-fA-F0-9]{40}$/;

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  balance: true,
  baseBalance: true,
  totalProfit: true,
  baseTotalProfit: true,
  createdAt: true,
  walletAddress: true, // Legacy field
  streakCount: true,
  lastStreakDate: true,
}).extend({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().email(),
  password: z.string().min(6),
  // Either Solana or Base wallet (or both) is required
  solanaWalletAddress: z.string().regex(solanaAddressRegex).optional().or(z.literal('')),
  baseWalletAddress: z.string().regex(baseAddressRegex).optional().or(z.literal('')),
  preferredChain: z.enum(['base', 'solana']).default('base'),
}).refine(
  (data) => data.solanaWalletAddress || data.baseWalletAddress,
  { message: "At least one wallet address (Solana or Base) is required" }
);

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
export type UserAchievement = typeof userAchievements.$inferSelect;
export type Referral = typeof referrals.$inferSelect;
export type Follow = typeof follows.$inferSelect;

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
  chain?: Chain;
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
  amount: number; // native token amount (SOL or ETH)
  price: number;
  chain: Chain;
}

export interface SellRequest {
  positionId: string;
  amount?: number;
  exitPrice: number;
  chain: Chain;
}

export interface LeaderboardEntry {
  id: string;
  username: string;
  walletAddress?: string;
  totalProfit?: number;
  periodProfit?: number;
  balance?: number;
  rank?: number;
  chain?: Chain;
}

// =============================================================================
// Utility Functions - Solana
// =============================================================================

export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

// =============================================================================
// Utility Functions - Base/ETH
// =============================================================================

export function ethToWei(eth: number): bigint {
  return BigInt(Math.floor(eth * 1e18));
}

export function weiToEth(wei: bigint): number {
  return Number(wei) / 1e18;
}

export function formatWei(wei: bigint, decimals: number = 18): string {
  const divisor = BigInt(10 ** decimals);
  const wholePart = wei / divisor;
  const fractionalPart = wei % divisor;
  const paddedFraction = fractionalPart.toString().padStart(decimals, '0');
  const trimmedFraction = paddedFraction.replace(/0+$/, '');
  return trimmedFraction ? `${wholePart}.${trimmedFraction}` : wholePart.toString();
}

// =============================================================================
// Address Validation
// =============================================================================

export function isValidSolanaAddress(address: string): boolean {
  return solanaAddressRegex.test(address);
}

export function isValidBaseAddress(address: string): boolean {
  return baseAddressRegex.test(address);
}

export function validateWalletAddress(chain: Chain, address: string): boolean {
  if (chain === 'solana') {
    return isValidSolanaAddress(address);
  } else if (chain === 'base') {
    return isValidBaseAddress(address);
  }
  return false;
}
