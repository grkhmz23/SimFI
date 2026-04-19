# SimFi — Alpha Desk Migration from Trailblazer (Kimi Code)

## Context

SimFi is going to absorb the valuable pieces of a separate project called **Trailblazer** (repo: `grkhmz23/Trailblazer`). Trailblazer is a narrative-detection and daily-token-idea pipeline for multiple chains. The standalone site is being sunset. We are migrating the Daily Token Ideas pipeline into SimFi as a new feature called **Alpha Desk**.

The business frame: this lets SimFi show users 3 AI-curated high-signal tokens per day on Base and Solana, with a public historical track record, paper-tradeable in one click. It's the centerpiece of the upcoming investor demo.

Before any Alpha Desk work begins, there is an **urgent regression** to fix: entry price and current price have disappeared from positions after the recent USD formatting work. Phase 0 is that fix. Do not skip it.

---

## Non-negotiables (read first, do not violate)

1. No placeholders, no TODOs, no stubs, no "example only" code in production paths. Every file you ship compiles and runs.
2. Do not invent backend endpoints, response shapes, or SDK methods. Read the real source — both SimFi's and Trailblazer's — and match exactly.
3. Secrets go through environment variables only. Update `.env.example` for any new keys.
4. Preserve all existing SimFi functionality. No regressions to trading, portfolio, leaderboard, auth, or formatting.
5. BigInt for all token math. `numeric(38,18)` for prices in Postgres (matches the existing schema pattern).
6. Complete files only when you write code. No fragments.
7. One logically-scoped commit per phase. Do not batch phases.
8. If a claim in this prompt contradicts what you actually find in either codebase, stop and flag it. Do not silently invent a workaround.

---

## Phase 0 — Entry/Current price regression (URGENT, do this first)

**Symptom:** Entry price and current price columns previously displayed in USD are now missing or blank on `/portfolio` and `/positions`. This was working in earlier screenshots. Almost certainly caused by the recent `formatUsd` / `formatNative` refactor.

### 0.1 Diagnose

1. Open `/portfolio` and `/positions` as a logged-in test user with at least one open position.
2. Capture exactly what renders in the Entry and Current cells (empty string, `—`, `undefined`, zero, absent DOM node).
3. In DevTools, find the position object in the rendered component state. Record which field the component reads for entry/current and whether that field is present, `null`, `undefined`, `0`, or a string.
4. Trace the field backward to the API response. Is the backend returning the value under a different key than the frontend reads? (Common cause after schema refactors.)
5. Check whether the USD conversion hook (`useNativePrices()` from the previous prompt) is being awaited. If Entry/Current USD requires `ethUsd`/`solUsd` and the hook is still loading, the formatter may correctly render `—` — but then the initial paint silently hides the row. Identify whether this is a render timing issue vs. a data shape issue.

Record findings in `PHASE_0_DIAGNOSIS.md`.

### 0.2 Fix

Based on Section 3.2 of the previous prompt, Entry and Current are **USD only** via `formatUsd`. The contract is:

- Backend returns `entryPrice` and `currentPrice` as decimal strings in **native currency** (the `numeric(38,18)` schema we migrated to).
- Frontend computes USD as `parseFloat(entryPriceNative) * nativeUsd` using the `useNativePrices()` hook.
- Result is passed to `formatUsd()`, which returns a ReactNode (em-dash `—` when data is absent, subscript-zero notation for sub-penny prices).

Verify each step in the chain. If any step silently drops the value (e.g. `parseFloat("0.000003136605")` vs. `Number("0.000003136605")` — both work, but a BigInt cast would fail), fix it.

### 0.3 Verify

- `/portfolio` positions table: Entry and Current populated for every open position.
- `/positions` detail card: Entry Price and Current Price populated with USD values.
- Memecoin tokens with sub-penny prices render in subscript-zero notation, e.g. `$0.0₅73`.
- Null/undefined values render as `—`, not as blanks or `$NaN` or `$0.00`.
- No console errors, no React key warnings.

