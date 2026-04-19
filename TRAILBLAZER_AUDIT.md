# Trailblazer Audit — Alpha Desk Migration

## 1.1 Repo Inventory

### Top-Level Tree (2 levels deep)

```
trailblazer-scratch/
├── .git/
├── .github/
│   └── workflows/
├── apps/
│   └── web/
├── archive/
│   ├── scripts/
│   ├── worker/
│   └── workflows/
├── audit/
├── docs/
│   └── plans/
├── fixtures/
├── packages/
│   └── shared/
└── scripts/
```

### Package Layout

| Directory | Purpose |
|-----------|---------|
| **`apps/web/`** | Next.js 14 dashboard. Contains the full UI (App Router pages), API routes, Prisma schema/seed scripts, and all data-pipeline scripts (narrative detection, token ideas, spike detection). |
| **`packages/shared/`** | Shared TypeScript package (`@narrative-hunter/shared`). Common types, constants, and utilities consumed by `apps/web`. |
| **`fixtures/`** | Static demo / seed data used for dry-runs and local development. Pre-computed embeddings, mock signals, projects corpus, tracked protocols. |
| **`archive/`** | Old Python worker scripts and retired workflows. |
| **`scripts/`** | Python helper for generating the projects fixture. |
| **`docs/plans/`** | Planning docs. |

### Workspace `package.json` Scripts

#### Root (`solana-narrative-hunter`)

| Script | Description |
|--------|-------------|
| `dev` | Starts the Next.js dev server via the `web` workspace filter. |
| `build` | Builds the `web` workspace for production. |
| `db:up` | Spins up a local PostgreSQL container via Docker Compose. |
| `db:migrate` | Runs Prisma migrations inside the `web` workspace. |
| `db:generate` | Generates the Prisma client inside the `web` workspace. |
| `db:push` | Pushes the Prisma schema to the database without migrations. |
| `seed:demo` | Seeds the database with demo fixture data. |
| `worker:run` | Runs the legacy Python fortnight worker (`archive/worker/run_fortnight.py`). |
| `setup` | One-shot local bootstrap: install → DB up → push → generate → seed. |
| `lint` | Lints the `web` workspace with ESLint. |
| `typecheck` | Type-checks the `web` workspace with `tsc --noEmit`. |
| `format` | Formats the entire repo with Prettier. |

#### `apps/web/`

| Script | Description |
|--------|-------------|
| `dev` | Starts the Next.js 14 development server. |
| `build` | Generates the Prisma client and then builds the Next.js app. |
| `start` | Starts the production Next.js server. |
| `lint` | Runs Next.js ESLint. |
| `prisma:generate` | Generates the Prisma client from the schema. |
| `prisma:migrate` | Creates/runs a Prisma migration named `init`. |
| `prisma:push` | Pushes the schema to the connected database. |
| `db:seed` | Executes `prisma/seed.ts` via `tsx`. |
| `typecheck` | Runs TypeScript in no-emit mode. |
| `pipeline:run` | Executes the full narrative detection pipeline (`src/scripts/run-pipeline.ts`). |
| `pipeline:run:dry` | Runs the narrative pipeline in demo mode using fixture data. |
| `spike:detect` | Runs the daily spike detector script (`src/scripts/spike-detector.ts`). |
| `daily:token-ideas` | Runs the daily Twitter token-ideas pipeline (`src/lib/pipeline/run-daily-tokens.ts`). |

#### `packages/shared/`

| Script | Description |
|--------|-------------|
| `typecheck` | Runs TypeScript in no-emit mode for shared types/constants. |

### GitHub Actions Workflows

| Workflow | Triggers | Cron | Description |
|----------|----------|------|-------------|
| `ci.yml` | `pull_request` to `main`, `push` to `main` | — | Installs deps, generates Prisma client, runs lint → typecheck → build. |
| `daily-token-ideas.yml` | Scheduled + `workflow_dispatch` | `0 7 * * *` (07:00 UTC) | Runs `pnpm --filter web daily:token-ideas` to generate the daily token-ideas report. |
| `pipeline.yml` | Scheduled + `workflow_dispatch` | `0 6 */3 * *` (every 3 days at 06:00 UTC) | Runs the full narrative detection pipeline (`pipeline:run`). Supports custom `period_start`/`period_end` inputs. |
| `spike-detector.yml` | Scheduled + `workflow_dispatch` | `0 8 * * *` (08:00 UTC) | Runs the daily spike detector (`spike:detect`). |

