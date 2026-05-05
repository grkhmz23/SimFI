# Kimi Code Implementation Brief — SimFi Sportsbook (Paper, Virtual Balances)

You are extending SimFi with a new **Sportsbook** module that mirrors the existing **Prediction Markets** module. Everything is paper — no real money, no smart contracts, no on-chain custody. Users stake their virtual balances (vSOL, vETH, vUSDC) on real sports events using real bookmaker odds, and bets settle automatically against real-world game results.

This brief defines **WHAT**. The existing prediction-market code defines **HOW**. If they conflict, follow the existing code.

---

## 0. MANDATORY PRE-READ — DO THIS FIRST

Before writing any code, read these files in order. Do not skip.

1. `apps/web/src/modules/predictions/**` (or equivalent path) — entire prediction market frontend module
2. `apps/api/**/predictions/**` or `apps/web/src/app/api/predictions/**` — prediction backend routes
3. The cron/worker layout — search for `workers/`, `jobs/`, `cron/`, or look in `package.json` scripts
4. DB schema file — `prisma/schema.prisma`, `drizzle/schema.ts`, or `db/schema.ts`
5. The virtual-balance code — search for `balance`, `wallet`, `treasury`, `vBalance`. This is the system predictions credits/debits when bets settle.
6. `apps/web/src/lib/wallets/**` — wallet adapter setup
7. `.env.example` — env var conventions
8. Root `package.json` and any workspace config (`turbo.json`, `nx.json`, `pnpm-workspace.yaml`)
9. `README.md`

**After reading**, your first PR description must summarize:
- Frontend framework + version
- Backend framework (Next API routes? separate Express/Fastify?)
- DB + ORM
- Worker/cron mechanism (BullMQ? node-cron? Vercel cron? Inngest?)
- Exact path conventions used by the predictions module (so this module can mirror them)
- Any deviation you had to make from this brief, with one-line justification

If any path in this brief doesn't exist, find the closest match and adapt. Do not invent paths.

---

## 1. SCOPE — V1

**Users can:**
- Open the Sportsbook page from the same nav that hosts Predictions
- Pick a chain (Solana or Base) — same selector the predictions module uses
- Browse upcoming events grouped by league: NBA, NFL, EPL, UEFA Champions League
- See real moneyline (head-to-head) decimal odds from a real bookmaker
- Place a paper bet — pick selection, enter stake in vSOL / vETH / vUSDC, confirm
- View open bets, settled bets, lifetime P&L
- See a per-league leaderboard (reuses prediction leaderboard component if one exists)

**Out of scope (v2+):**
- Spreads, totals, player props, parlays, in-play betting
- More leagues
- Real-money or on-chain settlement
- Cash-out before event ends

---

## 2. ARCHITECTURE — FIXED DECISIONS

| Decision | Choice | Rationale |
|---|---|---|
| Money model | Pure paper. Virtual balances only. | SimFi is paper-only. |
| Counterparty | None. Bets pay from a virtual house pool with infinite capacity (just a number in DB). | No need to model liquidity in v1. |
| Odds source | The Odds API (`the-odds-api.com`) primary. Pluggable client. | Has both odds and scores endpoints — closes the settlement loop with one provider. |
| Odds locking | At bet placement, the current cached odds are copied into the `bets` row (`odds_at_placement`). Settlement uses that, never the live odds. | Standard sportsbook semantics. |
| Settlement | Cron worker polls `/scores`. ESPN scoreboard JSON as cross-check on disputes. | Free, automated, auditable. |
| Refresh cadence | Pre-match odds: 5 min. Scores during active windows: 5 min. Outside active windows: paused. | Stays inside The Odds API free tier (~500 credits/mo) when scoped to 4 leagues. |
| Bet limits | Min stake = 0.01 of token. Max stake = 1,000,000 of token (effectively none — paper). Max odds = 1000.0. | Paper, but stop obvious abuse. |
| Voids | If event status is `postponed`, `cancelled`, or no result within 7 days of scheduled start → void, refund stake. | Matches real sportsbook rules. |
| Push (tie) handling | h2h on soccer can draw. If user picked home/away and it's a draw → void, refund. (h2h on EPL/UCL only has 2 outcomes via The Odds API in some cases — handle both 2-way and 3-way markets.) | Correct settlement. |