Commit Phase 0 with message `fix(portfolio): restore entry/current price display after USD refactor` and paste a before/after screenshot into `FIX_EVIDENCE.md` under a "Phase 0" heading. **Do not proceed to Phase 1 until Phase 0 is verified green.**

---

## Phase 1 — Trailblazer audit (investigation only, no code changes in SimFi)

The Trailblazer repo is at `https://github.com/grkhmz23/Trailblazer`. Clone it to a scratch directory outside the SimFi repo:

```bash
cd ~/work
git clone https://github.com/grkhmz23/Trailblazer trailblazer-scratch
```

Produce `TRAILBLAZER_AUDIT.md` at the root of the SimFi repo with the following sections.

### 1.1 Repo inventory

- Top-level tree (2 levels deep).
- Package layout (apps, packages, fixtures).
- Every workspace's `package.json` scripts, with a one-line description of what each script does.
- Every GitHub Actions workflow under `.github/workflows/`, with cron schedules and what each one triggers.

### 1.2 Data model

- Prisma schema at `apps/web/prisma/schema.prisma` — list every model and its purpose.
- Which tables are relevant to Daily Token Ideas specifically.
- Which tables are specific to Narrative Reports (builder-facing) and can be dropped from the migration.

### 1.3 Pipeline anatomy

Trace the Daily Token Ideas pipeline end-to-end:

- Entry point (which script, which file, which command).
- Ingestion sources actually hit (GitHub, Twitter/SocialData, DeFiLlama, DexScreener, GeckoTerminal, RSS).
- Scoring logic — where z-scores are computed, weights applied, novelty bonus and quality penalties.
- Clustering step — is this used for daily ideas or only narrative reports?
- LLM orchestration — Moonshot client, fallback chain, prompt templates, where prompts live.
- Output — how the 3 daily picks are persisted, what fields, what format.
- API endpoints that serve daily ideas to the frontend.

### 1.4 Dependencies

- Runtime dependencies that must come over (list with reason).
- Dependencies that are Trailblazer-only and can be dropped (list with reason — especially anything tied to narrative reports, 10-chain coverage, or builder action-packs).
- Any dependencies that SimFi already has — reuse SimFi's version, don't duplicate.

### 1.5 Environment variables

List every env var Trailblazer uses, whether it's required for Daily Token Ideas, and whether SimFi already has an equivalent.

### 1.6 Classify every file

For each significant file in `apps/web/src/` and `packages/`, classify as:

- **MIGRATE** — valuable for Alpha Desk, bring over with minimal changes.
- **ADAPT** — valuable but needs rewriting for SimFi's stack/conventions.
- **DROP** — specific to narrative reports, builder action packs, 10-chain coverage, or the Trailblazer standalone UI.
- **REFERENCE** — don't migrate, but useful to read while adapting.

### 1.7 Migration plan

End `TRAILBLAZER_AUDIT.md` with a **Migration Plan** section:

- Proposed SimFi directory structure for the Alpha Desk code (recommend `server/services/alphaDesk/` for the pipeline, `client/src/pages/AlphaDesk.tsx` for the UI, `shared/alphaDesk/` for shared types).
- Whether to use Prisma or extend SimFi's Drizzle ORM. **Default to Drizzle** — SimFi uses Drizzle, adding Prisma would fracture the schema management.
- New Drizzle schema additions needed (tables: `alpha_desk_runs`, `alpha_desk_ideas`, `alpha_desk_idea_outcomes` — propose exact columns).
- New API endpoints to add to SimFi's Express router.
- GitHub Actions workflow changes (migrate the daily pipeline cron, drop the narrative one).
- Scheduled worker setup on Render (add a new worker service `simfi-alpha-desk`, sibling to `simfi-bot`).

Commit `TRAILBLAZER_AUDIT.md` before any Phase 2 work. **Do not migrate a single file before this audit is committed and reviewed.**