Workflow secrets consumed: `DATABASE_URL`, `MOONSHOT_API_KEY`, `SOCIALDATA_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `GITHUB_TOKEN`, `ADMIN_TOKEN`, `REPOSITORY_URL`.

---

## 1.2 Data Model

### Prisma Schema Models

| Model | Purpose |
|-------|---------|
| **`Report`** | Parent container for a report-generation run over a time period. Tracks status (`pending` → `processing` → `complete` → `failed`), included chains, links to child artifacts. |
| **`Entity`** | Registry of discovered entities (program, repo, token, keyword, protocol). Stores unique key, label, first/last seen, metrics JSON, embedding vector (`Float[]`). |
| **`Candidate`** | Scored intersection of an `Entity` within a specific `Report`. Holds per-report ML features: `momentum`, `novelty`, `quality`, `totalScore`, `featuresJson`. |
| **`Narrative`** | Detected narrative/theme extracted from a `Report`. Contains headline, summary, narrative-level scores, chain scope, relations to evidence/investigation/ideas. |
| **`NarrativeEvidence`** | Supporting artifacts for a `Narrative` (on-chain data, dev signals, social posts, IDL diffs, dependency changes). |
| **`InvestigationStep`** | Audit trail of agent/tool actions taken during narrative investigation. |
| **`Idea`** | **Builder-facing** output attached to a `Narrative`. Product pitch, target user, MVP scope, `whyNow`, validation notes, saturation analysis, pivot advice, action-pack files, target chain(s). |
| **`DailyTokenIdeaReport`** | Parent container for **Daily Token Ideas** — one record per calendar day (`reportDate`). Tracks generation status and runtime metadata. |
| **`DailyTokenIdea`** | Individual token pick inside a `DailyTokenIdeaReport`. Stores rank, narrative title, token name/ticker, thesis, 24h rationale, Twitter evidence, risk flags, confidence, category. |
| **`Protocol`** | Master registry of known blockchain protocols. Identifier, label, chain(s), category, program IDs, external IDs (GitHub, CoinGecko, DeFiLlama). |
| **`KOL`** | Registry of Key Opinion Leaders. Handle, display label, category, followed chains, tier, active flag. |
| **`TokenIdea`** | Token picks tied to the general `Report` model (not the daily feature). Stores date, chain, token metadata, narrative, signals, momentum score, risk level/flags, category, lifecycle status. |
| **`ApiRateLimit`** | Rate-limiting bucket. Composite PK on `rateKey` + `bucketStart`. |
| **`LlmProviderFailoverState`** | Operational health tracker for LLM providers. Consecutive errors, cooldown windows, disablement state, last failure time. |

### Relevant to Daily Token Ideas

- **`DailyTokenIdeaReport`** — daily parent record
- **`DailyTokenIdea`** — individual ranked token ideas

> `TokenIdea` is **not** part of the Daily Token Ideas pipeline — it belongs to the general `Report` cycle and links to `Report.id`.

### Narrative-Report Specific (can be dropped)

- **`Narrative`** — builder-facing report output
- **`NarrativeEvidence`** — child evidence of `Narrative`
- **`InvestigationStep`** — audit trail for `Narrative`
- **`Idea`** — build ideas / action packs child of `Narrative`

> `Report`, `Candidate`, `Entity`, `TokenIdea` are shared infrastructure for the overall report pipeline. Only drop if killing the entire reporting engine.

### Enums

```prisma
enum Chain {
  SOLANA
  ETHEREUM
  BASE
  ARBITRUM
  SUI
  TON
  AVALANCHE
  BNB
  POLYGON
  APTOS
}
```

Reused across `Report.chains`, `Narrative.chains`, `Protocol.chain`, `KOL.chains`, `TokenIdea.chain`. `DailyTokenIdea` stores `category` as raw `String`.

---

## 1.3 Pipeline Anatomy

### Entry Points

**A. Main pipeline (GitHub Actions + CLI)**
- Workflow: `.github/workflows/daily-token-ideas.yml` → `pnpm --filter web daily:token-ideas`
- Script: `apps/web/package.json` → `tsx ... src/lib/pipeline/run-daily-tokens.ts`
- Runner: `apps/web/src/lib/pipeline/run-daily-tokens.ts` → `runPipeline({ reportType: 'daily_tokens' })`
- Core orchestrator: `apps/web/src/lib/pipeline/index.ts` — `runPipeline()` branches at line 883 for token ideas

**B. Standalone Twitter-only pipeline (legacy)**
- Script: `apps/web/src/scripts/run-daily-token-ideas.ts`
- Calls `runDailyTwitterTokenIdeas()` in `apps/web/src/lib/pipeline/daily-token-ideas/index.ts`
- Skips clustering/GitHub/RSS — straight Twitter → scoring → LLM → persistence

**C. Admin endpoint**
- `GET/POST /api/admin/run-daily-tokens` — status check, requires `Bearer ADMIN_TOKEN`

### Ingestion Sources

**Main pipeline (`ingest.ts` → `ingestSignals()`)**

| Source | File | API |
|--------|------|-----|
| GitHub | `ingestors/github.ts` | GitHub REST API v3 (`commits`, `releases`, `contributors`) |
| Twitter/X | `ingestors/twitter-socialdata.ts` | SocialData.tools API (`/twitter/search`) |
| RSS/Social | `ingestors/social.ts` | RSS feeds (crypto blogs) |
| On-Chain/TVL | `ingestors/onchain.ts` | DeFiLlama (`protocols`, `/protocol/{slug}`) |
| DEXScreener | `ingestors/onchain.ts` | `token-boosts/latest`, `/latest/dex/search`, `/latest/dex/tokens/{addr}` |
| GeckoTerminal | `ingestors/onchain.ts` | `/networks/{network}/trending_pools` |
| World News | `ingestors/world-news.ts` | Reddit, GNews (optional), NewsAPI (optional) |

**Standalone pipeline**
- Only Twitter/SocialData (`ingestors/twitter-socialdata.ts`).

### Scoring Logic

**Protocol-level scoring (`scoring.ts:253` — `scoreProtocols()`)**

Z-score:
```ts
function zScore(current: number, baseline: number): number {
  if (baseline === 0) return current > 0 ? 2.0 : 0;
  const z = (current - baseline) / Math.max(baseline, 0.001);
  return Math.max(-5, Math.min(5, z));
}
```

Weights (`WEIGHTS`, line 105):
- `z_commits`: 0.20
- `z_stars_delta`: 0.15
- `z_new_contributors`: 0.10
- `z_releases`: 0.05
- `z_mentions_delta`: 0.15
- `z_unique_authors`: 0.10
- `z_engagement_delta`: 0.10
- `z_tvl_velocity`: 0.15

Novelty bonus (`computeNovelty`, line 124):
- `daysOld <= 60`: `1.3 - 0.3 * (daysOld / 60)` (linear decay 1.3 → 1.0)
- Otherwise: 1.0

Quality penalty (`computeQualityPenalty`, line 134):
- >80% snippets classified `"hype"` → penalty = 0.7x

Cross-chain bonus (`computeCrossChainBonus`, line 237):
- 2+ chains = 1.2x
- 3+ chains = 1.4x

Final score: `totalScore = momentum * noveltyMult * qualityMult * crossChainBonus`

**Daily narrative scoring (`daily-token-ideas/scoring.ts:7`)**
```ts
const momentum = candidate.mentionCount * 1.8;
const engagement = Math.log10(candidate.engagementTotal + 1) * 8;
const diversity = Math.min(20, candidate.uniqueAuthors * 2.5);
const concentrationPenalty = candidate.uniqueAuthors <= 1 ? 15 : 0;
const score = momentum + engagement + diversity - concentrationPenalty;
```

### Clustering Step

- File: `clustering.ts:43` — `agglomerativeCluster()`
- Algorithm: Agglomerative clustering with average linkage, cosine similarity
- Threshold: 0.45, max clusters: 10
- Embedding: `simpleTextEmbed()` (character trigram hashing, 384 dims)
- **Narrative reports**: YES
- **Daily token ideas**: NO (standalone path skips it; main path bypasses clusters for top-10 social signals)

### LLM Orchestration

- Client: `apps/web/src/lib/llm/moonshot.ts`
- Provider chain (`resolveProviders()`, line 251):
  1. **Moonshot** (primary) — `MOONSHOT_API_KEY`, model `kimi-k2-turbo-preview`
  2. **OpenAI** (fallback) — `OPENAI_API_KEY`
  3. **OpenRouter** (fallback) — `OPENROUTER_API_KEY`
- Failover: `callLLM()` iterates providers. Exponential cooldown: 15s → 60s → 3m → 10m. Billing errors get 5h → 10h → 20h → 24h.
- Failure state persisted to `LlmProviderFailoverState` table.
- Prompts: **inline strings** inside `moonshot.ts`. Daily token ideas prompt in `generateDailyTokenIdeas()` (lines 960–1102).
- System prompt (line 1022): "alpha discovery analyst and crypto meme strategist", generate 2 utility + 2–3 meme coins.
- Schema validation: `DailyTokenIdeasResponseSchema` (`schemas.ts:108`). JSON repair fallback exists.

### Output Persistence

**Main pipeline** → writes to `TokenIdea` table (`index.ts:916–937`):
- `date`, `chain`, `tokenName`, `ticker`, `tokenAddress`, `narrative`, `whyNow`, `twitterSignals`, `onChainSignals`, `momentumScore`, `riskLevel`, `riskFlags`, `category`, `status`, `reportId`

**Standalone pipeline** → writes to `DailyTokenIdeaReport` + `DailyTokenIdea` (`daily-token-ideas/persistence.ts:9`):
- `DailyTokenIdeaReport`: `reportDate` (unique), `status`, `runtimeJson`
- `DailyTokenIdea`: `reportId`, `rank` (1–3), `narrativeTitle`, `tokenName`, `ticker`, `thesis`, `whyNow24h`, `twitterEvidence`, `riskFlags`, `confidence`, `category`
- Exactly 3 ideas produced (`ideas.length !== 3` throws).

### API Endpoints

| Route | File | Behavior |
|-------|------|----------|
| `GET /api/token-ideas/daily` | `app/api/token-ideas/daily/route.ts` | Latest complete report with `tokenIdeas` array. Supports `?chain=SOLANA`. |
| `GET /api/token-ideas/history` | `app/api/token-ideas/history/route.ts` | Last N days (`?days=7`, max 30). Supports `?chain=SOLANA`. |
| `GET/POST /api/admin/run-daily-tokens` | `app/api/admin/run-daily-tokens/route.ts` | Admin status check. Requires `Bearer ADMIN_TOKEN`. |

---

## 1.4 Dependencies

### Runtime Dependencies That MUST Come Over

| Dependency | Version | Reason | Required? |
|-----------|---------|--------|-----------|
| `@prisma/client` | `^5.14.0` | ORM for all DB access. **Conflict:** SimFi uses Drizzle. Must Drizzle-ify or add Prisma. | Yes (unless rewritten) |
| `prisma` | `^5.14.0` | Prisma CLI. | Yes (unless rewritten) |
| `swr` | `^2.4.1` | Frontend data-fetching. **Conflict:** SimFi uses `@tanstack/react-query`. Must rewrite hooks. | Yes (unless rewritten) |

### Dependencies to DROP (Trailblazer-Only)

| Dependency | Reason |
|-----------|--------|
| `next` | Next.js framework. SimFi uses Vite + Express + `wouter`. |
| `archiver` | Builder action-pack ZIP generation. Not used by Daily Token Ideas. |
| `sharp` | Next.js image optimization. |
| `eslint` / `eslint-config-next` | Next.js lint tooling. |
| `tsconfig-paths` | Next.js path aliases in CLI scripts. |

### Dependencies SimFi Already Has (Reuse)

| Dependency | SimFi Version | Trailblazer Version |
|-----------|---------------|---------------------|
| `react` | `^18.3.1` | `^18.3.1` |
| `react-dom` | `^18.3.1` | `^18.3.1` |
| `zod` | `^3.24.2` | `^3.23.0` |
| `lucide-react` | `^0.453.0` | `^0.379.0` |
| `tailwind-merge` | `^2.6.0` | `^2.3.0` |
| `tailwindcss-animate` | `^1.0.7` | `^1.0.7` |
| `clsx` | `^2.1.1` | `^2.1.1` |
| `class-variance-authority` | `^0.7.1` | `^0.7.0` |
| `framer-motion` | `^11.18.2` | `^11.1.7` |
| `typescript` | `5.6.3` | `^5.4.5` |
| `tsx` | `^4.20.5` | `^4.21.0` |
| `tailwindcss` | `^3.4.17` | `^3.4.3` |
| `postcss` | `^8.4.47` | `^8.4.38` |
| `autoprefixer` | `^10.4.20` | `^10.4.19` |

---

## 1.5 Environment Variables

### Required for Daily Token Ideas

| Env Var | Used In | SimFi Equivalent? |
|---------|---------|-------------------|
| `DATABASE_URL` | `prisma.ts`, `config.ts`, `rate-limit.ts` | ✅ `DATABASE_URL` |
| `MOONSHOT_API_KEY` | `config.ts` | ❌ None |
| `SOCIALDATA_API_KEY` | `config.ts`, `twitter-socialdata.ts` | ❌ None |
| `ADMIN_TOKEN` | `config.ts`, admin API routes | ❌ SimFi uses `JWT_SECRET` + `SESSION_SECRET` |

### Optional / Fallback LLM

| Env Var | Default | Required? | SimFi Equivalent? |
|---------|---------|-----------|-------------------|
| `MOONSHOT_MODEL` | `kimi-k2-thinking-turbo` | No | ❌ None |
| `MOONSHOT_BASE_URL` | `https://api.moonshot.ai/v1/chat/completions` | No | ❌ None |
| `OPENAI_API_KEY` | — | No (fallback) | ❌ None |
| `OPENAI_MODEL` | `gpt-4.1-mini` | No | ❌ None |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1/chat/completions` | No | ❌ None |
| `OPENROUTER_API_KEY` | — | No (fallback) | ❌ None |
| `OPENROUTER_MODEL` | `openai/gpt-4.1-mini` | No | ❌ None |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1/chat/completions` | No | ❌ None |
| `LLM_PROVIDER_ORDER` | `moonshot,openai,openrouter` | No | ❌ None |
| `LLM_FAILOVER_PERSIST_STATE` | `true` | No | ❌ None |
| `LLM_FAILOVER_STATE_SYNC_MS` | `60000` | No | ❌ None |
| `LLM_REQUEST_CONCURRENCY` | `2` | No | ❌ None |

