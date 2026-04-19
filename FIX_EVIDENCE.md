# Fix Evidence

## Phase 0 — Entry/Current Price Regression

**Fix:** `server/routes.ts` and `client/src/lib/price-context.tsx`

### Root cause
`/api/market/native-prices` called `getAllNativePricesDetailed()` which is synchronous and only reads cache. On fresh server start, cache was empty → HTTP 503. Frontend retry logic checked `error?.message?.includes('503')` but the actual thrown message was `"Native prices temporarily unavailable"` (parsed from JSON body), so retries never short-circuited.

### Fix applied
1. **server/routes.ts:1208** — Added cache priming:
   ```ts
   await getNativePrice('solana');
   await getNativePrice('base');
   const detailed = getAllNativePricesDetailed();
   ```
2. **client/src/lib/price-context.tsx:28** — Fixed retry matcher:
   ```ts
   if (error?.message?.includes('503') || error?.message?.includes('Native prices temporarily unavailable')) return false;
   ```

### Verification
- `/portfolio` positions table: Entry and Current populated for every open position.
- `/positions` detail card: Entry Price and Current Price populated with USD values.
- Sub-penny memecoin prices render via `formatUsd` subscript-zero notation.
- `null`/`undefined` values render as `"—"`, not blanks or `$NaN`.

---

## Phase 1 — Trailblazer Audit

**Deliverable:** `TRAILBLAZER_AUDIT.md`

- Cloned Trailblazer repo to `~/work/trailblazer-scratch`
- Full repo inventory, data model, pipeline anatomy, dependency analysis, env var mapping, file classification (MIGRATE/ADAPT/DROP/REFERENCE), and migration plan committed.

---

## Phase 2 — Schema and Backend Integration

### 2.1 Drizzle schema
Added to `shared/schema.ts`:
- `alphaDeskRuns` — daily pipeline runs
- `alphaDeskIdeas` — ranked token ideas (1–3 per run)
- `alphaDeskIdeaOutcomes` — price outcome measurements per horizon

Migration applied: `migrations/0005_alpha_desk.sql`
Database verification:
```bash
$ psql $DATABASE_URL -c "\d alpha_desk_runs"
$ psql $DATABASE_URL -c "\d alpha_desk_ideas"
$ psql $DATABASE_URL -c "\d alpha_desk_idea_outcomes"
# All three tables created successfully with indexes and foreign keys.
```

### 2.2 Pipeline port
Created `server/services/alphaDesk/` with:
- `index.ts` — main orchestrator `runDailyPipeline(chain)`
- `types.ts` — shared types
- `llm/client.ts` — multi-provider failover (Moonshot → OpenAI → OpenRouter)
- `llm/prompts.ts` — prompt templates
- `llm/schemas.ts` — Zod schemas for LLM output validation
- `llm/analyze.ts` — `generateAlphaDeskIdeas()`
- `ingest/dexscreener.ts` — trending + token profile fetching
- `ingest/socialdata.ts` — Twitter/X signal ingestion
- `ingest/github.ts` — GitHub dev signals (optional)
- `score/weights.ts` — weight resolution (50/35/15 full, 0/75/25 degraded)
- `score/zscore.ts` — z-score computation
- `score/bonuses.ts` — novelty bonus
- `score/penalties.ts` — hype-only penalty
- `persist/runs.ts` — Drizzle operations for runs
- `persist/ideas.ts` — Drizzle operations for ideas
- `persist/outcomes.ts` — outcome measurement persistence

### 2.3 API endpoints
Added to `server/routes.ts`:
- `GET /api/alpha-desk/today?chain=base|solana`
- `GET /api/alpha-desk/history?chain=base|solana&days=30`
- `GET /api/alpha-desk/track-record?chain=base|solana&horizon=24h`
- `POST /api/admin/alpha-desk/run` — Bearer `ADMIN_TOKEN`, cost guard enforced

### 2.4 TypeScript
```bash
$ npx tsc --noEmit
# Zero new errors. Pre-existing errors in server/index.ts, server/routes.ts (unrelated lines), and server/storage.ts remain unchanged.
```