---

## Phase 2 — Schema and backend integration

Based on the audit's Migration Plan, implement the following. Adjust only if the audit surfaced a better path — and if so, document the deviation at the top of the affected file.

### 2.1 Drizzle schema additions

Add to `shared/schema.ts`:

```ts
// Alpha Desk — daily token idea runs and outcomes
export const alphaDeskRuns = pgTable("alpha_desk_runs", {
  id: serial("id").primaryKey(),
  runDate: date("run_date").notNull(),          // YYYY-MM-DD, one row per day per chain
  chain: varchar("chain", { length: 16 }).notNull(),  // "base" | "solana"
  status: varchar("status", { length: 32 }).notNull(), // "pending" | "succeeded" | "failed"
  sourcesUsed: jsonb("sources_used").notNull(),   // { github: true, socialdata: false, ... }
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
  rank: integer("rank").notNull(),                // 1, 2, or 3
  chain: varchar("chain", { length: 16 }).notNull(),
  tokenAddress: varchar("token_address", { length: 64 }).notNull(),
  symbol: varchar("symbol", { length: 32 }).notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  pairAddress: varchar("pair_address", { length: 64 }),
  narrativeThesis: text("narrative_thesis").notNull(),
  whyNow: text("why_now").notNull(),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }).notNull(), // 0.00 - 100.00
  riskFlags: jsonb("risk_flags").notNull(),        // { liquidity: "low", holders: "concentrated", ... }
  evidence: jsonb("evidence").notNull(),           // { tweets: [...], signals: [...] }
  priceAtPublishUsd: numeric("price_at_publish_usd", { precision: 38, scale: 18 }),
  priceAtPublishNative: numeric("price_at_publish_native", { precision: 38, scale: 18 }),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alphaDeskIdeaOutcomes = pgTable("alpha_desk_idea_outcomes", {
  id: serial("id").primaryKey(),
  ideaId: integer("idea_id").notNull().references(() => alphaDeskIdeas.id, { onDelete: "cascade" }),
  horizon: varchar("horizon", { length: 16 }).notNull(), // "1h" | "6h" | "24h" | "7d"
  priceUsd: numeric("price_usd", { precision: 38, scale: 18 }),
  pctChange: numeric("pct_change", { precision: 10, scale: 4 }),
  measuredAt: timestamp("measured_at", { withTimezone: true }).notNull(),
}, (t) => ({
  ideaHorizonIdx: uniqueIndex("alpha_desk_outcomes_idea_horizon_uidx").on(t.ideaId, t.horizon),
}));
```

Generate the Drizzle migration with `npm run db:generate` (or the existing SimFi command — check `package.json`). Verify the SQL migration file before committing. Apply with `npm run db:push` or the existing migration command.

### 2.2 Pipeline port

Create `server/services/alphaDesk/` with this structure:

```
server/services/alphaDesk/
  index.ts                 # main entry: runDailyPipeline(chain)
  ingest/
    dexscreener.ts         # fetch trending + new pairs for a chain
    github.ts              # optional dev-signal ingestion (skipped if no token)
    socialdata.ts          # optional Twitter/KOL ingestion (skipped if no key)
  score/
    zscore.ts              # z-score computation vs chain baseline
    weights.ts              # 50/35/15 dev/social/market weights (matches Trailblazer)
    bonuses.ts              # novelty bonus + cross-chain bonus
    penalties.ts            # hype-only penalty
  cluster/
    embed.ts               # text embedding via Moonshot or OpenAI
    agglomerative.ts       # cosine-similarity agglomerative clustering
  llm/
    client.ts              # Moonshot primary, OpenAI/OpenRouter fallback
    prompts.ts             # prompt templates
    analyze.ts              # generate narrative thesis, why-now, risk flags
  persist/
    runs.ts                 # insert AlphaDeskRun rows
    ideas.ts                # insert AlphaDeskIdea rows
    outcomes.ts             # scheduled outcome measurement
  types.ts
```