### Pipeline Infrastructure (Optional)

| Env Var | Default | Required? |
|---------|---------|-----------|
| `PIPELINE_LOCK_NAME` | `trailblazer_fortnight_pipeline` | No |
| `PIPELINE_LOCK_TTL_MS` | `5400000` | No |
| `PIPELINE_ALERT_ENABLED` | `false` | No |
| `PIPELINE_ALERT_WEBHOOK_URLS` | — | No |
| `PIPELINE_ALERT_FORMAT` | `generic` | No |
| `PIPELINE_ALERT_TIMEOUT_MS` | `10000` | No |
| `PIPELINE_ALERT_RETRY_ATTEMPTS` | `3` | No |

### Ingestion Quality Gate (Optional)

| Env Var | Default | Required? |
|---------|---------|-----------|
| `INGEST_QUALITY_ENFORCE` | `true` | No |
| `INGEST_QUALITY_MIN_SOURCE_SCORE` | `0.45` | No |
| `INGEST_QUALITY_MIN_HEALTHY_SOURCES` | `2` | No |
| `INGEST_QUALITY_MIN_AGGREGATE_SCORE` | `0.55` | No |
| `INGEST_QUALITY_MAX_DEGRADED_SOURCES` | `1` | No |
| `INGEST_QUALITY_SOURCE_MIN_SCORES` | — | No |

