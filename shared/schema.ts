import { sql } from "drizzle-orm";
import { pgTable, text, varchar, bigint, integer, timestamp, unique, uniqueIndex, jsonb, numeric, date, serial } from "drizzle-orm/pg-core";
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
  preferredChain: text("preferred_chain").notNull().default('solana'),
  // Streak tracking (Phase 8)
  streakCount: integer("streak_count").notNull().default(0),
  lastStreakDate: timestamp("last_streak_date"),
  // Session security (Phase 8)
  tokenVersion: integer("token_version").notNull().default(0),
  lastLoginAt: timestamp("last_login_at"),
  lastLoginIp: text("last_login_ip"),
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
  entryPrice: numeric("entry_price", { precision: 38, scale: 18 }).notNull(), // price in native token (decimal)
  amount: numeric("amount", { precision: 38, scale: 0 }).notNull(), // token amount in smallest unit
  solSpent: numeric("sol_spent", { precision: 38, scale: 0 }).notNull(), // native token spent (lamports or wei)
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
  entryPrice: numeric("entry_price", { precision: 38, scale: 18 }).notNull(),
  exitPrice: numeric("exit_price", { precision: 38, scale: 18 }).notNull(),
  amount: numeric("amount", { precision: 38, scale: 0 }).notNull(),
  solSpent: numeric("sol_spent", { precision: 38, scale: 0 }).notNull(), // native token spent
  solReceived: numeric("sol_received", { precision: 38, scale: 0 }).notNull(), // native token received
  profitLoss: numeric("profit_loss", { precision: 38, scale: 0 }).notNull(),
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
// Watchlist (Phase 9)
// =============================================================================

export const watchlist = pgTable("watchlist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  chain: text("chain").notNull().default('solana'),
  tokenAddress: text("token_address").notNull(),
  tokenName: text("token_name").notNull(),
  tokenSymbol: text("token_symbol").notNull(),
  decimals: integer("decimals").notNull().default(6),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userTokenChainUnique: unique("watchlist_user_token_chain_unique").on(t.userId, t.tokenAddress, t.chain),
}));

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
// Community Alpha / Voting (Phase 6)
// =============================================================================

export const communityPicks = pgTable("community_picks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  chain: text("chain").notNull().default('solana'),
  tokenAddress: text("token_address").notNull(),
  tokenName: text("token_name").notNull(),
  tokenSymbol: text("token_symbol").notNull(),
  reason: text("reason"),
  voteCount: integer("vote_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const communityVotes = pgTable("community_votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pickId: varchar("pick_id").notNull().references(() => communityPicks.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userPickUnique: unique("community_votes_user_pick_unique").on(t.pickId, t.userId),
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
  tokenVersion: true,
  lastLoginAt: true,
  lastLoginIp: true,
}).extend({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  // Either Solana or Base wallet (or both) is required
  solanaWalletAddress: z.string().regex(solanaAddressRegex).optional().or(z.literal('')),
  baseWalletAddress: z.string().regex(baseAddressRegex).optional().or(z.literal('')),
  preferredChain: z.enum(['base', 'solana']).default('solana'),
  referralCode: z.string().max(50).optional(),
  walletAddress: z.string().max(64).optional(),
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
export type InsertPosition = z.infer<typeof insertPositionSchema>;
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type UserAchievement = typeof userAchievements.$inferSelect;
export type Referral = typeof referrals.$inferSelect;
export type Follow = typeof follows.$inferSelect;
export type AlphaDeskRun = typeof alphaDeskRuns.$inferSelect;
export type AlphaDeskIdea = typeof alphaDeskIdeas.$inferSelect;
export type AlphaDeskIdeaOutcome = typeof alphaDeskIdeaOutcomes.$inferSelect;
export type WatchlistItem = typeof watchlist.$inferSelect;
export type CommunityPick = typeof communityPicks.$inferSelect;
export type CommunityVote = typeof communityVotes.$inferSelect;

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
  liquidity?: number;
  liquidityUsd?: number;
  priceChange24h?: number;
  pairCreatedAt?: number;
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
  amount: string; // native token amount (SOL or ETH) as string
  chain: Chain;
}

export interface SellRequest {
  positionId: string;
  amountLamports?: string; // atomic token amount as string
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
// Alpha Desk (Daily Token Ideas)
// =============================================================================

export const alphaDeskRuns = pgTable("alpha_desk_runs", {
  id: serial("id").primaryKey(),
  runDate: date("run_date").notNull(),
  chain: varchar("chain", { length: 16 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  sourcesUsed: jsonb("sources_used").notNull().default(sql`'{}'::jsonb`),
  llmProvider: varchar("llm_provider", { length: 32 }),
  llmModel: varchar("llm_model", { length: 64 }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
}, (t) => ({
  runDateChainIdx: uniqueIndex("alpha_desk_runs_date_chain_uidx").on(t.runDate, t.chain),
}));

export const alphaDeskIdeas = pgTable("alpha_desk_ideas", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => alphaDeskRuns.id, { onDelete: "cascade" }),
  rank: integer("rank").notNull(),
  chain: varchar("chain", { length: 16 }).notNull(),
  ideaType: varchar("idea_type", { length: 32 }).notNull().default("meme_launch"),
  title: varchar("title", { length: 256 }).notNull(),
  tokenAddress: varchar("token_address", { length: 64 }),
  symbol: varchar("symbol", { length: 32 }),
  name: varchar("name", { length: 128 }),
  pairAddress: varchar("pair_address", { length: 64 }),
  narrativeThesis: text("narrative_thesis").notNull(),
  whyNow: text("why_now").notNull(),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }).notNull(),
  riskFlags: jsonb("risk_flags").notNull().default(sql`'{}'::jsonb`),
  evidence: jsonb("evidence").notNull().default(sql`'{}'::jsonb`),
  priceAtPublishUsd: numeric("price_at_publish_usd", { precision: 38, scale: 18 }),
  priceAtPublishNative: numeric("price_at_publish_native", { precision: 38, scale: 18 }),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alphaDeskIdeaOutcomes = pgTable("alpha_desk_idea_outcomes", {
  id: serial("id").primaryKey(),
  ideaId: integer("idea_id").notNull().references(() => alphaDeskIdeas.id, { onDelete: "cascade" }),
  horizon: varchar("horizon", { length: 16 }).notNull(),
  priceUsd: numeric("price_usd", { precision: 38, scale: 18 }),
  pctChange: numeric("pct_change", { precision: 10, scale: 4 }),
  measuredAt: timestamp("measured_at", { withTimezone: true }).notNull(),
}, (t) => ({
  ideaHorizonIdx: uniqueIndex("alpha_desk_outcomes_idea_horizon_uidx").on(t.ideaId, t.horizon),
}));

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
