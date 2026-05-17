# SimFI Beta Deployment Checklist

Use this checklist before promoting to production. All items marked **CRITICAL** must be resolved. Items marked **RECOMMENDED** are best-practice but can be deferred.

---

## 1. Secrets & Environment Variables

- [ ] **CRITICAL** — `DATABASE_URL` is set and points to the production Postgres instance
- [ ] **CRITICAL** — `JWT_SECRET` is set to a cryptographically random string ≥ 32 chars (`openssl rand -hex 32`)
- [ ] **CRITICAL** — `BOT_API_SECRET` is set to a random string ≥ 20 chars
- [ ] **CRITICAL** — `ADMIN_TOKEN` is set to a random string ≥ 20 chars
- [ ] **CRITICAL** — `FRONTEND_URL` is set to the exact origin served to users (e.g. `https://simfi.fun`) — required for CORS
- [ ] **CRITICAL** — No live API keys exist in `.env.example` or git history. If any were committed, rotate them immediately.
- [ ] **RECOMMENDED** — `THE_ODDS_API_KEY` set for live sportsbook odds
- [ ] **RECOMMENDED** — `OPENAI_API_KEY` or `OPENROUTER_API_KEY` set for Alpha Desk AI ideas
- [ ] **RECOMMENDED** — `HELIUS_API_KEY` set for enhanced Solana RPC calls
- [ ] **RECOMMENDED** — `REDIS_URL` set if running multiple web instances (shared rate-limit state)
- [ ] **OPTIONAL** — `TELEGRAM_BOT_TOKEN` + `PUBLIC_URL` set to enable the Telegram bot

---

## 2. Database & Migrations

- [ ] **CRITICAL** — All migrations in `migrations/` have been applied in order (`npm run db:migrate`)
- [ ] **CRITICAL** — Migration `0012_add_user_indexes.sql` applied (positions and trade_history user indexes)
- [ ] **CRITICAL** — Verify `SELECT 1` succeeds on the production DB before starting the service
- [ ] **RECOMMENDED** — Take a DB snapshot before the first deploy

### Migration order
```
0001 → 0002 → ... → 0012_add_user_indexes.sql
```
Run: `npm run db:migrate`  
Migrations use `CREATE INDEX IF NOT EXISTS` guards — safe to re-run.

---

## 3. Build & CI

- [ ] **CRITICAL** — `npm run check` exits 0 (TypeScript typechecks pass)
- [ ] **CRITICAL** — `npm run test` exits 0 (31 Vitest smoke tests pass)
- [ ] **CRITICAL** — `npm run build` exits 0 with `DATABASE_URL` set (or a placeholder)
- [ ] **RECOMMENDED** — `npm run lint` has been reviewed; known issues tracked before enabling in CI
- [ ] **RECOMMENDED** — GitHub Actions CI workflow passes on the deployment branch

### render.yaml build command
```yaml
buildCommand: npm ci --include=dev && npm run build
```
The `--include=dev` flag is required: `NODE_ENV=production` on Render would otherwise cause npm to skip devDependencies (Vite, esbuild, TypeScript), breaking the build.

---

## 4. Security

- [ ] **CRITICAL** — CSRF double-submit is active: all state-changing routes check `X-CSRF-Token` vs cookie
- [ ] **CRITICAL** — JWT cookies are `HttpOnly`, `Secure` (in production), `SameSite=Strict`
- [ ] **CRITICAL** — Auth rate limiter active on `/api/auth/*` (20 req / 15 min / IP)
- [ ] **CRITICAL** — Trade rate limiters active: IP backstop (60/min) + user limiter (30/min)
- [ ] **CRITICAL** — `FRONTEND_URL` env var is the exact production origin — prevents CORS from being open to all origins
- [ ] **RECOMMENDED** — Review `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security` headers are set
- [ ] **RECOMMENDED** — Run `npm audit` and address Critical/High findings before go-live

---

## 5. Render Deployment

- [ ] **CRITICAL** — All `sync: false` env vars in `render.yaml` have been configured in the Render dashboard
- [ ] **CRITICAL** — Health check path `/api/health` returns `{ "status": "healthy" }` after deploy
- [ ] **RECOMMENDED** — Confirm the Render service uses the Standard plan (not Free) to avoid cold-start timeouts on trade endpoints
- [ ] **OPTIONAL** — Set up Render deploy notifications (Slack/email) for deploy failures

---

## 6. Functional Smoke Tests (Manual)

Run these after every deploy against the production URL:

- [ ] Register a new account and verify JWT cookie is set
- [ ] Log in and verify CSRF token is present in cookies
- [ ] Buy a token (SOL chain) — verify position appears in Portfolio
- [ ] Sell a partial position — verify balance and P&L update correctly
- [ ] Place a sportsbook paper bet — verify bet appears in My Bets
- [ ] Check `/api/health` returns `{ "status": "healthy" }` with `services` block
- [ ] Check `X-Request-ID` header appears on all `/api/*` responses
- [ ] On mobile (375px viewport): verify all pages have bottom padding so MobileNav doesn't overlap content
- [ ] Verify Leaderboard updates after a trade (leaderboard service is running)

---

## 7. Monitoring & Observability

- [ ] **RECOMMENDED** — Check server logs for `rid=` request IDs on errors (structured logging enabled)
- [ ] **RECOMMENDED** — Set up an uptime monitor for `/api/health` (e.g. UptimeRobot, BetterStack)
- [ ] **OPTIONAL** — Set `SENTRY_DSN` for error tracking (Sentry integration not yet wired — add `@sentry/node` to enable)
- [ ] **OPTIONAL** — Enable Render metrics / alerting for p99 response time and error rate

---

## 8. Pre-launch Lint Cleanup (before enabling lint in CI)

The following ESLint errors exist and should be fixed before enabling `npm run lint` in CI:

- `client/src/App.tsx` — unused `params` variable
- `client/src/components/ChainSelector.tsx` — unused `isBase` variable
- `client/src/components/CommandSearch.tsx` — unused `TrendingUp`, `formatCompactNumber` imports
- `client/src/components/TokenChart.tsx` — unused `tokenName`, `priceChange` variables
- `client/src/components/TradeModal.tsx` — unused `useCallback` import

These are dead-code warnings, not correctness issues. Fix them, then add `- run: npm run lint` to `.github/workflows/ci.yml`.

---

## Checklist Summary

| Category | Critical | Recommended | Optional |
|---|---|---|---|
| Secrets & Env | 5 | 4 | 1 |
| Database | 3 | 1 | 0 |
| Build & CI | 3 | 2 | 0 |
| Security | 5 | 2 | 0 |
| Render Deploy | 3 | 1 | 1 |
| Functional Smoke | 9 | 0 | 0 |
| Monitoring | 0 | 2 | 2 |
| Lint Cleanup | 0 | 5 | 0 |

**Minimum viable launch:** All 28 CRITICAL items checked.