### World News / Meme Fuel (Optional)

| Env Var | Default | Required? |
|---------|---------|-----------|
| `GNEWS_API_KEY` | — | No |
| `NEWS_API_KEY` | — | No |
| `REDDIT_USER_AGENT` | `TrailblazerBot/1.0` | No |

### Daily Token Ideas Config (Optional)

| Env Var | Default | Required? |
|---------|---------|-----------|
| `DAILY_TOKEN_CHAINS` | All Prisma `Chain` enum | No |
| `DEMO_MODE` | `true` if no LLM keys | No |

### Trailblazer-Only (Not Needed)

| Env Var | Why Not Needed |
|---------|---------------|
| `GITHUB_TOKEN` | Daily Token Ideas uses Twitter + on-chain only. |
| `GITHUB_REPOSITORY` | Admin route repo linking UI. |
| `GITHUB_REPOSITORY_URL` | Admin route repo linking UI. |
| `NEXT_PUBLIC_SITE_URL` | Next.js metadata. |
| `REPOSITORY_URL` | Next.js metadata. |

---

## 1.6 File Classifications

### `apps/web/src/lib/pipeline/` (29 files)

| File | Classification | Reason |
|------|---------------|--------|
| `__tests__/daily-token-ideas.generation.test.ts` | REFERENCE | Tests token-idea generation logic; useful pattern but tied to Trailblazer LLM prompts. |
| `__tests__/daily-token-ideas.read-latest.test.ts` | REFERENCE | Tests safe DB reading; read for graceful-degradation pattern. |
| `__tests__/daily-token-ideas.schemas.test.ts` | REFERENCE | Tests Zod schema validation; read for test approach. |
| `__tests__/daily-token-ideas.scoring.test.ts` | REFERENCE | Tests narrative scoring math; read for test fixtures and assertions. |
| `__tests__/daily-token-ideas.ui-mapper.test.ts` | REFERENCE | Tests UI data mapping; trivial. |
| `alerts.ts` | MIGRATE | Generic webhook failure alerting; drop-in utility. |
| `clustering.ts` | REFERENCE | Agglomerative clustering algorithm; excellent reference but tied to narrative use case. |
| `confidence.ts` | REFERENCE | Evidence-diversity confidence math; read for scoring model. |
| `daily-token-ideas/index.ts` | ADAPT | Core daily token-idea runner; valuable alpha feature, needs SimFi schema. |
| `daily-token-ideas/mapper.ts` | ADAPT | Type-safe record mapper; part of daily-token-ideas pipeline. |
| `daily-token-ideas/persistence.ts` | ADAPT | DB persistence for daily token ideas; rewrite for SimFi's Drizzle. |
| `daily-token-ideas/read-latest.ts` | ADAPT | Safe DB read with missing-table handling; useful pattern. |
| `daily-token-ideas/scoring.ts` | ADAPT | Simple Twitter narrative scoring; rewrite with SimFi's token-centric weights. |
| `daily-token-ideas/types.ts` | ADAPT | TypeScript types for daily token ideas; remap to SimFi types. |
| `ingest.ts` | REFERENCE | Signal ingestion orchestrator with quality gates; read for merge/quality patterns. |
| `ingestors/defillama.ts` | DROP | Hard-coded DeFiLlama slug mapping for 10-chain protocol TVL. |
| `ingestors/github.ts` | REFERENCE | GitHub API dev-signal ingestor; read for rate-limit handling and commit-baseline logic. |
| `ingestors/onchain.ts` | DROP | Multi-chain DEXScreener/GeckoTerminal fetcher; explicit 10-chain coverage. |
| `ingestors/social.ts` | DROP | Multi-chain RSS feed parser with chain keyword detection; 10-chain specific. |
| `ingestors/twitter-socialdata.ts` | DROP | Multi-chain Twitter keyword search via SocialData; 10-chain query matrix. |
| `ingestors/twitter.ts` | DROP | Nitter KOL scraper tied to Trailblazer's Solana KOL list and narrative pipeline. |
| `ingestors/world-news.ts` | ADAPT | Reddit/GNews fetcher for meme-coin fuel; concept valuable, rewrite sources. |
| `lock.ts` | MIGRATE | DB-backed distributed lock with heartbeat; generic infrastructure. |
| `opportunity.ts` | REFERENCE | Multi-factor opportunity scoring; read for weighted composite math. |
| `protocols.ts` | DROP | Canonical 10-chain hardcoded protocol registry. |
| `run-daily-tokens.ts` | ADAPT | CLI entry point for daily token ideas; adapt to SimFi's runner conventions. |
| `scoring.ts` | REFERENCE | Z-score and chain-baseline scoring engine; read for statistical methods. |
| `velocity.ts` | ADAPT | Time-series velocity/acceleration tracking; directly applicable to token momentum alpha. |
| `index.ts` | REFERENCE | Monolithic narrative-report pipeline; read for orchestration patterns. |