**Port rules:**

- Port only the Daily Token Ideas path. Do not port narrative-report code or action-pack generation.
- Hardcode the chain allowlist to `["base", "solana"]`. Do not port Sui, TON, Arbitrum, etc.
- Replace DeFiLlama with DexScreener liquidity + volume. Memecoins don't have meaningful TVL; DexScreener gives you pair liquidity and 24h volume, which is what matters.
- Keep the scoring weights (50% dev / 35% social / 15% market) from Trailblazer. If `GITHUB_TOKEN` is missing, redistribute dev weight to social (adjust to 0% dev / 75% social / 25% market). Log the degraded mode clearly.
- Keep the novelty bonus (1.3x decaying to 1.0x over 60 days) and the hype-only penalty (0.7x when >80% snippets are hype).
- Drop the cross-chain bonus — only 2 chains now, not meaningful.
- Replace Prisma calls with Drizzle calls. Match SimFi's existing repository pattern in `server/storage.ts` for the DB layer.

### 2.3 LLM client

Port Trailblazer's multi-provider LLM client to `server/services/alphaDesk/llm/client.ts`:

- Primary: Moonshot Kimi K2 Thinking Turbo (env: `MOONSHOT_API_KEY`, `MOONSHOT_MODEL` default `kimi-k2-thinking-turbo`).
- Fallback 1: OpenAI (env: `OPENAI_API_KEY`, model `gpt-4o-mini`).
- Fallback 2: OpenRouter (env: `OPENROUTER_API_KEY`, model configurable).
- Timeout per provider: 60s.
- If all three fail, the pipeline run fails cleanly, writes status `"failed"` with `errorMessage`, and does not publish stale or fabricated ideas.

### 2.4 API endpoints

Add to SimFi's existing Express router (match the patterns in `server/routes.ts`):

```
GET  /api/alpha-desk/today?chain=base|solana
     → latest successful run's 3 ideas for the chain, with outcomes joined

GET  /api/alpha-desk/history?chain=base|solana&days=30
     → last N days of ideas with outcomes (used for the track-record card)

GET  /api/alpha-desk/track-record?chain=base|solana&horizon=24h
     → aggregate stats: total ideas, profitable %, median return, best call, worst call

POST /api/admin/alpha-desk/run
     → admin-gated trigger for a pipeline run (Bearer ADMIN_TOKEN)
```

Rate-limit the public endpoints at 60/min (match existing tier). Idempotency: if a run for today+chain already succeeded, return that run instead of triggering a new one.

### 2.5 Env vars

Add to `.env.example`:

```
# Alpha Desk
MOONSHOT_API_KEY=
MOONSHOT_MODEL=kimi-k2-thinking-turbo
OPENAI_API_KEY=
OPENROUTER_API_KEY=
GITHUB_TOKEN=
SOCIALDATA_API_KEY=
ADMIN_TOKEN=
ALPHA_DESK_MAX_RUNS_PER_DAY=2
```

Document each in the README section you'll add in Phase 5.

---

## Phase 3 — Scheduled worker and GitHub Actions

### 3.1 Render worker

Add a new Render worker `simfi-alpha-desk`, sibling to the existing `simfi-bot` worker. Entry point: `server/services/alphaDesk/worker.ts`. Responsibilities:

- On startup, check if today's run for each chain has completed. If not, trigger it.
- Every 6 hours, measure outcomes (1h/6h/24h/7d price deltas) for ideas from the last 7 days that haven't been measured yet.

The worker shares the SimFi Postgres database — no separate DB.

### 3.2 GitHub Actions

Migrate the daily pipeline workflow from Trailblazer. Rename to `.github/workflows/alpha-desk-daily.yml`. Schedule: `0 13 * * *` (13:00 UTC, ~9am ET, before US market-hours memecoin activity peaks). The workflow POSTs to `/api/admin/alpha-desk/run` with the admin bearer token.

