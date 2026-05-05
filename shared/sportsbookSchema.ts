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
  jsonb,
  customType,
} from "drizzle-orm/pg-core";
import { users } from "./schema";

// Local copy of bigNumeric to avoid circular import issues
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
// Sportsbook Events (mirrors real-world sports fixtures)
// =============================================================================

export const sbEvents = pgTable("sb_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  externalId: text("external_id").notNull().unique(),
  league: text("league").notNull(), // e.g. "basketball_nba"
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  commenceTime: timestamp("commence_time").notNull(),
  status: text("status").notNull().default("scheduled"), // scheduled | live | completed | postponed | cancelled
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  completedAt: timestamp("completed_at"),
  voidedReason: text("voided_reason"),
  rawScores: jsonb("raw_scores"), // last raw /scores payload for audit
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  byLeagueCommence: index("idx_sb_events_league_commence").on(t.league, t.commenceTime),
  byStatus: index("idx_sb_events_status").on(t.status),
}));

// =============================================================================
// Sportsbook Markets (odds snapshots per event)
// =============================================================================

export const sbMarkets = pgTable("sb_markets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => sbEvents.id, { onDelete: "cascade" }),
  marketType: text("market_type").notNull().default("h2h"), // "h2h" for v1
  bookmakerKey: text("bookmaker_key").notNull(), // e.g. "draftkings"
  homeOdds: numeric("home_odds", { precision: 10, scale: 4 }).notNull(),
  awayOdds: numeric("away_odds", { precision: 10, scale: 4 }).notNull(),
  drawOdds: numeric("draw_odds", { precision: 10, scale: 4 }), // null for 2-way markets
  fetchedAt: timestamp("fetched_at").notNull(),
  isLatest: boolean("is_latest").notNull().default(true),
}, (t) => ({
  byEventMarketLatest: index("idx_sb_markets_event_market_latest").on(t.eventId, t.marketType, t.isLatest),
  byFetchedAt: index("idx_sb_markets_fetched_at").on(t.fetchedAt),
}));

// =============================================================================
// Sportsbook Bets (paper bets staked in native chain units)
// =============================================================================

export const sbBets = pgTable("sb_bets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  chain: text("chain").notNull(), // "solana" | "base"
  // Token is implicit from chain: solana → SOL, base → ETH
  eventId: varchar("event_id").notNull().references(() => sbEvents.id),
  marketId: varchar("market_id").notNull().references(() => sbMarkets.id),
  selection: text("selection").notNull(), // "home" | "away" | "draw"
  stake: bigNumeric("stake").notNull(), // lamports or wei
  oddsAtPlacement: numeric("odds_at_placement", { precision: 10, scale: 4 }).notNull(),
  potentialPayout: bigNumeric("potential_payout").notNull(), // stake * odds, in lamports/wei
  status: text("status").notNull().default("open"), // open | won | lost | void
  placedAt: timestamp("placed_at").notNull().defaultNow(),
  settledAt: timestamp("settled_at"),
  payoutAmount: bigNumeric("payout_amount"), // amount credited back (won = potentialPayout, void = stake, lost = 0)
  bookmakerKey: text("bookmaker_key").notNull(), // frozen at placement
  notes: text("notes"),
  idempotencyKey: text("idempotency_key"),
}, (t) => ({
  byUserStatus: index("idx_sb_bets_user_status").on(t.userId, t.status),
  byEventStatus: index("idx_sb_bets_event_status").on(t.eventId, t.status),
  byStatus: index("idx_sb_bets_status").on(t.status),
  byUserIdempotency: uniqueIndex("uniq_sb_bets_user_idempotency")
    .on(t.userId, t.idempotencyKey)
    .where(sql`${t.idempotencyKey} IS NOT NULL`),
}));

// =============================================================================
// League Activity (lazy refresh tracking)
// =============================================================================

export const sbLeagueActivity = pgTable("sb_league_activity", {
  league: text("league").primaryKey(),
  lastUserViewAt: timestamp("last_user_view_at"),
  lastIngestAt: timestamp("last_ingest_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// =============================================================================
// Types
// =============================================================================

export type SbEvent = typeof sbEvents.$inferSelect;
export type SbMarket = typeof sbMarkets.$inferSelect;
export type SbBet = typeof sbBets.$inferSelect;
export type SbLeagueActivity = typeof sbLeagueActivity.$inferSelect;