### `apps/web/src/lib/llm/` (3 files)

| File | Classification | Reason |
|------|---------------|--------|
| `moonshot.ts` | ADAPT | Gold-standard provider failover + JSON repair + batched LLM calls; mixed with narrative-specific prompts. |
| `provider-failover-store.ts` | MIGRATE | Prisma persistence for LLM failover state; generic reliability layer. |
| `schemas.ts` | ADAPT | Zod schema patterns excellent, but shapes tied to narrative/action-pack/token-idea models. |

### `apps/web/src/app/api/` (12 routes)

| Route | Classification | Reason |
|-------|---------------|--------|
| `admin/run-daily-tokens/route.ts` | ADAPT | Admin status endpoint for daily token pipeline; adapt auth and DB queries. |
| `admin/run-fortnight/route.ts` | DROP | Admin endpoint for fortnightly narrative reports. |
| `chains/[chain]/protocols/route.ts` | DROP | Per-chain protocol listing with scores; 10-chain coverage. |
| `chains/momentum/route.ts` | DROP | Per-chain momentum aggregation; 10-chain coverage. |
| `explore/route.ts` | ADAPT | Search across entities/narratives/token ideas; adapt to SimFi's token/leaderboard search. |
| `ideas/[id]/action-pack.zip/route.ts` | DROP | ZIP download of builder action packs. |
| `narratives/[id]/route.ts` | DROP | CRUD fetch for narrative reports. |
| `reports/[id]/route.ts` | DROP | Full report fetch with nested narratives/evidence/ideas. |
| `reports/latest/route.ts` | DROP | Latest narrative report fetch. |
| `reports/route.ts` | DROP | Report listing with runtime health. |
| `token-ideas/daily/route.ts` | ADAPT | Daily token ideas API; adapt to SimFi's schema and caching. |
| `token-ideas/history/route.ts` | ADAPT | Token idea history API; adapt date range and chain filter. |

