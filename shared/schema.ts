import { sql } from "drizzle-orm";
import { pgTable, text, varchar, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  walletAddress: text("wallet_address").notNull(),
  balance: real("balance").notNull().default(10.0),
  totalProfit: real("total_profit").notNull().default(0.0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const positions = pgTable("positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  tokenAddress: text("token_address").notNull(),
  tokenName: text("token_name").notNull(),
  tokenSymbol: text("token_symbol").notNull(),
  entryPrice: real("entry_price").notNull(),
  amount: real("amount").notNull(),
  solSpent: real("sol_spent").notNull(),
  openedAt: timestamp("opened_at").defaultNow().notNull(),
});

export const tradeHistory = pgTable("trade_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  tokenAddress: text("token_address").notNull(),
  tokenName: text("token_name").notNull(),
  tokenSymbol: text("token_symbol").notNull(),
  entryPrice: real("entry_price").notNull(),
  exitPrice: real("exit_price").notNull(),
  amount: real("amount").notNull(),
  solSpent: real("sol_spent").notNull(),
  solReceived: real("sol_received").notNull(),
  profitLoss: real("profit_loss").notNull(),
  openedAt: timestamp("opened_at").notNull(),
  closedAt: timestamp("closed_at").defaultNow().notNull(),
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
export type InsertPosition = z.infer<typeof insertPositionSchema>;
export type InsertTrade = z.infer<typeof insertTradeSchema>;

// Token interface (from WebSocket/API)
export interface Token {
  tokenAddress: string;
  name: string;
  symbol: string;
  price: number;
  marketCap: number;
  creator?: string;
  timestamp?: string;
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
  amount: number;
  price: number;
}

export interface SellRequest {
  positionId: string;
  exitPrice: number;
}

export interface LeaderboardEntry {
  id: string;
  username: string;
  totalProfit?: number;
  periodProfit?: number;
  balance?: number;
}