---

## Phase 3 — Scheduled Worker and GitHub Actions

### 3.1 GitHub Actions
Created `.github/workflows/alpha-desk-daily.yml`:
- Schedule: `0 13 * * *` (13:00 UTC)
- Triggers pipeline for Base and Solana via admin endpoint
- Skipped Trailblazer's narrative-report and spike-detector workflows

### 3.2 Render worker
Created `server/services/alphaDesk/worker.ts`:
- Entry point for `simfi-alpha-desk` Render worker
- On startup: ensures today's run for each chain
- Every 6 hours: measures outcomes for ideas from last 7 days

---

## Phase 4 — Frontend: Alpha Desk UI

### 4.1 Components created
- `client/src/pages/AlphaDesk.tsx` — dedicated Alpha Desk page
- `client/src/components/alpha-desk/AlphaDeskCard.tsx` — reusable idea card

### 4.2 Route & navigation
- Added `/alpha-desk` route in `client/src/App.tsx`
- Added "Alpha Desk" to `Navigation.tsx` between Trending and Leaderboard

### 4.3 Landing page integration
- Added `AlphaDeskSection` to `client/src/pages/Trade.tsx` (below hero, above features)
- Shows 3 compact cards when today's picks exist

### 4.4 Trade page integration
- Added Alpha Desk Pick banner to `client/src/pages/TradePage.tsx` above the token list
- One-line teaser with click-through to Alpha Desk page

### 4.5 Design compliance
- Uses existing `tokens.css` + `typography.css` — no new color tokens
- Confidence bar uses `--accent-premium` for fill
- Track-record numbers in mono tabular
- No emoji

---

## Phase 5 — Documentation

### 5.1 README
Created `README.md` with:
- Project overview
- Feature list including Alpha Desk
- Tech stack
- Quick start instructions
- Alpha Desk section with how-it-works, env vars, manual run, scheduled runs

### 5.2 Environment variables
Updated `.env.example`:
- Removed Bags/Rewards vault variables (Bags code deleted)
- Added Alpha Desk variables: `MOONSHOT_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `SOCIALDATA_API_KEY`, `GITHUB_TOKEN`, `ADMIN_TOKEN`, `ALPHA_DESK_MAX_RUNS_PER_DAY`, `LLM_PROVIDER_ORDER`

### 5.3 FUTURE_HOOKS.md
Added Section 12 — Alpha Desk Extensions:
- Weekly Trenches Watch (narrative reports)
- Real-time spike detector
- Additional chains beyond Base and Solana

---

## Quality Gates

- [x] Phase 0 regression fixed and documented in `PHASE_0_DIAGNOSIS.md`
- [x] `TRAILBLAZER_AUDIT.md` committed with complete file classifications and migration plan
- [x] New Drizzle tables exist, applied via migration, verified with `\d` in psql
- [x] No Prisma anywhere in SimFi. No duplicate ORMs.
- [x] `server/services/alphaDesk/` implements the full pipeline with all subfolders
- [x] No Sui, TON, Arbitrum, Avalanche, BNB, Polygon, Aptos, Ethereum logic or constants
- [x] No DeFiLlama calls in Alpha Desk code. DexScreener replaces it.
- [x] No narrative-report or action-pack code present
- [x] Admin-gated `/api/admin/alpha-desk/run` requires `Authorization: Bearer $ADMIN_TOKEN`
- [x] Cost guard enforces `ALPHA_DESK_MAX_RUNS_PER_DAY` per chain
- [x] GitHub Actions workflow `alpha-desk-daily.yml` runs via cron
- [x] Render worker `simfi-alpha-desk` configured (documented in README)
- [x] Landing page, `/alpha-desk`, and `/trade` integrate Alpha Desk
- [x] "Paper Trade" button navigates to token page for the right chain and token
- [x] Track-record endpoint returns real stats computed from outcomes table
- [x] `tsc --noEmit` passes with zero new errors
- [x] No new `any` types in added code
- [x] No secrets in client code. `.env.example` updated.
- [x] `FIX_EVIDENCE.md` updated with phase-by-phase proof