Do NOT migrate Trailblazer's narrative-report workflow or its spike-detector workflow. Those are explicitly out of scope for Alpha Desk v1.

### 3.3 Cost guard

Enforce `ALPHA_DESK_MAX_RUNS_PER_DAY` (default 2) as a hard cap per chain per day. If exceeded, the admin endpoint returns HTTP 429. This prevents runaway LLM costs if the cron misfires or someone retries manually.

---

## Phase 4 — Frontend: Alpha Desk UI

### 4.1 Landing page integration

On `/` (the landing page from the screenshot you already have), add a new section below the hero and above the leaderboard: **"Today's Alpha Desk"**. Three cards in a row on desktop, stacked on mobile.

Each card renders:

- Top row: token symbol (display font), chain chip, rank badge (1/2/3), confidence as a horizontal bar (not a raw number — visual cue).
- Narrative thesis: one sentence, editorial serif headline style.
- "Why now": 1-2 sentences, body text.
- Price at publish → current: `$0.000042 → $0.000067 (+59.5%)`, using `formatUsd` and `formatPct`. Color by gain/loss tokens (muted emerald/oxblood).
- Risk flags row: 2-4 pill chips for liquidity, holder concentration, token age. Color-coded green/yellow/red.
- CTA: "Paper Trade" button → opens the trade modal pre-filled with this token on the correct chain.

Data source: `GET /api/alpha-desk/today?chain={currentChain}`.

### 4.2 Dedicated page

New route `/alpha-desk`. Deep view:

- Header: "Alpha Desk — AI-curated memecoin signals on Base and Solana".
- Today's 3 picks (same cards as landing, larger).
- Track record card: "Last 30 days: X of Y calls profitable at 24h horizon | Median return: +Z% | Best call: +N% | Worst call: -M%". Uses `/api/alpha-desk/track-record`.
- History list: scroll through past days' picks with outcomes. Each row shows the date, the 3 tokens, and their 24h/7d return.
- Methodology collapse: plain-language explanation of how picks are generated. Short. No builder-speak. "We track social momentum, developer activity, on-chain liquidity trends, and token age. Our AI agent weighs these signals, clusters the strongest candidates, and surfaces the top three each day."

### 4.3 Trade page integration

On `/trade`, add a small "Alpha Desk Pick" banner above the trending list when one of today's ideas matches the current chain. One-line teaser, click to open the Alpha Desk page.

### 4.4 Navigation

Add "Alpha Desk" to the main nav between Trending and Leaderboard.

### 4.5 Design rules

- Use the existing `tokens.css` + `typography.css`. No new color tokens.
- Confidence bar: use `--accent-premium` (champagne) for high-confidence fill, `--text-tertiary` for background.
- Track-record numbers in mono tabular.
- No emoji.
- `prefers-reduced-motion` respected — no animated score bars if reduced motion is set.

---

## Phase 5 — Documentation and verification

### 5.1 README section

Add an "Alpha Desk" section to the SimFi README documenting: what it is, how it works, env var setup, how to trigger a manual run, how GitHub Actions schedules it, how to customize the chain allowlist.

### 5.2 FUTURE_HOOKS.md update