---

## 3. TECH STACK — ASSUMPTIONS TO VERIFY DURING PRE-READ

Working assumption (replace with what you actually find in step 0):

- Next.js 14+ App Router, TypeScript
- Prisma or Drizzle on Postgres (Supabase or Neon)
- A worker mechanism — could be `inngest`, BullMQ + Redis, Vercel Cron, or a long-running Node process
- Wagmi + RainbowKit for Base, `@solana/wallet-adapter` for Solana
- Tailwind + shadcn/ui

If reality differs, follow reality. Do not introduce new frameworks. Do not add new dependencies unless absolutely required — if you need a new dep, list it in the PR description with one-line justification.

---

## 4. ENVIRONMENT VARIABLES

Add to `.env.example`. Real values go in `.env.local` (never commit).

```
# The Odds API — https://the-odds-api.com (free tier: 500 credits/month, no card)
THE_ODDS_API_KEY=
THE_ODDS_API_BASE_URL=https://api.the-odds-api.com/v4

# Optional fallback provider — leave blank to disable
ODDS_PROVIDER_FALLBACK=        # "odds-api-io" | "" 
ODDS_API_IO_KEY=

# Sportsbook config
SPORTSBOOK_LEAGUES=basketball_nba,americanfootball_nfl,soccer_epl,soccer_uefa_champs_league
SPORTSBOOK_REGIONS=us,uk,eu
SPORTSBOOK_ODDS_REFRESH_SEC=300
SPORTSBOOK_SCORES_REFRESH_SEC=300
SPORTSBOOK_BET_VOID_AFTER_HOURS=168   # 7 days
```

`SPORTSBOOK_LEAGUES` is a comma-separated list of The Odds API sport keys. Anything in the list gets ingested. To add UFC later, append `mma_mixed_martial_arts`.

---

## 5. DATABASE SCHEMA

Add these tables (Prisma syntax shown — convert to whatever ORM is in use). Naming must match the predictions module's conventions; if predictions uses snake_case in the DB and camelCase in code, do the same here.

```prisma
model SbEvent {
  id              String   @id @default(cuid())
  externalId      String   @unique          // The Odds API event id
  league          String                    // sport_key, e.g. "basketball_nba"
  homeTeam        String
  awayTeam        String
  commenceTime    DateTime
  status          String   @default("scheduled")   // scheduled | live | completed | postponed | cancelled
  homeScore       Int?
  awayScore       Int?
  completedAt     DateTime?
  voidedReason    String?
  rawScores       Json?                     // last raw /scores payload for audit
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  markets         SbMarket[]
  bets            SbBet[]

  @@index([league, commenceTime])
  @@index([status])
}

model SbMarket {
  id              String   @id @default(cuid())
  eventId         String
  marketType      String                    // "h2h" for v1
  bookmakerKey    String                    // e.g. "draftkings", "fanduel" — which book's line we use
  homeOdds        Decimal  @db.Decimal(10, 4)
  awayOdds        Decimal  @db.Decimal(10, 4)
  drawOdds        Decimal? @db.Decimal(10, 4)   // null for 2-way markets
  fetchedAt       DateTime
  isLatest        Boolean  @default(true)   // only one isLatest=true per (eventId, marketType, bookmakerKey)

  event           SbEvent  @relation(fields: [eventId], references: [id], onDelete: Cascade)
  bets            SbBet[]

  @@index([eventId, marketType, isLatest])
  @@index([fetchedAt])
}

model SbBet {
  id              String   @id @default(cuid())
  userId          String
  chain           String                    // "solana" | "base"
  token           String                    // "SOL" | "ETH" | "USDC"
  eventId         String
  marketId        String
  selection       String                    // "home" | "away" | "draw"
  stake           Decimal  @db.Decimal(36, 18)
  oddsAtPlacement Decimal  @db.Decimal(10, 4)
  potentialPayout Decimal  @db.Decimal(36, 18)   // = stake * oddsAtPlacement, computed at placement
  status          String   @default("open")  // open | won | lost | void
  placedAt        DateTime @default(now())
  settledAt       DateTime?
  payoutAmount    Decimal? @db.Decimal(36, 18)   // amount credited back to user (for won = potentialPayout, for void = stake, for lost = 0)
  bookmakerKey    String                    // copied from market at placement, frozen
  notes           String?

  event           SbEvent  @relation(fields: [eventId], references: [id])
  market          SbMarket @relation(fields: [marketId], references: [id])

  @@index([userId, status])
  @@index([eventId, status])
  @@index([status])
}
```

