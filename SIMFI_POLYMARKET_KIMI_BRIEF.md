# SimFi × Polymarket — Prediction Markets Paper Trading
## Kimi Code Implementation Brief (Additive-Only Integration)

> You are extending an existing, production codebase. The single most important rule of this brief is: **do not break anything that already works.** SimFi is a live multi-chain (Solana + Base) memecoin paper-trading platform with sophisticated server-authoritative pricing, atomic trade execution, BigInt-safe math, JWT+CSRF auth, SSE real-time prices, idempotency-protected trade endpoints, a daily AI Alpha Desk pipeline, leaderboards, social graph, achievements, referrals, and a Telegram bot. None of that may regress. You are adding a *new, isolated* feature next to it.

---

## PART 0 — HARD RULES (READ AND OBEY)

1. **Additive only.** You may create new files freely. You may edit existing files **only** at the four anchor points listed in PART 8. No other existing file may be touched. Not even for "small cleanups". Not for formatting. Not for renaming. If you find a bug in existing code, write it down in `PREDICTION_MARKETS_NOTES.md` at repo root and move on.

2. **Match existing conventions, do not invent new ones.** SimFi has well-established patterns for pricing, math, validation, auth, rate limiting, and data flow. Your job is to reuse them, not improve on them. If you find yourself inventing a new pattern, stop and use the existing one.

3. **No new top-level dependencies unless explicitly listed in PART 4.** SimFi already has every primitive you need (Express, Drizzle, Zod, TanStack Query, wouter, shadcn/ui, Recharts, bcrypt, jsonwebtoken). Add only `ws` (the Node WebSocket client library) — and only if it isn't already in `package.json`. Check first.

4. **Server-authoritative everything.** Just like the existing trade engine, the client must NEVER send prices, slippage values, or fill amounts. The client sends `{ conditionId, outcome: "YES"|"NO", side: "BUY"|"SELL", shares?, notionalUsd? }` plus the quote ID it received from the server. Everything else is computed server-side from real Polymarket order books.

5. **Polymarket integration is read-only.** No wallets, no private keys, no signed orders, no on-chain activity, no USDC allowances, no API key registration. SimFi mirrors Polymarket's public market data; the paper-trade fills happen entirely inside SimFi's database.

6. **No placeholders.** Do not write `// TODO`, `throw new Error("not implemented")`, `return null`, mock responses, or stubs. Every function must do the real thing using real Polymarket endpoints and the real SimFi infrastructure described below.

7. **All money math uses bigint and atomic units.** Mirror SimFi's `bigNumeric` pattern. See PART 4. No floats touch a balance, position size, or fill amount on the write path. Display formatting is the only place floats are allowed, and even then through `client/src/lib/format.ts`.

8. **Existing routes, schemas, services, and components are off-limits.** That includes `server/routes.ts`, `shared/schema.ts`, `server/services/quoteService.ts`, `server/services/marketData.ts`, `client/src/components/TradeModal.tsx`, `client/src/components/Navigation.tsx` (except the one anchor point), and so on.

---

## PART 1 — DISCOVERY PHASE (DO THIS BEFORE WRITING ANY CODE)

Open these files in this order and read them. Do not skim. After this phase, write a short summary as `PREDICTION_MARKETS_DISCOVERY.md` at repo root containing the answers to every question below. Only proceed to PART 2 once the file exists and every question is answered.

### 1.1 Files to read

```
package.json
tsconfig.json
drizzle.config.ts (or wherever drizzle is configured)
shared/schema.ts
server/index.ts
server/routes.ts                 (you may scan, do not memorize)
server/services/marketRoutes.ts  (this is the pattern you will mirror)
server/services/quoteService.ts
server/services/jupiterService.ts (study the circuit breaker / coalescing pattern)
server/services/marketData.ts
server/services/ssePriceFeed.ts
server/services/portfolioAnalytics.ts
server/services/achievementEngine.ts
server/middleware/* (auth middleware, rate limiters, CSRF)
client/src/App.tsx (or wherever wouter routes are declared)
client/src/components/Navigation.tsx
client/src/components/TradeModal.tsx
client/src/components/TokenChart.tsx
client/src/lib/format.ts
client/src/lib/token-format.ts
client/src/contexts/AuthProvider.tsx
client/src/contexts/PriceProvider.tsx
client/src/contexts/ChainProvider.tsx
client/src/pages/TradePage.tsx
client/src/pages/TokenPage.tsx
migrations/ (look at the latest migration filename to know what number yours will be)
render.yaml (deployment surface — do not edit, just understand)
```

### 1.2 Questions to answer in `PREDICTION_MARKETS_DISCOVERY.md`

Each answer must reference the file and line(s) you found it in.

