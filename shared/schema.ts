import { sql } from "drizzle-orm";
import { pgTable, text, varchar, bigint, integer, timestamp, unique } from "drizzle-orm/pg-core";
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
  decimals: integer("decimals").notNull().default(6), // Most pump.fun tokens use 6 decimals
  entryPrice: bigint("entry_price", { mode: "bigint" }).notNull(),
  amount: bigint("amount", { mode: "bigint" }).notNull(),
  solSpent: bigint("sol_spent", { mode: "bigint" }).notNull(),
  openedAt: timestamp("opened_at").defaultNow().notNull(),
}, (table) => ({
  // Unique constraint on userId + tokenAddress to enable position aggregation
  userTokenUnique: unique().on(table.userId, table.tokenAddress),
}));

export const tradeHistory = pgTable("trade_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  tokenAddress: text("token_address").notNull(),
  tokenName: text("token_name").notNull(),
  tokenSymbol: text("token_symbol").notNull(),
  decimals: integer("decimals").notNull().default(6), // Most pump.fun tokens use 6 decimals
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

// Insert Schemas
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

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Position = typeof positions.$inferSelect;
export type Trade = typeof tradeHistory.$inferSelect;
export type LeaderboardPeriod = typeof leaderboardPeriods.$inferSelect;
export type TelegramSession = typeof telegramSessions.$inferSelect;
export type InsertPosition = z.infer<typeof insertPositionSchema>;
export type InsertTrade = z.infer<typeof insertTradeSchema>;

// Token interface (from WebSocket/API)
export interface Token {
  tokenAddress: string;
  name: string;
  symbol: string;
  decimals?: number; // Token decimals (6 for most pump.fun tokens, 9 for SOL)
  price: number; // Price in Lamports per token (for trading calculations)
  priceUsd?: number; // Price in USD (for display)
  marketCap: number; // Market cap in USD
  volume24h?: number; // 24h volume in USD
  priceChange24h?: number; // 24h price change percentage
  creator?: string;
  timestamp?: string;
  icon?: string; // Token image URL from DexScreener
}

// API Request/Response types
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
  solAmount: number; // Amount of SOL to spend (can be fractional, e.g., 0.1, 1, 5)
  price: number; // Price in Lamports per token
}

export interface SellRequest {
  positionId: string;
  amount?: number; // Optional partial sell, if not provided sells all
  exitPrice: number; // Price in Lamports per token
}

export interface LeaderboardEntry {
  id: string;
  username: string;
  walletAddress?: string;
  totalProfit?: number; // In Lamports
  periodProfit?: number; // In Lamports
  balance?: number; // In Lamports
  rank?: number;
}

// Utility functions for Lamports conversion
export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}