**Indexing intent:** the settlement worker queries `WHERE status = 'open' AND eventId IN (recently completed events)`. Make sure that's fast.

---

## 6. PHASE PLAN — EXECUTE IN ORDER

Each phase is a self-contained PR. Don't move to the next phase until the previous one passes its Done Checklist.

---

### PHASE 1 — Schema + Provider Client

**Files to create:**

```
apps/api/src/modules/sportsbook/
  providers/
    types.ts                    # OddsProvider interface, types
    theOddsApi.ts               # Implementation
    oddsApiIo.ts                # Fallback implementation (skeleton OK if disabled)
    index.ts                    # Factory: returns provider based on env
  schema.ts                     # Re-exported zod types for events/odds/scores
prisma/migrations/<timestamp>_sportsbook/migration.sql
```

**`providers/types.ts`** — define this interface exactly:

```ts
export interface NormalizedEvent {
  externalId: string;
  league: string;             // sport_key
  homeTeam: string;
  awayTeam: string;
  commenceTime: Date;
}

export interface NormalizedOdds {
  externalEventId: string;
  marketType: "h2h";
  bookmakerKey: string;
  homeOdds: number;
  awayOdds: number;
  drawOdds: number | null;
  fetchedAt: Date;
}

export interface NormalizedScore {
  externalEventId: string;
  status: "scheduled" | "live" | "completed" | "postponed" | "cancelled";
  homeScore: number | null;
  awayScore: number | null;
  completedAt: Date | null;
  raw: unknown;
}

export interface OddsProvider {
  name: string;
  fetchEventsWithOdds(league: string): Promise<{
    events: NormalizedEvent[];
    odds: NormalizedOdds[];
  }>;
  fetchScores(league: string, daysFrom: number): Promise<NormalizedScore[]>;
}
```

**`providers/theOddsApi.ts`** — real, working integration with these endpoints:

- `GET {BASE}/sports/{league}/odds?apiKey=...&regions=us&markets=h2h&oddsFormat=decimal`
- `GET {BASE}/sports/{league}/scores?apiKey=...&daysFrom={n}`