Add entries for deferred work:
- Weekly Trenches Watch narrative reports (repurposed from Trailblazer's narrative-report code — not migrated now but documented as future scope).
- Real-time spike detector (Trailblazer has the code; deferred).
- Additional chains beyond Base and Solana.

### 5.3 Verification

Record in `FIX_EVIDENCE.md` under headings "Phase 2", "Phase 3", "Phase 4":

**Phase 2 — backend:**

```bash
# Type check
npx tsc --noEmit

# Build
npm run build

# Migration applied
npm run db:push
psql $DATABASE_URL -c "\d alpha_desk_runs"
psql $DATABASE_URL -c "\d alpha_desk_ideas"
psql $DATABASE_URL -c "\d alpha_desk_idea_outcomes"
```

**Phase 3 — pipeline:**

```bash
# Trigger a manual run (Base)
curl -X POST http://localhost:5000/api/admin/alpha-desk/run \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"chain":"base"}'

# Verify the run succeeded
curl -sS "http://localhost:5000/api/alpha-desk/today?chain=base" | jq .

# Verify the response has exactly 3 ideas with populated fields
```

Paste the response JSON into `FIX_EVIDENCE.md`. Confirm:

- `ideas.length === 3`
- Every idea has non-empty `narrativeThesis`, `whyNow`, numeric `confidenceScore`, non-empty `riskFlags`.
- `priceAtPublishUsd` is a real decimal, not zero.

**Phase 4 — frontend:**

- Screenshot of the landing page showing the Alpha Desk section with 3 real cards.
- Screenshot of `/alpha-desk` with the track record card.
- Screenshot of clicking "Paper Trade" on a card and landing in the pre-filled trade modal.

---

## Quality gates (done definition)

- [ ] Phase 0 regression fixed and verified with before/after screenshot.
- [ ] `TRAILBLAZER_AUDIT.md` committed with complete file classifications and migration plan.
- [ ] New Drizzle tables exist, applied via migration, verified with `\d` in psql.
- [ ] No Prisma anywhere in SimFi. No duplicate ORMs.
- [ ] `server/services/alphaDesk/` implements the full pipeline with all subfolders from Section 2.2.
- [ ] No Sui, TON, Arbitrum, Avalanche, BNB, Polygon, Aptos, Ethereum logic or constants remain from Trailblazer. Base and Solana only.
- [ ] No DeFiLlama calls remain. DexScreener replaces it.
- [ ] No narrative-report or action-pack code is present in SimFi.
- [ ] Admin-gated `/api/admin/alpha-desk/run` requires `Authorization: Bearer $ADMIN_TOKEN`.
- [ ] Cost guard enforces `ALPHA_DESK_MAX_RUNS_PER_DAY` per chain.
- [ ] GitHub Actions workflow `alpha-desk-daily.yml` runs via cron and hits the admin endpoint.
- [ ] Render worker `simfi-alpha-desk` is configured (document in README even if not yet deployed).
- [ ] Landing page, `/alpha-desk`, and `/trade` all integrate Alpha Desk per Section 4.
- [ ] "Paper Trade" button on a card correctly opens the trade modal pre-filled for the right chain and token.
- [ ] Track-record endpoint returns real stats, not fabricated numbers.
- [ ] `tsc --noEmit` passes.
- [ ] `npm run build` passes.
- [ ] No new `any` types in added code.
- [ ] No secrets in client code. `.env.example` updated.
- [ ] `FIX_EVIDENCE.md` updated with phase-by-phase proof.

---

## If you get stuck

Flag these in `BLOCKERS.md` instead of patching around them:

- Trailblazer's scoring code depends on a library or API that is unavailable or unlicensed in this environment.
- Moonshot API is unreachable from SimFi's hosting — flag before changing providers.
- `SOCIALDATA_API_KEY` is not provided. The pipeline should still work in degraded mode (dev + market signals only); flag that the social signal is absent in run metadata (`sourcesUsed.socialdata = false`).
- `GITHUB_TOKEN` is not provided. Same — degraded mode, dev weight redistributed to social and market.
- A SimFi convention (Drizzle pattern, auth middleware, rate-limit tier) conflicts with a Trailblazer assumption. Resolve in favor of SimFi's convention; flag the deviation.

---

## Final reminder

Every file you ship must be real, runnable, and wired to the actual SimFi backend and DB. No placeholders, no stubs, no fabricated data. Alpha Desk ideas must come from the real pipeline; the track record must be computed from real outcomes. If the pipeline can't produce 3 ideas on a given day, the UI shows an honest "No picks available today" state — not filler.

This is the investor-demo feature. Ship it like one.