### `apps/web/src/components/narrative/` (6 files)

| File | Classification | Reason |
|------|---------------|--------|
| `daily-token-ideas.tsx` | ADAPT | Token idea card grid UI; valuable Alpha Desk component, rewrite for SimFi design system. |
| `evidence-highlights.tsx` | DROP | Evidence highlight panel for narrative reports. |
| `evidence-list.tsx` | DROP | Grouped evidence list for narrative reports. |
| `idea-card.tsx` | DROP | Build-idea card with action-pack download CTA. |
| `investigation-trace.tsx` | DROP | Investigation step timeline visualizer. |
| `narrative-card.tsx` | DROP | Bento-grid narrative card with chain badges. |

### `packages/shared/src/` (1 file)

| File | Classification | Reason |
|------|---------------|--------|
| `index.ts` | ADAPT | Shared types/constants (feature keys, scoring weights, API shapes); adapt constants to SimFi's token model. |

---

## 1.7 Migration Plan

### Proposed SimFi Directory Structure

```
server/services/alphaDesk/
  index.ts                 # main entry: runDailyPipeline(chain)
  worker.ts                # Render worker entry point
  ingest/
    dexscreener.ts         # fetch trending + new pairs for a chain
    github.ts              # optional dev-signal ingestion
    socialdata.ts          # optional Twitter/KOL ingestion
    worldNews.ts           # optional Reddit/GNews meme fuel
  score/
    zscore.ts              # z-score computation vs chain baseline
    weights.ts             # 50/35/15 dev/social/market weights
    bonuses.ts             # novelty bonus + cross-chain bonus
    penalties.ts           # hype-only penalty
  cluster/
    embed.ts               # text embedding via Moonshot or OpenAI
    agglomerative.ts       # cosine-similarity agglomerative clustering
  llm/
    client.ts              # Moonshot primary, OpenAI/OpenRouter fallback
    prompts.ts             # prompt templates
    analyze.ts             # generate narrative thesis, why-now, risk flags
    schemas.ts             # Zod schemas for LLM output validation
  persist/
    runs.ts                # insert AlphaDeskRun rows
    ideas.ts               # insert AlphaDeskIdea rows
    outcomes.ts            # scheduled outcome measurement
  types.ts

client/src/pages/AlphaDesk.tsx       # dedicated Alpha Desk page
client/src/components/alpha-desk/    # landing cards, track-record, history list
shared/alphaDesk/
  schema.ts                # shared types for alpha desk (optional)
```