1. **Drizzle schema layout.** Is `shared/schema.ts` a single file or a folder? Where exactly is the `bigNumeric` custom type defined? Does the project export schemas table-by-table, or as a single barrel?
2. **Drizzle migration command.** What command produces a new migration (`drizzle-kit generate`? `npx drizzle-kit generate:pg`?)? What is the latest migration filename in `migrations/`?
3. **Route registration.** In `server/index.ts` (or wherever the Express app is composed), find the exact line where `marketRoutes` are registered. Quote the surrounding 5 lines. This is anchor point #1.
4. **Auth middleware.** What is the exact import path and function name for the JWT-verifying middleware that protects authenticated routes? Same question for the CSRF-checking middleware. Same question for the idempotency-key middleware (if it lives in middleware) or the helper used inside the route (if inline).
5. **Rate limiters.** Where are `userTradeLimiter`, `publicApiLimiter`, etc. defined and exported from?
6. **Quote service contract.** Read `server/services/quoteService.ts`. What is its public API (function names, argument shapes, return shapes)? You will mirror this contract for `predictionQuoteService.ts` — not import from it.
7. **SSE service contract.** Read `server/services/ssePriceFeed.ts`. Does it expose a public broadcaster instance you can extend for additional channels, or is it self-contained? Decide: do you (a) add a new SSE endpoint at `/api/sse/prediction-prices` with its own broadcaster, or (b) extend the existing one? **Default answer is (a)** unless extending it requires zero changes to the existing file.
8. **Frontend route registration.** In `client/src/App.tsx` (or equivalent), quote the wouter route block where `<Route path="/trade" .../>` is declared. This is anchor point #3.
9. **Navigation links.** In `client/src/components/Navigation.tsx`, find where the "Trade" / "Leaderboard" links are rendered. Quote the surrounding JSX. This is anchor point #4.
10. **Mobile nav.** Same question for `client/src/components/MobileNav.tsx`. (May or may not be touched depending on whether you're adding to the bottom tab bar — see PART 7.)
11. **Format module.** What functions does `client/src/lib/format.ts` export? Specifically: is there a USD formatter? A percent formatter? You will use these — not write your own.
12. **Existing `chain` enum.** Confirm the values are exactly `'solana' | 'base'`. Confirm prediction-market data does **not** use this enum (it gets its own column or its own table — your call, see PART 4).
13. **Idempotency cache.** How is the 5-minute idempotency cache implemented (in-memory Map? Redis-backed?)? Can your prediction-market trade route reuse the same cache, or do you need a parallel one?
14. **TanStack Query client.** Where is the `QueryClient` instantiated and what defaults does it use (staleTime, retry, etc.)? Your new queries will inherit these.
15. **TypeScript config.** Is the project NodeNext or Bundler? Does it use `.js` extensions in TypeScript imports (the codebase summary says ESM)? Match exactly.
16. **Existing `ws` dependency.** Is `ws` already in `package.json`? If yes, what version? You will reuse it.

### 1.3 Discovery output

`PREDICTION_MARKETS_DISCOVERY.md` must include:

- The exact line numbers / file paths for the four anchor points (PART 8).
- The exact migration filename you will create (e.g. `migrations/0014_prediction_markets.sql`).
- The exact decision on SSE option (a) or (b) and your one-line justification.
- Confirmation that no existing tests fail after running `npm run typecheck` (or whatever the project command is) before you write a single line of new code.

**Stop. Do not proceed past PART 1 until the discovery document is written.**

---

## PART 2 — ARCHITECTURE (NON-NEGOTIABLE)

```
┌──────────────────────────────────────────────────────────────────────┐
│  Client (existing React + Vite app)                                  │
│  ─ NEW routes: /predictions, /predictions/:slug, /predictions/me     │
│  ─ NEW pages, NEW components, NEW TanStack queries                   │
│  ─ NEW context: PredictionPricesProvider (subscribes to new SSE)     │
│  ─ Reuses: AuthProvider, format.ts, shadcn primitives, existing API  │
│    client utility (the same one that calls /api/trades/buy)          │
└────────────────┬─────────────────────────────────────────────────────┘
                 │ HTTPS (REST + new SSE channel)
┌────────────────▼─────────────────────────────────────────────────────┐
│  Server (existing Express app)                                       │
│  ─ NEW routes file: server/services/predictionMarketRoutes.ts        │
│      mirrors marketRoutes.ts pattern; registered ONCE in index.ts    │
│  ─ NEW services (server/services/prediction/*):                      │
│      ─ polymarketGamma.ts   (HTTP: market discovery, no auth)        │
│      ─ polymarketClob.ts    (HTTP: book, midpoint, price history)    │
│      ─ polymarketWs.ts      (WS market channel, server-side only)    │
│      ─ predictionQuoteService.ts                                     │
│      ─ predictionExecution.ts                                        │
│      ─ predictionSettler.ts (cron loop: resolves closed markets)     │
│      ─ predictionSseFeed.ts (NEW SSE broadcaster, isolated)          │
│  ─ Reuses: existing auth middleware, CSRF, rate limiter primitives,  │
│            BigInt math helpers, Zod, Drizzle db client               │
└────────────────┬─────────────────────────────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────────────────────────────┐
│  PostgreSQL (existing Neon database)                                 │
│  ─ NEW tables (one new migration file):                              │
│      prediction_markets                                              │
│      prediction_paper_balances                                       │
│      prediction_positions                                            │
│      prediction_trades                                               │
│  ─ Existing tables: UNTOUCHED                                        │
└──────────────────────────────────────────────────────────────────────┘

                 ┌─────────────────────────────────────┐
                 │  Polymarket public services         │
                 │  ─ gamma-api.polymarket.com (REST)  │
                 │  ─ clob.polymarket.com (REST)       │
                 │  ─ ws-subscriptions-clob.polymarket │
                 │       .com/ws/market (WSS)          │
                 │  ─ All three: NO authentication     │
                 └─────────────────────────────────────┘
```

### 2.1 Why isolated tables and not the existing `positions` / `trade_history` tables

Memecoin paper trades and prediction-market paper trades have incompatible semantics:

| Aspect | Memecoin (existing) | Prediction (new) |
|---|---|---|
| Asset identifier | `tokenAddress` (Solana base58 / EVM hex) | `(conditionId, tokenId)` — Polymarket-specific |
| Settlement currency | SOL (lamports) or ETH (wei) | USD-denominated paper balance |
| Price domain | Free float, USD price | Bounded $0.00–$1.00 probability |
| Resolution | Continuous (sell anytime) | Binary terminal payout: $1 or $0 at expiry |
| Chain dimension | `chain` ∈ {solana, base} | None — Polymarket lives on Polygon, but we don't expose that |
| Decimals | Token decimals vary | Fixed: 6 (USDC convention) |

Forcing these into shared tables would require nullable columns, polymorphic IDs, and special-case branches throughout the existing trade engine. That violates "additive only". New tables, full stop.

### 2.2 Why server-side WebSocket → server-side SSE relay

SimFi clients consume real-time prices via SSE. Polymarket exposes its real-time market channel via WebSocket. The Node server is the only place where both protocols meet. Architecture:

```
Polymarket WSS  ──►  polymarketWs.ts (in-memory book mirror, best bid/ask)
                          │
                          ▼
                 predictionSseFeed.ts (broadcaster) ──► /api/sse/prediction-prices ──► clients
```

The client never talks to Polymarket. Same shape as how the existing memecoin SSE feed works — clients only ever talk to SimFi.

---

## PART 3 — POLYMARKET API CONTRACT (USE EXACT ENDPOINTS)

These endpoints are public, require zero authentication, and are the *only* Polymarket surface you will integrate. Do not call any other Polymarket endpoint. Do not invent endpoints. If something seems missing, ask in `PREDICTION_MARKETS_NOTES.md` and pick the closest documented one.

### 3.1 Gamma API (market discovery, metadata, resolution status)

Base URL: `https://gamma-api.polymarket.com`

| Endpoint | Purpose | Key query params |
|---|---|---|
| `GET /markets` | List markets | `limit`, `offset`, `active`, `closed`, `archived`, `order`, `ascending`, `slug`, `condition_ids`, `tag_id` |
| `GET /events` | List events (a market is one outcome of an event) | same shape |

**Response gotchas (these are real, do not skip):**

- `clobTokenIds` is returned as a **stringified JSON array**, e.g. `"[\"123456...\", \"789012...\"]"`. Always `JSON.parse` it before use.
- `outcomePrices` is also returned as a stringified JSON array of stringified numbers, e.g. `"[\"0.42\", \"0.58\"]"`. Parse, then `Number()` each entry.
- `outcomes` is a normal JSON array of strings, usually `["Yes", "No"]`.
- For binary markets the convention is **first element = YES, second element = NO**. Use this throughout.
- `endDate` may be `null` for non-time-bound markets.
- `closed: true` means trading is halted. `archived: true` means hidden from default lists.
- Resolution: a closed market has its resolution reflected in `outcomePrices` — the winning outcome's price is `1.0`, the loser is `0.0`. Use this as the resolution oracle in the settler. `winnerOutcome` may also be present but is not always set; fall back to `outcomePrices`.

### 3.2 CLOB API (public read endpoints — no auth)

Base URL: `https://clob.polymarket.com`

| Endpoint | Purpose |
|---|---|
| `GET /midpoint?token_id=<id>` | Returns `{ "mid": "0.42" }` |
| `GET /price?token_id=<id>&side=BUY|SELL` | Returns `{ "price": "0.43" }` |
| `GET /book?token_id=<id>` | Full order book — see shape below |
| `GET /prices-history?market=<token_id>&interval=1h\|6h\|1d\|1w\|1m\|max` | Historical price series |

**Order book response shape:**

```json
{
  "market": "0x...",
  "asset_id": "12345...",
  "bids": [{ "price": "0.41", "size": "120.0" }, ...],
  "asks": [{ "price": "0.43", "size": "200.0" }, ...],
  "timestamp": "1717530000000",
  "hash": "..."
}
```

Bids and asks are returned as arrays of `{ price: string, size: string }`. Coerce to numbers at the boundary. Polymarket sometimes returns bids ascending and asks descending; **always re-sort** in your client (`bids` descending — best/highest first; `asks` ascending — best/lowest first). Never trust ordering.

**Rate limits:** Polymarket throttles public endpoints around 100 req/min per IP. Add a token-bucket limiter inside `polymarketGamma.ts` and `polymarketClob.ts` (50 req/min each, leaving headroom). On 429, exponential backoff with jitter. Do NOT call CLOB or Gamma from inside a hot trade path more than once per trade — the order book fetched at quote time is reused at execution time.

### 3.3 WebSocket market channel

URL: `wss://ws-subscriptions-clob.polymarket.com/ws/market`

**Subscribe payload (send on `open`):**
```json
{
  "assets_ids": ["<token_id_1>", "<token_id_2>"],
  "type": "market"
}
```

**Event types you must handle:**

| `event_type` | Action |
|---|---|
| `book` | Full snapshot for one asset. Replace your in-memory book for that asset. |
| `price_change` | Delta updates: `{ price, side: "BUY"|"SELL", size }`. `size === 0` means delete the level. |
| `tick_size_change` | Informational; log and ignore. |
| `last_trade_price` | Optional; surface in UI if present. |

**Heartbeat:** send `"PING"` every 30s. Ignore inbound `"PONG"` frames. If no message received in 60s, force-reconnect.

**Reconnect:** on any close that isn't intentional shutdown, exponential backoff starting at 1s, capped at 30s. On reconnect, resubscribe the full asset set.

**Subscription budget:** 200 assets per connection (Polymarket allows up to 500; be conservative). The settler decides which markets are "active" and which are "watched"; only `watched` (= currently open in any user portfolio + currently displayed on the market list) are subscribed to. Resync the subscription set every 30 seconds.

### 3.4 Footguns to avoid

- Do not call `/book` on every tick — the WS feed is the streaming source. Only call `/book` (a) at quote creation time and (b) at fill time.
- Do not store live prices on disk — they go in `predictionSseFeed.ts` in-memory state and get pushed to clients.
- Do not assume `outcomePrices.length === 2`. Some Polymarket events have 3+ outcomes (multi-choice). Filter the market list to only those with exactly 2 `clobTokenIds` for v1.
- Do not assume timestamps are seconds vs ms. Gamma uses ISO 8601 strings. CLOB book timestamps are ms-as-string. WebSocket events use ms.

---

## PART 4 — DATA MODEL ADDITIONS (NEW MIGRATION ONLY)

Create exactly one new migration file. The filename uses the next available number (you found it in discovery, e.g. `0014_prediction_markets.sql`). Drizzle table definitions go in a **new file**: `shared/predictionSchema.ts`. Re-export from this new file is anchor point #2 (see PART 8).

### 4.1 Conventions to mirror from existing schema

- Use the existing `bigNumeric` custom type (`numeric(38, 0)` ↔ TS bigint) for all atomic-unit columns.
- Use `numeric(38, 18)` for all $0.00–$1.00 prices, matching the existing `entryPrice` column on `positions`.
- Timestamps: `timestamp("created_at", { withTimezone: false }).defaultNow().notNull()` (or whichever Drizzle helper the existing schema uses — match exactly).
- Primary keys: `text("id").primaryKey().$defaultFn(() => createId())` if the existing schema uses `cuid`; otherwise mirror what's there.
- Foreign keys: cascade-delete from `users` (matches the existing `positions` table's behavior).

### 4.2 Atomic-unit conventions for prediction markets

- **Shares:** stored as `numeric(38, 0)` representing **micro-shares**. 1 share = 1,000,000 micro-shares.
- **USD amounts:** stored as `numeric(38, 0)` representing **micro-USD** (matches USDC's 6-decimal native precision). 1 USD = 1,000,000 micro-USD.
- **Prices:** stored as `numeric(38, 18)`. Always between `0.000000000000000000` and `1.000000000000000000`.

This matches SimFi's "atomic units in the DB, decimal display in the UI" pattern. Do not deviate.

### 4.3 Tables (Drizzle definitions)

```typescript
// shared/predictionSchema.ts
import {
  pgTable, text, timestamp, boolean, integer, uniqueIndex, index,
  numeric,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./schema"; // existing
import { bigNumeric } from "./schema"; // existing custom type
// NOTE: import paths must match what the discovery doc found.

export const predictionMarkets = pgTable("prediction_markets", {
  conditionId: text("condition_id").primaryKey(),
  slug: text("slug").notNull().unique(),
  question: text("question").notNull(),
  description: text("description").notNull().default(""),
  endDate: timestamp("end_date", { withTimezone: false }),
  closed: boolean("closed").notNull().default(false),
  active: boolean("active").notNull().default(true),
  archived: boolean("archived").notNull().default(false),
  yesTokenId: text("yes_token_id").notNull(),
  noTokenId: text("no_token_id").notNull(),
  // null while open; "YES" | "NO" | "VOID" once resolved
  winningOutcome: text("winning_outcome"),
  // Last time the settler synced metadata from Gamma
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: false })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: false }).notNull().defaultNow(),
}, (t) => ({
  byActiveClosed: index("idx_prediction_markets_active_closed").on(t.active, t.closed),
  byEndDate: index("idx_prediction_markets_end_date").on(t.endDate),
  byYesToken: uniqueIndex("uniq_prediction_markets_yes_token").on(t.yesTokenId),
  byNoToken: uniqueIndex("uniq_prediction_markets_no_token").on(t.noTokenId),
}));

export const predictionPaperBalances = pgTable("prediction_paper_balances", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // micro-USD; default 10,000.00 USD = 10,000,000,000 micro-USD
  balanceMicroUsd: bigNumeric("balance_micro_usd").notNull(),
  realizedPnlMicroUsd: bigNumeric("realized_pnl_micro_usd").notNull().default(sql`0`),
  createdAt: timestamp("created_at", { withTimezone: false }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: false }).notNull().defaultNow(),
});

export const predictionPositions = pgTable("prediction_positions", {
  id: text("id").primaryKey().$defaultFn(() => /* match existing id helper */ ""),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conditionId: text("condition_id").notNull().references(() => predictionMarkets.conditionId, { onDelete: "cascade" }),
  tokenId: text("token_id").notNull(),
  outcome: text("outcome").notNull(), // "YES" | "NO"
  // micro-shares
  sharesMicro: bigNumeric("shares_micro").notNull(),
  // weighted avg cost per share, $0..$1
  avgPrice: numeric("avg_price", { precision: 38, scale: 18 }).notNull(),
  // micro-USD lifetime cost basis, useful for partial-sell PnL math
  costBasisMicroUsd: bigNumeric("cost_basis_micro_usd").notNull(),
  realizedPnlMicroUsd: bigNumeric("realized_pnl_micro_usd").notNull().default(sql`0`),
  // null until settlement
  resolutionState: text("resolution_state"), // "WIN" | "LOSS" | "VOID"
  settledAt: timestamp("settled_at", { withTimezone: false }),
  createdAt: timestamp("created_at", { withTimezone: false }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: false }).notNull().defaultNow(),
}, (t) => ({
  byUserToken: uniqueIndex("uniq_prediction_pos_user_token").on(t.userId, t.tokenId),
  byUser: index("idx_prediction_pos_user").on(t.userId),
  byCondition: index("idx_prediction_pos_condition").on(t.conditionId),
}));

export const predictionTrades = pgTable("prediction_trades", {
  id: text("id").primaryKey().$defaultFn(() => /* match existing id helper */ ""),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conditionId: text("condition_id").notNull(),
  tokenId: text("token_id").notNull(),
  outcome: text("outcome").notNull(),     // "YES" | "NO"
  side: text("side").notNull(),           // "BUY" | "SELL"
  sharesMicro: bigNumeric("shares_micro").notNull(),
  avgPrice: numeric("avg_price", { precision: 38, scale: 18 }).notNull(),
  // slippage vs midpoint at quote-creation time, in basis points (100 = 1c)
  slippageBps: integer("slippage_bps").notNull().default(0),
  feeMicroUsd: bigNumeric("fee_micro_usd").notNull().default(sql`0`),
  totalMicroUsd: bigNumeric("total_micro_usd").notNull(),
  // JSON snapshot of the book levels consumed. Stored as text for portability.
  bookSnapshot: text("book_snapshot").notNull(),
  // For idempotency-key audit trail
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at", { withTimezone: false }).notNull().defaultNow(),
}, (t) => ({
  byUserCreated: index("idx_prediction_trades_user_created").on(t.userId, t.createdAt),
  byCondition: index("idx_prediction_trades_condition").on(t.conditionId),
  // Idempotency uniqueness when key is present (partial unique via filtered index)
  byUserIdempotency: uniqueIndex("uniq_prediction_trades_user_idempotency")
    .on(t.userId, t.idempotencyKey)
    .where(sql`${t.idempotencyKey} IS NOT NULL`),
}));
```

### 4.4 Migration file

Generate the SQL migration via the project's existing Drizzle command. The discovery doc identified that command. The filename is the next number, e.g. `0014_prediction_markets.sql`. **Do not write the SQL by hand.** Run the generator. Commit both the `.sql` file and any `_journal.json` / `_meta` updates Drizzle produces.

### 4.5 Default starting balance

When a user first hits any authenticated prediction-market endpoint, lazily upsert a row in `prediction_paper_balances` with `balanceMicroUsd = 10_000n * 1_000_000n` (10,000.00 paper USD). Do this in a single SQL `INSERT ... ON CONFLICT DO NOTHING` to keep it race-safe. Make the starting amount overridable via a new env var `PREDICTION_STARTING_BALANCE_USD` (default `10000`).

---

## PART 5 — BACKEND SERVICES (NEW FILES ONLY)

Create the directory `server/services/prediction/`. Every service in this section lives there. None of them imports from `marketRoutes.ts`, `quoteService.ts`, `marketData.ts`, or any existing trading service — they only import from the **same primitives** those files use (Drizzle `db` client, Zod, the `bigNumeric` helpers, the auth middleware barrel, etc.).

### 5.1 `server/services/prediction/polymarketGamma.ts`

Responsibilities:
- `listMarkets(params)`: GET `/markets`, normalize stringified arrays, filter to binary markets only (`clobTokenIds.length === 2`), return typed array.
- `getMarketBySlug(slug)`: single market lookup.
- `getMarketByConditionId(conditionId)`: single market lookup.
- Internal token-bucket limiter (50 req/min). On 429, retry with backoff up to 3 times, then throw.
- Circuit breaker pattern matching `jupiterService.ts` (study it in discovery and mirror).
- Request coalescing: concurrent calls with identical params share one upstream promise. Match the existing pattern in `marketData.ts`.
- 8s timeout via `AbortController`.

Type definitions for `GammaMarket` should include exactly the fields used downstream: `conditionId`, `slug`, `question`, `description`, `endDate`, `closed`, `active`, `archived`, `outcomes`, `outcomePrices`, `clobTokenIds`, `volume`, `volume24hr`, `liquidity`. No more, no less.

### 5.2 `server/services/prediction/polymarketClob.ts`

Responsibilities:
- `getMidpoint(tokenId)`, `getPrice(tokenId, side)`, `getOrderBook(tokenId)`, `getPriceHistory(tokenId, opts)`.
- Same limiter / circuit breaker / coalescing pattern.
- `getOrderBook` always re-sorts: bids descending, asks ascending. Always coerces price/size to `number`.
- Returns typed `OrderBook` and `BookLevel` interfaces.

### 5.3 `server/services/prediction/polymarketWs.ts`

Single class `PolymarketWsClient`:
- Constructor takes WS URL (env-driven).
- `start()`, `stop()`, `subscribe(tokenIds)`, `unsubscribe(tokenIds)` (latter is best-effort: it removes from the local set; full unsub requires reconnect because the Polymarket protocol doesn't expose granular unsub on the market channel).
- `onTick(listener)`: returns an unsubscribe function. Listener receives `{ tokenId, bestBid, bestAsk, midpoint, receivedAt }`.
- `getLatest(tokenId)`: synchronous accessor for the most recent tick (used by the SSE feed for join-time replay to new clients).
- Internal in-memory book mirror per asset (Map of price → size). On `book` event: replace. On `price_change`: mutate. After every mutation, recompute best bid / best ask / midpoint and emit one tick.
- Heartbeat: PING every 30s. Watchdog: if no message for 60s, force-reconnect.
- Reconnect: exponential backoff 1s → 30s. On reconnect, resubscribe the full set.
- Single shared singleton exported as `polymarketWs`.

### 5.4 `server/services/prediction/predictionExecution.ts`

Pure (no HTTP) module exporting:

- `walkBook(book, side, sharesMicro)`: returns `{ avgPrice, consumedMicro }` or throws `InsufficientLiquidityError` when the book lacks depth. BUY walks asks ascending; SELL walks bids descending. Math is in **micro-shares** to keep bigint discipline.
- `walkBookByNotional(book, side, notionalMicroUsd)`: BUY-only. Walks asks until budget exhausted or book empty. Returns `{ avgPrice, sharesMicro }`. Used when the user enters a USD amount instead of share count.
- Slippage helpers that compute basis points vs the midpoint at quote-creation time.

This module never touches the database directly. It is consumed by `predictionQuoteService` and the trade route.

### 5.5 `server/services/prediction/predictionQuoteService.ts`

Mirror the public surface of `server/services/quoteService.ts` (function names + return shapes), but specialized for binary markets. Required exports:

- `createQuote({ userId, conditionId, outcome, side, sharesMicro?, notionalMicroUsd? })`:
  1. Resolve token id from `prediction_markets` cache (if missing, fetch from Gamma and upsert).
  2. Reject if market is `closed === true`.
  3. Fetch fresh order book via `polymarketClob.getOrderBook(tokenId)`.
  4. Compute fill via `walkBook` or `walkBookByNotional`.
  5. Stash quote in in-memory Map: `quoteId → { all of the above + bookSnapshot + expiresAt }`.
  6. Return `{ quoteId, sharesMicro, avgPrice, slippageBps, totalMicroUsd, expiresAt }`.
  7. **TTL: 10 seconds** (matches existing quote service exactly).
- `consumeQuote(quoteId, userId)`: returns the quote and deletes it. Throws if expired, missing, or owned by a different user.
- Background sweep every 30s evicts expired quotes.

### 5.6 `server/services/prediction/predictionExecutionTx.ts`

Single exported function `executeTrade({ userId, quote, idempotencyKey })`:

```
BEGIN;
  -- (1) idempotency
  IF idempotencyKey is set and a row already exists in prediction_trades
       with (user_id = userId, idempotency_key = idempotencyKey)
     THEN return that existing trade (replay-safe).

  -- (2) lock balance
  SELECT * FROM prediction_paper_balances
     WHERE user_id = $userId FOR UPDATE;
  -- if no row, INSERT default starting balance and re-select.

  -- (3) lock position (if exists)
  SELECT * FROM prediction_positions
     WHERE user_id = $userId AND token_id = $tokenId FOR UPDATE;

  -- (4) check guards
  --     BUY:  balance >= totalMicroUsd
  --     SELL: existing position exists, sharesMicro >= sellSharesMicro
  --     Reject otherwise (no negative shares, no oversell)

  -- (5) apply state changes
  --     BUY:
  --       balance -= totalMicroUsd
  --       upsert position:
  --         shares += sharesMicro
  --         costBasis += totalMicroUsd
  --         avgPrice = costBasisMicroUsd / sharesMicro / 1e18 scaling
  --     SELL:
  --       proceedsMicroUsd = sum of (level.size * level.price * 1e6) walked
  --       proportional cost = (sellShares / posShares) * costBasis
  --       realizedPnl += proceedsMicroUsd - proportionalCost
  --       balance += proceedsMicroUsd
  --       position.shares -= sellShares
  --       position.costBasis -= proportionalCost
  --       if position.shares == 0: delete row

  -- (6) insert prediction_trades row with bookSnapshot
COMMIT;
```

This function is the only place that mutates `prediction_paper_balances` or `prediction_positions`. Use Drizzle's transaction helper. Use `SELECT ... FOR UPDATE` exactly the way the existing buy/sell handlers do.

### 5.7 `server/services/prediction/predictionSettler.ts`

A long-running loop (started from `server/index.ts` — see PART 8). Every `SETTLE_INTERVAL_SECONDS` (env, default 60):

1. Sync the watch-list: fetch active markets where any user holds a position OR which are listed in the active-markets cache (paginate Gamma `/markets?closed=false&limit=200`). Upsert them into `prediction_markets`.
2. For markets currently `closed = false` in the DB whose Gamma payload now says `closed = true`:
   - Determine winner from `outcomePrices`: index 0 (YES) at 1.0 → YES wins; index 1 (NO) at 1.0 → NO wins; both at ~0.5 or both at 0 → VOID.
   - Update `prediction_markets`: `closed = true`, `winningOutcome = "YES" | "NO" | "VOID"`.
   - Settle every open position on either of this market's two token IDs in a single transaction:
     - WIN: credit `sharesMicro * 1_000_000n` micro-USD to balance, mark position `resolutionState = "WIN"`, set `realizedPnl += credit - costBasis`, then delete the position row (or keep for history — see decision below).
     - LOSS: credit `0`, mark `resolutionState = "LOSS"`, `realizedPnl -= costBasis`, delete row.
     - VOID: credit `costBasis` back (refund), mark `resolutionState = "VOID"`, `realizedPnl unchanged`, delete row.
   - All within `BEGIN`/`COMMIT` and with `FOR UPDATE` locks.
   - Log a settlement record in `prediction_trades` with `side = "SELL"` and a special outcome marker — **decision: do we keep settled positions in `prediction_positions` for history, or move them to a settled view?** Default: **delete from `prediction_positions` after settlement and let the user see their PnL history through `prediction_trades`** (matches how SimFi's existing system uses `trade_history`).

3. Update the WS subscription set: union of (active markets in any user's open positions) ∪ (top 100 active markets by 24h volume). Hand it to `polymarketWs.subscribe()`.

Use the existing PostgreSQL **advisory lock pattern** from the leaderboard service (`pg_try_advisory_lock`) so that if SimFi runs on multiple instances, only one runs the settler at a time. Pick a unique advisory-lock key (large constant) that does not collide with the leaderboard's lock key.

### 5.8 `server/services/prediction/predictionSseFeed.ts`

A standalone broadcaster mirroring `ssePriceFeed.ts`'s structure (study it in discovery; do not import from it):

- Maintains a Map<clientId, { res: Response, subscribedTokenIds: Set<string> }>.
- Limits: max 200 clients, max 50 token subscriptions per client.
- Endpoint paths it serves (from inside the routes file):
  - `GET /api/sse/prediction-prices` — opens an SSE stream. Sends initial snapshot for any token IDs in the query string `?ids=t1,t2,...`.
  - `POST /api/sse/prediction-prices/subscribe` — body `{ clientId, tokenIds: string[] }` — appends to the client's set; pushes initial snapshot.
  - `POST /api/sse/prediction-prices/unsubscribe` — body `{ clientId, tokenIds: string[] }` — removes from set.
- Emits events as `event: tick\ndata: {json}\n\n` lines. JSON shape: `{ tokenId, bestBid, bestAsk, midpoint, receivedAt }`.
- Sends a heartbeat comment every 15s (`: ping\n\n`).
- Wires `polymarketWs.onTick(listener)` once at module load to fan out ticks to all subscribed clients.

---

## PART 6 — BACKEND ROUTES (ONE NEW FILE)

Create `server/services/predictionMarketRoutes.ts`. Mirror the structure of the existing `server/services/marketRoutes.ts` exactly (study it first). Export a single function `registerPredictionMarketRoutes(app: Express)`.

### 6.1 Route table

| Method | Path | Auth | Rate limiter | Purpose |
|---|---|---|---|---|
| GET | `/api/predictions/markets` | none | `publicApiLimiter` | List active markets (cached) |
| GET | `/api/predictions/markets/:slug` | none | `publicApiLimiter` | Market detail |
| GET | `/api/predictions/markets/:tokenId/book` | none | `publicApiLimiter` | Live order book passthrough |
| GET | `/api/predictions/markets/:tokenId/history` | none | `publicApiLimiter` | Price history |
| POST | `/api/predictions/quote` | required | NEW `predictionTradeLimiter` (30/min) | Create a quote |
| POST | `/api/predictions/trade` | required + CSRF | NEW `predictionTradeLimiter` | Execute a paper trade |
| GET | `/api/predictions/me/balance` | required | `userTradeLimiter` | Get paper USD balance |
| GET | `/api/predictions/me/positions` | required | `userTradeLimiter` | List open positions |
| GET | `/api/predictions/me/trades` | required | `userTradeLimiter` | Trade history |
| GET | `/api/sse/prediction-prices` | none | none | SSE stream |
| POST | `/api/sse/prediction-prices/subscribe` | none | `publicApiLimiter` | Modify subscription |
| POST | `/api/sse/prediction-prices/unsubscribe` | none | `publicApiLimiter` | Modify subscription |

### 6.2 New rate limiter

Create the limiter inside `predictionMarketRoutes.ts` (not in the global limiter file — that would be an existing-file edit). Use the same library (`express-rate-limit` or whatever the project uses; discover this) and the same key generator. Default: 30 req/min per authenticated user, 60/min per IP for unauthenticated.

### 6.3 Request/response contracts (Zod schemas)

```typescript
// All new schemas live in server/services/prediction/schemas.ts

export const QuoteRequest = z.object({
  conditionId: z.string().min(1),
  outcome: z.enum(["YES", "NO"]),
  side: z.enum(["BUY", "SELL"]),
  shares: z.number().positive().finite().optional(),
  notionalUsd: z.number().positive().finite().optional(),
}).refine(
  (v) => (v.shares !== undefined) !== (v.notionalUsd !== undefined),
  { message: "Provide exactly one of shares or notionalUsd" },
).refine(
  (v) => v.side === "BUY" || v.shares !== undefined,
  { message: "SELL requires shares" },
);

export const TradeRequest = z.object({
  quoteId: z.string().min(1),
  idempotencyKey: z.string().min(1).max(128).optional(),
});
```

Quote response:
```typescript
{
  quoteId: string;
  conditionId: string;
  tokenId: string;
  outcome: "YES" | "NO";
  side: "BUY" | "SELL";
  shares: number;          // human-readable
  avgPrice: number;        // $0..$1
  slippageBps: number;
  totalUsd: number;
  expiresAt: string;       // ISO
}
```

Trade response:
```typescript
{
  tradeId: string;
  filledShares: number;
  avgPrice: number;
  slippageBps: number;
  totalUsd: number;
  newBalanceUsd: number;
  position: { shares: number; avgPrice: number } | null; // null if fully sold
}
```

### 6.4 Idempotency

Reuse the existing 5-minute idempotency cache if discovery showed it has a public re-export (PART 1 question 13). If it doesn't, add a parallel one inside `predictionExecutionTx.ts` with the same TTL (do not modify the existing one). Either way, the unique-index-with-`WHERE idempotency_key IS NOT NULL` on `prediction_trades` provides the durable backstop.

### 6.5 Error handling

Match the existing project's error-response shape exactly. Discover it. (Likely `{ error: { code, message } }` or `{ message }` — copy whatever the existing `/api/trades/buy` returns on failure.) Do not invent a new shape.

---

## PART 7 — FRONTEND (NEW FILES ONLY)

Create the following directory structure:

```
client/src/pages/predictions/
  PredictionMarketsPage.tsx       (route: /predictions)
  PredictionMarketDetailPage.tsx  (route: /predictions/:slug)
  PredictionPortfolioPage.tsx     (route: /predictions/me)

client/src/components/predictions/
  PredictionMarketCard.tsx
  PredictionTradeModal.tsx
  PredictionPriceChart.tsx
  PredictionPositionRow.tsx
  PredictionTradeHistoryRow.tsx
  PredictionBalanceBadge.tsx

client/src/contexts/
  PredictionPricesProvider.tsx    (NEW context, NEW SSE consumer)

client/src/hooks/
  usePredictionMarkets.ts         (TanStack Query)
  usePredictionMarket.ts
  usePredictionPositions.ts
  usePredictionTrades.ts
  usePredictionBalance.ts
  usePredictionQuote.ts           (mutation)
  usePredictionTrade.ts           (mutation, with idempotency key generation)

client/src/lib/
  predictionApi.ts                (fetch wrappers; reuse existing baseURL helper, do NOT duplicate it)
```

### 7.1 Conventions

- Reuse `client/src/lib/format.ts` for all USD/percent formatting. Do not write new formatters.
- Reuse the existing API client utility (the one used by `TradePage.tsx` to call `/api/trades/buy`). Find it in discovery, import it, do not re-implement fetch/CSRF/error handling.
- Reuse shadcn primitives (Card, Dialog, Button, etc.) exactly as `TradeModal.tsx` does. Same dark-theme tokens (`#0a0a0b` base, `#3fa876` gain, `#c24d4d` loss, `#c9a96e` premium).
- Charts: use Recharts (already a project dependency) for the binary YES/NO probability chart. A line chart with the YES price 0–100% on Y axis and time on X axis, with a horizontal 50% reference line, is enough for v1.
- All server state via TanStack Query. Match `staleTime`/`refetchInterval` to comparable existing queries in `useTrending` / `useTokenDetail`.
- Routing via wouter `<Route path="/predictions">`. Code-split via `React.lazy` matching the existing pattern in `App.tsx`.

### 7.2 PredictionPricesProvider (the SSE bridge)

A React context that:
- Connects to `/api/sse/prediction-prices` once on mount.
- Exposes `subscribe(tokenIds: string[])` and `unsubscribe(tokenIds: string[])` methods that POST to the corresponding endpoints.
- Maintains a `Map<tokenId, { bestBid, bestAsk, midpoint, receivedAt }>` and re-renders consumers when any subscribed price changes.
- Auto-reconnects on disconnect with 1s → 30s exponential backoff, falling back to polling `/api/predictions/markets/:tokenId/book` every 5s after 3 failures (matches the existing `PriceProvider` fallback pattern).

Mount the provider as low in the tree as possible — only `/predictions/*` pages need it. Wrap the Predictions page subtree, not the entire app.

### 7.3 PredictionTradeModal

Mirrors `TradeModal.tsx`'s layout but for binary markets:

- Header: market question, end date, current YES/NO probabilities.
- Side toggle: BUY YES / BUY NO / SELL YES / SELL NO (sells only enabled when the user holds shares of that outcome).
- Amount entry: toggle between "Shares" and "USD".
- Live preview: hits `POST /api/predictions/quote` on debounced input change (300ms). Shows `avgPrice`, `slippageBps`, `totalUsd`, `payoutIfWin`, `breakeven`, `maxLoss`. **Server-authoritative — no math in the modal.**
- Submit: generates an idempotency key (UUID v4), sends `POST /api/predictions/trade` with `{ quoteId, idempotencyKey }`. On success, closes modal + invalidates relevant TanStack queries (`positions`, `balance`, `trades`).
- Rejection paths: expired quote (re-fetch automatically), insufficient balance (show inline), insufficient liquidity (show inline with current best price).

### 7.4 What this v1 does NOT include (document in `PREDICTION_MARKETS_NOTES.md`)

- Limit orders. v1 is market orders only (FOK against the live book). Limit orders are a future hook.
- Multi-outcome (3+) markets. Filter to binary in the listing.
- Telegram bot integration.
- Alpha Desk prediction-market signals.
- Achievement badges for prediction trades.
- Leaderboard for prediction-market traders. (Use a separate `prediction_leaderboard_periods` table later — do NOT add prediction trades to existing `leaderboard_periods`.)

---

## PART 8 — WIRING (THE ONLY ALLOWED EDITS TO EXISTING FILES)

These are the **only four** edits to existing files permitted by this brief. Each is a pure addition (no replacements, no deletions). Each must be at the exact anchor point identified in discovery. If the surrounding code looks different from what's described, stop and update `PREDICTION_MARKETS_DISCOVERY.md` — do not improvise.

### Anchor #1: `server/index.ts` — register routes + start workers

After the existing `registerMarketRoutes(app)` (or equivalent) call, append:

```typescript
import { registerPredictionMarketRoutes } from "./services/predictionMarketRoutes.js";
import { polymarketWs } from "./services/prediction/polymarketWs.js";
import { startPredictionSettler } from "./services/prediction/predictionSettler.js";
import "./services/prediction/predictionSseFeed.js"; // side-effect: subscribes to ws ticks

registerPredictionMarketRoutes(app);
polymarketWs.start();
startPredictionSettler();
```

(Adjust `.js` extensions to match the project's actual import convention from discovery.)

In the existing `SIGTERM`/`SIGINT` graceful-shutdown block, append:

```typescript
polymarketWs.stop();
// startPredictionSettler returns a stop handle if you implement it that way; call it here.
```

These are the only two insertions in `server/index.ts`.

### Anchor #2: `shared/schema.ts` (or `shared/schema/index.ts`) — re-export new tables

Append at the very end of the file, after all existing exports:

```typescript
export * from "./predictionSchema";
```

(One line. Nothing else changes in this file.)

If the project uses a folder-of-schemas pattern, add `predictionSchema.ts` next to the existing files and update Drizzle's `schema:` glob in `drizzle.config.ts` only if necessary. Discovery determined this.

### Anchor #3: `client/src/App.tsx` — register wouter routes

Inside the existing `<Switch>` (or equivalent) block, append three new `<Route>` entries before the catch-all 404 route:

```tsx
<Route path="/predictions">
  <PredictionsLayout>
    <PredictionMarketsPage />
  </PredictionsLayout>
</Route>
<Route path="/predictions/me">
  <PredictionsLayout>
    <PredictionPortfolioPage />
  </PredictionsLayout>
</Route>
<Route path="/predictions/:slug">
  {(params) => (
    <PredictionsLayout>
      <PredictionMarketDetailPage slug={params.slug} />
    </PredictionsLayout>
  )}
</Route>
```

Add the three corresponding `React.lazy(() => import(...))` imports next to the existing lazy imports. `PredictionsLayout` is a tiny new component you create in `client/src/pages/predictions/PredictionsLayout.tsx` that wraps children in `<PredictionPricesProvider>`.

### Anchor #4: `client/src/components/Navigation.tsx` — add nav link

Inside the existing top-bar link cluster (next to "Trade" / "Leaderboard" / "Alpha Desk"), append a single `<Link>` entry:

```tsx
<Link href="/predictions" className={navLinkClassName(/* match existing */)}>
  Predictions
</Link>
```

Use whatever className helper / styling pattern the surrounding links use. Do not introduce new styles.

(Optional, if room exists: same one-line addition to `client/src/components/MobileNav.tsx`. If the bottom tab bar is already full, skip it and document in `PREDICTION_MARKETS_NOTES.md`.)

### That's all four

Anything else you feel tempted to edit in an existing file: don't. Open `PREDICTION_MARKETS_NOTES.md` and write down what you wanted to change and why. Move on.

---

## PART 9 — ENVIRONMENT VARIABLES (NEW ONLY)

Append (do not edit existing) to whichever env example file the project uses (`.env.example` if present — check first; if not, create `PREDICTION_MARKETS_ENV.example` at repo root and document it in `PREDICTION_MARKETS_NOTES.md`).

```
# Polymarket public endpoints (no auth required)
POLYMARKET_GAMMA_URL=https://gamma-api.polymarket.com
POLYMARKET_CLOB_URL=https://clob.polymarket.com
POLYMARKET_WS_URL=wss://ws-subscriptions-clob.polymarket.com/ws/market

# Paper trading defaults
PREDICTION_STARTING_BALANCE_USD=10000

# Settler cadence
PREDICTION_SETTLE_INTERVAL_SECONDS=60

# Optional: cap on WS subscription set
PREDICTION_WS_MAX_SUBSCRIPTIONS=200
```

Validate them with the same Zod env-validation pattern the project already uses (discover where; mirror).

---

## PART 10 — VERIFICATION CHECKLIST

After implementation, every box below must be checked. Paste the actual outputs into `PREDICTION_MARKETS_VERIFICATION.md`.

### 10.1 No-regression

```bash
# Type check (must show ZERO new errors vs the baseline 6 pre-existing ones)
npm run typecheck
# or: npx tsc --noEmit

# Existing tests (if any test command exists)
npm test
```

Expected: same number of pre-existing errors as before this work. No new failures.

### 10.2 Migration applies cleanly

```bash
# Generate (if not already)
npx drizzle-kit generate

# Apply against a fresh local DB
npx drizzle-kit push   # or whatever the project uses
```

Expected: four new tables created. No existing tables altered.

```sql
\dt prediction_*
-- expect: prediction_markets, prediction_paper_balances,
--         prediction_positions, prediction_trades
```

### 10.3 Server boots

```bash
npm run dev
```

Expected log lines (in addition to existing ones):
- `[polymarket-ws] connected`
- `[prediction-settler] starting interval=60s`
- `[prediction-sse] mounted at /api/sse/prediction-prices`

### 10.4 Public endpoints

```bash
# 1. Markets list
curl -s http://localhost:PORT/api/predictions/markets | jq '.[0] | {conditionId, slug, question, outcomes, outcomePrices}'

# Expected: a real Polymarket market with non-null fields and outcomePrices summing to ~1.0
```

```bash
# 2. Order book passthrough (replace TOKEN_ID with one from the markets list)
curl -s "http://localhost:PORT/api/predictions/markets/<TOKEN_ID>/book" | jq '{bids: .bids[:3], asks: .asks[:3]}'

# Expected: bids descending, asks ascending, prices ∈ (0, 1)
```

### 10.5 SSE

```bash
curl -N "http://localhost:PORT/api/sse/prediction-prices?ids=<TOKEN_ID>"
# Expected: every few seconds, `event: tick` lines with JSON containing bestBid/bestAsk/midpoint
```

### 10.6 End-to-end paper trade (smoke flow)

Using a real authenticated session (cookie from a logged-in test user):

```bash
# 1. Quote
curl -s -X POST http://localhost:PORT/api/predictions/quote \
  -H "Content-Type: application/json" \
  -H "Cookie: token=<JWT>; csrfToken=<CSRF>" \
  -H "X-CSRF-Token: <CSRF>" \
  -d '{"conditionId":"<COND>","outcome":"YES","side":"BUY","notionalUsd":50}' | jq

# Expected: { quoteId, sharesEstimated, avgPrice ∈ (0,1), totalUsd ≈ 50, expiresAt ~10s out }
```

```bash
# 2. Trade
QUOTE_ID="..."  IDEM="$(uuidgen)"
curl -s -X POST http://localhost:PORT/api/predictions/trade \
  -H "Content-Type: application/json" \
  -H "Cookie: token=<JWT>; csrfToken=<CSRF>" \
  -H "X-CSRF-Token: <CSRF>" \
  -d "{\"quoteId\":\"$QUOTE_ID\",\"idempotencyKey\":\"$IDEM\"}" | jq

# Expected: { tradeId, filledShares > 0, newBalanceUsd ≈ 9950, position: { shares, avgPrice } }
```

```bash
# 3. Idempotency replay (same key → same tradeId, balance unchanged)
curl -s -X POST .../trade -d "{\"quoteId\":\"$QUOTE_ID\",\"idempotencyKey\":\"$IDEM\"}" | jq

# Expected: same tradeId as step 2, balance still 9950 (NOT 9900)
```

```bash
# 4. Positions
curl -s http://localhost:PORT/api/predictions/me/positions -H "Cookie: token=..." | jq

# Expected: one row matching the trade
```

### 10.7 Settlement smoke (manual)

Pick a market that resolves within hours. After Polymarket marks it `closed: true`:

- Within `PREDICTION_SETTLE_INTERVAL_SECONDS`, the settler should:
  - Mark the row in `prediction_markets` as `closed = true, winningOutcome = "YES"|"NO"|"VOID"`.
  - Delete (or mark settled) every position on either of that market's two token IDs.
  - Credit balances appropriately: WIN → `shares * 1 USD`, LOSS → `0`, VOID → `costBasis` refund.
  - Insert a settlement row in `prediction_trades` with `side = "SELL"` and `avgPrice = 1.0 | 0.0 | costAvg`.

### 10.8 Existing-feature regression spot-checks

These existing flows must still work, untouched:

- Login / register
- Memecoin trade (buy SOL token, sell SOL token)
- Memecoin SSE prices (open Trade page, watch SOL price tick)
- Leaderboard page loads
- Alpha Desk page loads
- Telegram bot responds (if testing in dev with polling mode)
- Watchlist add/remove
- Portfolio analytics page

If any of these breaks, **stop and revert your last change**.

---

## PART 11 — ACCEPTANCE CRITERIA

Done means **every** item below is true:

- [ ] `PREDICTION_MARKETS_DISCOVERY.md` exists and answers all questions in PART 1.
- [ ] Exactly one new migration file added under `migrations/`.
- [ ] Four new tables exist in the database; zero existing tables altered.
- [ ] `shared/predictionSchema.ts` exists and is re-exported via the single line in `shared/schema.ts`.
- [ ] All new server services live under `server/services/prediction/` plus `server/services/predictionMarketRoutes.ts`.
- [ ] `server/index.ts` has exactly the additions described in Anchor #1 — nothing else changed.
- [ ] `client/src/App.tsx` has exactly the additions described in Anchor #3 — nothing else changed.
- [ ] `client/src/components/Navigation.tsx` has exactly the addition described in Anchor #4 — nothing else changed.
- [ ] `npm run typecheck` reports the same baseline error count as before (no new TS errors).
- [ ] All endpoints in PART 6.1 respond with the documented contracts.
- [ ] SSE feed emits at least one tick within 10 seconds of a client subscribing.
- [ ] Idempotency replay returns the same trade row.
- [ ] Settlement processes a closed market correctly (verified with a market that resolves during the test window OR a unit-style integration test that mocks the Gamma response — clearly noted as test-only).
- [ ] No existing route, page, or service has been modified.
- [ ] `PREDICTION_MARKETS_VERIFICATION.md` contains the actual outputs of every step in PART 10.

---

## APPENDIX A — REFERENCE PAYLOAD SHAPES (REAL POLYMARKET DATA)

### Gamma `/markets` (single market, fields you actually use)

```json
{
  "id": "12345",
  "conditionId": "0xabc...def",
  "questionId": "0x123...",
  "slug": "will-bitcoin-hit-200k-in-2026",
  "question": "Will Bitcoin hit $200,000 in 2026?",
  "description": "This market resolves YES if ...",
  "outcomes": "[\"Yes\", \"No\"]",
  "outcomePrices": "[\"0.31\", \"0.69\"]",
  "clobTokenIds": "[\"7245690...\", \"3892145...\"]",
  "endDate": "2026-12-31T23:59:59Z",
  "closed": false,
  "active": true,
  "archived": false,
  "volume": 1832914.42,
  "volume24hr": 28432.10,
  "liquidity": 124000.0
}
```

Note the three fields that are stringified arrays. Always parse.

### CLOB `/book` response

```json
{
  "market": "0xabc...def",
  "asset_id": "7245690...",
  "bids": [
    { "price": "0.30", "size": "1500.0" },
    { "price": "0.29", "size": "3200.0" }
  ],
  "asks": [
    { "price": "0.32", "size": "800.0" },
    { "price": "0.33", "size": "2100.0" }
  ],
  "timestamp": "1717530000000",
  "hash": "abc..."
}
```

### WS market-channel events

```json
[
  {
    "event_type": "book",
    "asset_id": "7245690...",
    "bids": [{"price":"0.30","size":"1500.0"}],
    "asks": [{"price":"0.32","size":"800.0"}],
    "timestamp": "1717530000000",
    "hash": "..."
  },
  {
    "event_type": "price_change",
    "asset_id": "7245690...",
    "changes": [
      {"price":"0.30","side":"BUY","size":"0"},
      {"price":"0.305","side":"BUY","size":"1200"}
    ],
    "timestamp": "1717530001234",
    "hash": "..."
  }
]
```

---

## APPENDIX B — KNOWN FOOTGUNS

1. **Stringified arrays from Gamma.** `clobTokenIds`, `outcomePrices`, sometimes `outcomes`. Always parse.
2. **Bid/ask sort order is unreliable.** Re-sort in your client.
3. **Polymarket multi-outcome markets.** Only handle binary (`clobTokenIds.length === 2`) in v1.
4. **Rate limits hit silently.** Polymarket returns 429; your circuit breaker must catch and back off.
5. **Order book depth can be thin on small markets.** `walkBook` must throw `InsufficientLiquidityError` cleanly; the route must surface this as a 400 with a useful message.
6. **WebSocket `tick_size_change` events** can come through; just log and ignore. They mean the minimum price increment changed and aren't relevant to paper trades.
7. **Settler must be re-entrant.** It can be killed mid-loop by a deploy. Use idempotent SQL — every UPDATE must be conditional (`WHERE closed = false` etc.).
8. **Atomic-unit math.** When converting `notionalUsd` (number, e.g. `50.0`) to `notionalMicroUsd` (bigint, e.g. `50_000_000n`), use `BigInt(Math.round(notionalUsd * 1_000_000))`. Never `BigInt(notionalUsd * 1e6)` — that loses precision on fractional cents.
9. **Float boundary for shares.** Shares often come out fractional from a notional-USD walk. Round micro-shares **down** when crediting a position (favor the house, never over-credit a paper user).
10. **Quote replay across users.** A quote is bound to a `userId`. Reject `consumeQuote` if `quote.userId !== currentUser.id`. This prevents a malicious client from sniping another user's quote.
11. **Existing JWT cookie path is `/api`.** All new endpoints under `/api/predictions/*` and `/api/sse/prediction-prices` are covered automatically. Verify in discovery.
12. **CSP headers.** The existing CSP allows specific origins. Polymarket WSS only runs server-side, so no CSP changes are needed. The new SSE endpoint is same-origin, also covered.

---

## END OF BRIEF

Implement phase-by-phase. After PART 1 (discovery), commit. After PART 4 (migration), commit. After PART 5 (services), commit. After PART 6 (routes), commit. After PART 7 (frontend), commit. After PART 8 (wiring), commit. After PART 10 (verification), commit. Each commit message: `feat(predictions): <phase name>`.

If at any point you find that an instruction in this brief conflicts with a fact you discovered in PART 1, the discovered fact wins. Update `PREDICTION_MARKETS_NOTES.md` with the conflict and your resolution, then proceed.

Do not invent. Do not break existing code. Do not skip discovery.
