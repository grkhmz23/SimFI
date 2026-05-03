import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  boolean,
  integer,
  uniqueIndex,
  index,
  numeric,
  customType,
} from "drizzle-orm/pg-core";
import { users } from "./schema";

// Local copy of bigNumeric to avoid circular import with schema.ts re-export
const bigNumeric = customType<{ data: bigint }>({
  dataType() {
    return 'numeric(38, 0)';
  },
  fromDriver(value: unknown): bigint {
    return BigInt(value as string);
  },
  toDriver(value: bigint): string {
    return value.toString();
  },
});

// =============================================================================
// Prediction Markets (Polymarket mirror)
// =============================================================================

export const predictionMarkets = pgTable("prediction_markets", {
  conditionId: text("condition_id").primaryKey(),
  slug: text("slug").notNull().unique(),
  question: text("question").notNull(),
  description: text("description").notNull().default(""),
  endDate: timestamp("end_date"),
  closed: boolean("closed").notNull().default(false),
  active: boolean("active").notNull().default(true),
  archived: boolean("archived").notNull().default(false),
  yesTokenId: text("yes_token_id").notNull(),
  noTokenId: text("no_token_id").notNull(),
  winningOutcome: text("winning_outcome"),
  lastSyncedAt: timestamp("last_synced_at")
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  byActiveClosed: index("idx_prediction_markets_active_closed").on(t.active, t.closed),
  byEndDate: index("idx_prediction_markets_end_date").on(t.endDate),
  byYesToken: uniqueIndex("uniq_prediction_markets_yes_token").on(t.yesTokenId),
  byNoToken: uniqueIndex("uniq_prediction_markets_no_token").on(t.noTokenId),
}));

// =============================================================================
// Prediction Paper Balances (USD-denominated)
// =============================================================================

export const predictionPaperBalances = pgTable("prediction_paper_balances", {
  userId: varchar("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  balanceMicroUsd: bigNumeric("balance_micro_usd").notNull(),
  realizedPnlMicroUsd: bigNumeric("realized_pnl_micro_usd").notNull().default(sql`0`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// =============================================================================
// Prediction Positions (open paper trades)
// =============================================================================

export const predictionPositions = pgTable("prediction_positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conditionId: text("condition_id").notNull().references(() => predictionMarkets.conditionId, { onDelete: "cascade" }),
  tokenId: text("token_id").notNull(),
  outcome: text("outcome").notNull(),
  sharesMicro: bigNumeric("shares_micro").notNull(),
  avgPrice: numeric("avg_price", { precision: 38, scale: 18 }).notNull(),
  costBasisMicroUsd: bigNumeric("cost_basis_micro_usd").notNull(),
  realizedPnlMicroUsd: bigNumeric("realized_pnl_micro_usd").notNull().default(sql`0`),
  resolutionState: text("resolution_state"),
  settledAt: timestamp("settled_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  byUserToken: uniqueIndex("uniq_prediction_pos_user_token").on(t.userId, t.tokenId),
  byUser: index("idx_prediction_pos_user").on(t.userId),
  byCondition: index("idx_prediction_pos_condition").on(t.conditionId),
}));

// =============================================================================
// Prediction Trades (history + audit)
// =============================================================================

export const predictionTrades = pgTable("prediction_trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conditionId: text("condition_id").notNull(),
  tokenId: text("token_id").notNull(),
  outcome: text("outcome").notNull(),
  side: text("side").notNull(),
  sharesMicro: bigNumeric("shares_micro").notNull(),
  avgPrice: numeric("avg_price", { precision: 38, scale: 18 }).notNull(),
  slippageBps: integer("slippage_bps").notNull().default(0),
  feeMicroUsd: bigNumeric("fee_micro_usd").notNull().default(sql`0`),
  totalMicroUsd: bigNumeric("total_micro_usd").notNull(),
  bookSnapshot: text("book_snapshot").notNull(),
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  byUserCreated: index("idx_prediction_trades_user_created").on(t.userId, t.createdAt),
  byCondition: index("idx_prediction_trades_condition").on(t.conditionId),
  byUserIdempotency: uniqueIndex("uniq_prediction_trades_user_idempotency")
    .on(t.userId, t.idempotencyKey)
    .where(sql`${t.idempotencyKey} IS NOT NULL`),
}));

// =============================================================================
// Types
// =============================================================================

export type PredictionMarket = typeof predictionMarkets.$inferSelect;
export type PredictionPaperBalance = typeof predictionPaperBalances.$inferSelect;
export type PredictionPosition = typeof predictionPositions.$inferSelect;
export type PredictionTrade = typeof predictionTrades.$inferSelect;