### ORM Decision

**Default to Drizzle.** SimFi already uses Drizzle ORM. Adding Prisma would fracture schema management. All Trailblazer DB code must be rewritten to Drizzle queries matching SimFi's existing `server/storage.ts` patterns.

### New Drizzle Schema Additions

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

### New API Endpoints

Add to SimFi's Express router (match `server/routes.ts` patterns):

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

Rate-limit public endpoints at 60/min. Idempotency: if a run for today+chain already succeeded, return that run instead of triggering a new one.

### GitHub Actions Workflow Changes

- **Migrate**: `.github/workflows/daily-token-ideas.yml` → rename to `.github/workflows/alpha-desk-daily.yml`
- **Schedule**: Change from `0 7 * * *` to `0 13 * * *` (13:00 UTC, ~9am ET)
- **Action**: POST to `/api/admin/alpha-desk/run` with `Bearer ADMIN_TOKEN`
- **Drop**: Do NOT migrate `pipeline.yml` (narrative reports) or `spike-detector.yml` (spike detector)

### Render Worker Setup

Add a new Render worker `simfi-alpha-desk`, sibling to `simfi-bot`:

- **Entry point**: `server/services/alphaDesk/worker.ts`
- **Responsibilities**:
  1. On startup, check if today's run for each chain has completed. If not, trigger it.
  2. Every 6 hours, measure outcomes (1h/6h/24h/7d price deltas) for ideas from the last 7 days that haven't been measured yet.
- **Database**: Shares the SimFi Postgres database — no separate DB.

### Key Architectural Decisions

1. **No Prisma.** All DB code written in Drizzle to match SimFi conventions.
2. **No `swr`.** All frontend data fetching uses SimFi's existing `@tanstack/react-query` + `useQuery` patterns.
3. **No Next.js.** UI components rewritten as React components for SimFi's Vite stack.
4. **Two chains only.** Hardcode `['base', 'solana']`. Drop all Sui, TON, Arbitrum, Avalanche, BNB, Polygon, Aptos, Ethereum logic.
5. **No DeFiLlama.** Replace with DexScreener liquidity + volume for memecoin-relevant signals.
6. **Drop cross-chain bonus.** Only 2 chains now — not meaningful.
7. **No narrative reports or action packs.** These are explicitly out of scope.
8. **Cost guard.** Enforce `ALPHA_DESK_MAX_RUNS_PER_DAY` (default 2) as a hard cap per chain per day.