Notes Kimi must respect:
- The Odds API returns an array of events. Each event has a `bookmakers[]` array. Each bookmaker has a `markets[]` array. For h2h: the market has `outcomes[]` where each outcome has `name` (team name or "Draw") and `price` (decimal odds).
- Pick a single preferred bookmaker per region in priority order: `["draftkings", "fanduel", "betmgm", "williamhill_us", "pinnacle"]`. First one present in the response wins.
- Map `outcome.name === homeTeam` → `homeOdds`, etc. The "Draw" outcome only exists for 3-way markets (soccer).
- Return `fetchedAt = new Date()` (HTTP response time, not the API's `last_update`).

For `fetchScores`:
- Each result has `completed: boolean`, `scores: [{name, score}] | null`.
- Map `completed=true` → status `"completed"`. If `completed=false` and `commence_time` is in the future → `"scheduled"`. If `completed=false` and start is in the past → `"live"`.
- Postponed/cancelled are not directly signaled — leave as `"scheduled"` and let the void cron handle stale events past their commence time + N hours.

**Done checklist for Phase 1:**

```bash
# 1. Migration runs cleanly
pnpm prisma migrate dev --name sportsbook

# 2. Smoke test the provider against the real API
pnpm tsx apps/api/src/modules/sportsbook/providers/__smoke__.ts
# Expected output: prints >0 events for basketball_nba (or whichever league is in season), with non-null homeOdds and awayOdds.
```

Create `__smoke__.ts` that calls `fetchEventsWithOdds("basketball_nba")` and prints the first 3 events. This is a real test using a real API key from `.env.local`. Do NOT commit the API key. Do NOT mock — the whole point is to verify the integration works.

---

### PHASE 2 — Ingestion Worker

**Files:**
```
apps/api/src/modules/sportsbook/ingest/
  ingestOdds.ts                 # Job: fetch + upsert events + odds
  ingestScores.ts               # Job: fetch + upsert scores
  registerCron.ts               # Wire jobs into the existing cron mechanism
```

**`ingestOdds.ts` logic:**
1. For each league in `SPORTSBOOK_LEAGUES`:
2. Call `provider.fetchEventsWithOdds(league)`
3. For each `NormalizedEvent`: upsert into `SbEvent` keyed by `externalId`. Don't overwrite `status` if it's already `completed` or `cancelled`.
4. For each `NormalizedOdds`:
   - Find the corresponding `SbEvent` by `externalEventId`
   - Mark the previous `isLatest=true` row for that `(eventId, marketType, bookmakerKey)` triple as `isLatest=false`
   - Insert a new `SbMarket` row with `isLatest=true`
5. Wrap each league in try/catch. One league failing must not block others. Log structured errors.

**`ingestScores.ts` logic:**
1. For each league: call `provider.fetchScores(league, 3)`
2. Upsert `homeScore`, `awayScore`, `status`, `completedAt`, `rawScores` onto matching `SbEvent`.
3. Do NOT settle bets here. That's a separate worker (Phase 4).

**`registerCron.ts`:**
- Use whatever cron mechanism the existing predictions module uses. If predictions uses Inngest, register two Inngest functions. If it uses BullMQ, define two repeatable jobs. If it uses Vercel Cron, add to `vercel.json`.
- Cadence: `ingestOdds` every `SPORTSBOOK_ODDS_REFRESH_SEC`, `ingestScores` every `SPORTSBOOK_SCORES_REFRESH_SEC`.

**Done checklist for Phase 2:**

```bash
# Run ingest once manually
pnpm tsx apps/api/src/modules/sportsbook/ingest/__run__.ts ingestOdds
pnpm tsx apps/api/src/modules/sportsbook/ingest/__run__.ts ingestScores

# Verify via SQL
psql $DATABASE_URL -c "SELECT league, COUNT(*) FROM sb_events GROUP BY league;"
# Expected: rows for each league with count > 0 (during their season)

psql $DATABASE_URL -c "SELECT COUNT(*) FROM sb_markets WHERE \"isLatest\" = true;"
# Expected: roughly = COUNT(events) for in-season leagues
```

---

### PHASE 3 — Backend API Routes + Bet Placement

Mirror the predictions module's route layout exactly. Working assumption: Next.js App Router under `apps/web/src/app/api/sportsbook/`.

**Routes:**

```
GET  /api/sportsbook/leagues                        # active leagues w/ event counts
GET  /api/sportsbook/events?league=&from=&to=       # upcoming events with current odds
GET  /api/sportsbook/events/:id                     # single event + market history (last 20 odds snapshots)
POST /api/sportsbook/bets                           # place a bet
GET  /api/sportsbook/bets?status=open|settled       # current user's bets (auth required)
GET  /api/sportsbook/leaderboard?league=&period=    # top users by P&L
```

**`POST /api/sportsbook/bets` — full handler logic:**

Request body (zod-validated):
```ts
{
  eventId: string,
  selection: "home" | "away" | "draw",
  chain: "solana" | "base",
  token: "SOL" | "ETH" | "USDC",
  stake: string,            // decimal string to avoid float
  expectedOdds: number,     // odds the user saw on screen
  slippageBps: number       // e.g. 100 = 1% tolerance
}
```

Handler steps (must run inside a single DB transaction):

1. Auth: get current user (mirror predictions module's auth).
2. Load `SbEvent` by id. Reject if `status !== "scheduled"` or `commenceTime <= now`.
3. Load latest `SbMarket` for `(eventId, marketType="h2h")`, prefer first available bookmaker by priority list.
4. Read the odds for the chosen `selection` from that market.
5. Slippage check: if `Math.abs(currentOdds - expectedOdds) / expectedOdds * 10000 > slippageBps` → reject with `{error: "ODDS_MOVED", currentOdds}`.
6. Validate stake: `stake >= 0.01`, `stake <= max`, user has sufficient virtual balance for `(chain, token)` — call the existing balance service the predictions module uses. **Do not duplicate balance logic — call it.**
7. Debit user balance for `stake`. Use the same debit method predictions uses.
8. Create `SbBet` row: status `"open"`, `oddsAtPlacement = currentOdds`, `potentialPayout = stake * currentOdds`, `bookmakerKey = market.bookmakerKey`.
9. Return the created bet.

Failure modes to handle explicitly:
- Insufficient balance → 402 with code `INSUFFICIENT_BALANCE`
- Event already started → 409 `EVENT_LOCKED`
- Slippage exceeded → 409 `ODDS_MOVED`
- No latest odds → 503 `MARKET_UNAVAILABLE`

Return shape consistent with the predictions module's bet/order endpoint.

**Done checklist for Phase 3:**

```bash
# After auth-as-test-user (use whatever helper predictions tests use)

# List leagues
curl -s http://localhost:3000/api/sportsbook/leagues | jq

# List NBA events
curl -s "http://localhost:3000/api/sportsbook/events?league=basketball_nba" | jq '.[0]'
# Expect: an event with home/away teams, commenceTime, latest odds

# Place a bet (replace EVENT_ID)
curl -s -X POST http://localhost:3000/api/sportsbook/bets \
  -H "Content-Type: application/json" \
  -H "Cookie: <auth>" \
  -d '{"eventId":"EVENT_ID","selection":"home","chain":"solana","token":"USDC","stake":"10","expectedOdds":1.85,"slippageBps":100}' \
  | jq

# Verify balance was debited
psql $DATABASE_URL -c "SELECT * FROM v_balances WHERE user_id='...' AND chain='solana' AND token='USDC';"
```

---

### PHASE 4 — Settlement Worker

**File:** `apps/api/src/modules/sportsbook/settle/settleBets.ts`

**Logic (transactional per bet):**

1. Find all `SbBet` where `status = 'open'` AND `event.status = 'completed'`.
2. For each bet:
   - Determine outcome: `homeScore > awayScore` → `"home"`, `homeScore < awayScore` → `"away"`, equal → `"draw"`.
   - If `bet.selection === outcome`:
     - status = `"won"`, `payoutAmount = potentialPayout`, credit user balance for `potentialPayout`.
   - Else if outcome is `"draw"` and bet is on home/away in a 2-way market (no draw market existed) → status = `"void"`, `payoutAmount = stake`, refund stake.
   - Else: status = `"lost"`, `payoutAmount = 0`, no balance change.
   - Set `settledAt = now()`.
3. Separately, find all `SbBet` where `status = 'open'` AND `event.commenceTime < now() - SPORTSBOOK_BET_VOID_AFTER_HOURS`. Void them (refund stake). This handles missing/stuck results.

**Idempotency:** the worker must be safe to run repeatedly. Already-settled bets are filtered out by the `status = 'open'` clause.

**Audit:** every settlement writes a structured log line `{betId, userId, outcome, status, payoutAmount, eventId, eventScore}`. Pipe through whatever logger the predictions module uses.

**Cron:** every `SPORTSBOOK_SCORES_REFRESH_SEC + 30s` (run shortly after each scores refresh). Same cron mechanism as Phase 2.

**Done checklist for Phase 4:**

```bash
# Force a completed event scenario for local testing:
psql $DATABASE_URL <<'SQL'
UPDATE sb_events 
  SET status='completed', "homeScore"=110, "awayScore"=100, "completedAt"=NOW()
  WHERE id='<test event id>';
SQL

# Run settlement
pnpm tsx apps/api/src/modules/sportsbook/settle/__run__.ts

# Verify bets settled
psql $DATABASE_URL -c "SELECT id, status, \"payoutAmount\" FROM sb_bets WHERE \"eventId\"='<test event id>';"
# Expect: home bets won with payoutAmount > 0, away bets lost with 0

# Verify balance credited
psql $DATABASE_URL -c "SELECT * FROM v_balances WHERE user_id='<winning user>';"
```

---

### PHASE 5 — Frontend UI

Mirror the predictions module's directory layout, components, and styling. Working assumption:

```
apps/web/src/modules/sportsbook/
  pages/
    SportsbookHomePage.tsx      # /sportsbook
    EventDetailPage.tsx         # /sportsbook/events/[id]
    MyBetsPage.tsx              # /sportsbook/my-bets
  components/
    LeagueTabs.tsx
    EventCard.tsx
    OddsButton.tsx              # tappable price button (the actual bet trigger)
    BetSlip.tsx                 # slide-up panel, mirrors predictions' OrderTicket
    BetSlipStakeInput.tsx
    BetHistoryTable.tsx
    EmptyStates.tsx
  hooks/
    useSportsbookEvents.ts
    usePlaceBet.ts
    useMyBets.ts
  api/
    client.ts                   # typed wrappers around the /api/sportsbook routes
```

**Routes (Next App Router):**
```
apps/web/src/app/sportsbook/page.tsx
apps/web/src/app/sportsbook/events/[id]/page.tsx
apps/web/src/app/sportsbook/my-bets/page.tsx
```

**Key UX rules:**
- Chain selector is the **same component** the predictions module uses. Do not duplicate.
- Token selector limited to whatever tokens have nonzero balance on the selected chain.
- `OddsButton` shows the decimal odds and, on tap, opens the BetSlip with that selection prefilled.
- BetSlip live-recomputes potential payout = `stake * odds` as the user types stake.
- Slippage tolerance is a settings cog inside the BetSlip with default 100 bps.
- After successful bet placement: toast confirmation, BetSlip closes, MyBets count badge increments. Use the same toast/notification system as predictions.
- Empty states: "No upcoming events in this league this week" with a soft CTA to switch leagues.
- Locked events (commenceTime ≤ now): show greyed-out card with "Started" badge instead of the OddsButton.

**Add nav entry** wherever predictions is in the main nav. Icon style must match existing nav icons (lucide-react probably).

**Done checklist for Phase 5:**

```
- [ ] /sportsbook renders 4 league tabs, current week's events listed under each
- [ ] Tap an OddsButton on any event → BetSlip opens with selection prefilled
- [ ] Enter stake → potential payout updates live
- [ ] Confirm bet → success toast, balance reduces, MyBets shows the new open bet
- [ ] Stake exceeding balance → inline error, no API call
- [ ] /sportsbook/my-bets shows open and settled tables, P&L correct
- [ ] Visual review in dark mode matches predictions module styling
```

---

### PHASE 6 — Tests

Add tests at the same coverage level the predictions module has. If predictions has Vitest unit tests + Playwright e2e, do the same.

**Unit tests (mocks allowed here per the no-placeholder rule's testing exception):**

```
apps/api/src/modules/sportsbook/__tests__/
  theOddsApi.test.ts            # mocked HTTP, parses real fixture payloads
  ingestOdds.test.ts            # in-memory DB, asserts upsert + isLatest flip
  settleBets.test.ts            # win, lose, draw-void, void-on-stale scenarios
  placeBet.test.ts              # slippage rejection, insufficient balance, locked event
```

Capture **real** Odds API JSON fixtures (one /odds payload per league, one /scores payload) and commit them under `__fixtures__/`. Use them in unit tests. Do NOT hand-write fake payloads — fetch real ones once and save them.

**E2E test (Playwright, if predictions uses it):**
- Seed a completed event in the DB
- Place a bet as test user
- Run settlement worker
- Assert balance credited and bet shows as won in UI

---

## 7. RISKS / OPEN QUESTIONS — DO NOT GUESS, ASK

Stop and ask Gorkhmaz before assuming on any of these:

1. **Existing virtual balance API surface.** If the predictions module's balance service is not exported / not reusable as-is, do NOT duplicate it — flag and ask.
2. **Cron infrastructure.** If there's no existing cron mechanism, do NOT introduce one without asking. Possible answers: Vercel Cron, Inngest, Supabase scheduled functions, or "we run a long-lived worker on Railway."
3. **Auth.** If predictions uses Supabase Auth, NextAuth, Privy, or custom — match it. Do not introduce a new auth.
4. **Bookmaker priority list.** Default is `[draftkings, fanduel, betmgm, williamhill_us, pinnacle]`. If product wants a different default → confirm.
5. **Free-tier credit math.** With 4 leagues × every-5-min refresh × 24h = ~1150 credits/day. The Odds API free tier is 500/month total — **not enough**. For dev/demo, throttle to "only refresh when a user is on the page in the last 10 min" (lazy refresh) and refresh scores only during active game windows. For production, the user needs to either (a) pay $30/mo for the entry tier, or (b) use Odds-API.io's 100 req/hour free tier as primary. Implement both providers and let env var pick. Flag this in the PR description with current monthly credit estimate.

---

## 8. FINAL DONE CHECKLIST — WHOLE FEATURE

Before marking the whole project done:

- [ ] All phase done-checklists pass
- [ ] `pnpm test` green
- [ ] `pnpm typecheck` green
- [ ] `pnpm lint` green
- [ ] No new top-level dependencies without justification in PR
- [ ] `.env.example` updated with all new keys
- [ ] README has a new section: "Sportsbook" with setup steps (where to get The Odds API key, how to run ingestion locally, how to seed test events)
- [ ] One real bet placed end-to-end on dev: NBA game, 10 vUSDC stake on the home side, settlement runs after game completes, balance reflects correct payout
- [ ] Predictions module behavior unchanged — run its existing test suite, all green
- [ ] No on-chain code added. No real-money flows. No external paid SaaS dependencies beyond the optional Odds API key.

---

## 9. STYLE / DISCIPLINE

- No `TODO`, `FIXME`, or `// implement later` in committed code.
- No empty function bodies, no `return null` placeholders.
- All errors thrown have a structured shape: `{ code: string, message: string, details?: unknown }`.
- All API responses use the same envelope predictions uses.
- All Decimal math goes through whatever decimal library predictions uses (`decimal.js`, `bignumber.js`, or native Postgres Decimal). Never use JS `number` for stakes or payouts.
- Logs are structured JSON with `module: "sportsbook"` tag.
- Comments explain WHY, not WHAT.

Begin with Phase 0 (Pre-Read). Post the summary required at the end of section 0 as your first message before writing any code.
