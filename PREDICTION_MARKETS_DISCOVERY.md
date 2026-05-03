# Prediction Markets Discovery Document

> Generated as PART 1 of the SimFi × Polymarket implementation brief.
> Every answer cites the exact file path and line number(s) where the fact was discovered.

---

## 1. Drizzle schema layout

**`shared/schema.ts` is a single file** (not a folder). Located at `/workspaces/SimFI/shared/schema.ts`.

The `bigNumeric` custom type is defined at **lines 6–16**:
```typescript
export const bigNumeric = customType<{ data: bigint }>({
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
```

Tables are exported **table-by-table** as individual named exports (`export const users = pgTable(...)` etc.). There is no barrel re-export of table objects; Drizzle config points directly at the file (`schema: "./shared/schema.ts"` in `drizzle.config.ts` line 9).

---

## 2. Drizzle migration command

The project **does not use `drizzle-kit generate`** in its npm scripts. The only migration-related script is:

- **`package.json` line 11**: `"db:push": "drizzle-kit push"`

There is **no `generate` script** defined. The existing migrations were written by hand or generated externally. For this feature we will run `npx drizzle-kit generate` to produce the SQL, then commit the output.

**Latest numbered migration filename**: `0009_session_security.sql` (`migrations/0009_session_security.sql`).

There are also unnumbered migrations after it (`add_achievements_referrals_follows_streaks.sql`, etc.), but the numbered sequence stops at `0009`. Therefore the next migration filename will be **`0010_prediction_markets.sql`**.

---

## 3. Route registration (Anchor Point #1)

In `server/index.ts`, the Express app is composed inside an async IIFE. The call that registers all routes (including `marketRoutes` internally) is:

**`server/index.ts` line 157**:
```typescript
const server = await registerRoutes(app);
```

The `registerRoutes` function lives in `server/routes.ts` and internally calls:

**`server/routes.ts` line 3707**:
```typescript
registerMarketRoutes(app, { authenticateToken, searchLimiter, publicApiLimiter });
```

**Anchor #1 insertion point**: In `server/index.ts`, immediately after line 157 (`const server = await registerRoutes(app);`), before the `app.use('/api', ...)` 404 handler at line 163.

---

## 4. Auth middleware

**JWT-verifying middleware**:
- **Import path**: `server/middleware/auth.ts`
- **Function name**: `authenticateToken` (lines 16–66)
- It reads `req.cookies.token` (HttpOnly cookie, path `/api`) and falls back to `Authorization` header.
- It verifies with `jwt.verify(token, secret, { algorithms: ['HS256'] })`.
- It checks `tokenVersion` against the DB for session invalidation.
- It attaches `req.userId` and `req.username`.

**CSRF-checking middleware**:
- **There is NO separate CSRF middleware exported.** CSRF double-submit cookie checking is **built into `authenticateToken`** at lines 26–34 of `server/middleware/auth.ts`:
```typescript
const isMutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
if (isMutation) {
  const csrfCookie = req.cookies.csrfToken;
  const csrfHeader = req.headers['x-csrf-token'];
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    return res.status(403).json({ error: 'CSRF token mismatch' });
  }
}
```

**Idempotency-key middleware / helper**:
- There is **no middleware** for idempotency. It is implemented as **inline helper functions** inside `server/routes.ts` at lines 792–835:
  - `getIdempotentResponse(userId, idempotencyKey)` (line 793)
  - `setIdempotentResponse(userId, idempotencyKey, response, statusCode)` (line 812)
  - `getIdempotencyKey(req)` (line 839)
- These are **not exported** from `routes.ts`.

---

## 5. Rate limiters

All rate limiters (`ipBackstopLimiter`, `authLimiter`, `userTradeLimiter`, `searchLimiter`, `publicApiLimiter`, `botLimiter`, `healthLimiter`) are defined inline in **`server/routes.ts` lines 123–194**.

They use a private helper `createRateLimiter` (line 113):
```typescript
function createRateLimiter(options: Parameters<typeof rateLimit>[0]) {
  return rateLimit({
    ...options,
    store: rateLimitStore, // may be undefined (falls back to MemoryStore)
  });
}
```

Key definitions:
- `userTradeLimiter` (lines 142–155): 30 req/min per user (`keyGenerator` uses `req.userId`)
- `publicApiLimiter` (lines 167–174): 60 req/min per IP
- `searchLimiter` (lines 157–164): 20 req/min per IP

They are **not exported** from `routes.ts`. The brief instructs creating a new limiter inside `predictionMarketRoutes.ts` rather than modifying the existing file.

---

## 6. Quote service contract

**File**: `server/services/quoteService.ts`

**Public API**:

| Function | Signature | Description |
|----------|-----------|-------------|
| `createQuote` | `(params: CreateQuoteParams) => Promise<QuoteResponse>` | Creates a server-authoritative quote with 10s TTL |
| `validateAndConsume` | `(quoteId: string, userId: string \| number) => Quote` | Validates ownership, expiry, then deletes and returns the quote |
| `getQuote` | `(quoteId: string, userId: string \| number) => Quote \| null` | Non-destructive peek at a quote |
| `getStats` | `() => { activeQuotes: number; usersWithQuotes: number }` | Diagnostic |
| `shutdown` | `() => void` | Clears cleanup interval |

**`CreateQuoteParams` shape** (lines 28–35):
```typescript
interface CreateQuoteParams {
  userId: string | number;
  tokenAddress: string;
  chain: Chain;
  side: 'buy' | 'sell';
  amountNative?: string;
  amountTokens?: string;
}
```

**`QuoteResponse` shape** (lines 37–48):
```typescript
interface QuoteResponse {
  quoteId: string;
  tokenAddress: string;
  side: 'buy' | 'sell';
  chain: Chain;
  priceNative: string;
  estimatedOutput: string;
  expiresAt: number;
  expiresInMs: number;
  priceImpactBps: number;
  nativeSymbol: string;
}
```

The prediction quote service will mirror this contract with binary-market-specific fields.

---

## 7. SSE service contract

**File**: `server/services/ssePriceFeed.ts`

The existing `ssePriceFeed` is a **self-contained singleton class** (`SsePriceFeed`) that is instantiated and exported as `const ssePriceFeed = new SsePriceFeed();` at line 295.

It does **not** expose a public broadcaster instance that can be extended for additional channels. Its `broadcast()` method is private (line 210), and it is tightly coupled to native prices and `marketDataService`.

**Decision: Option (a)** — create a new SSE endpoint at `/api/sse/prediction-prices` with its own standalone broadcaster (`predictionSseFeed.ts`). Extending the existing file would require modifying it (making `broadcast` public, changing subscription key shapes), which violates the "additive only" rule.

---

## 8. Frontend route registration (Anchor Point #3)

**`client/src/App.tsx` lines 83–87**:
```tsx
<Route path="/trade">
  <Suspense fallback={<PageSkeleton />}>
    <PageLayout component={TradePage} />
  </Suspense>
</Route>
```

**Anchor #3 insertion point**: Inside the `<Switch>` block, after the last existing `<Route>` (`/rewards` at line 159) and before the `/_design` dev-only route (line 164) / catch-all 404 route (line 171).

---

## 9. Navigation links (Anchor Point #4)

**`client/src/components/Navigation.tsx` lines 54–60**:
```typescript
const navItems = [
  { path: "/trade", label: "Trade", icon: TrendingUp },
  { path: "/trending", label: "Trending", icon: BarChart3 },
  { path: "/alpha-desk", label: "Alpha Desk", icon: Sparkles },
  { path: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { path: "/about", label: "About", icon: Info },
]
```

Rendered at **lines 85–104**:
```tsx
<nav className="hidden lg:flex items-center gap-1">
  {navItems.map((item) => (
    <button
      key={item.path}
      onClick={() => setLocation(item.path)}
      className={cn(...)}
    >
      <item.icon className="h-4 w-4" strokeWidth={1.5} />
      {item.label}
      {isActive(item.path) && (
        <span className="absolute inset-x-1 -bottom-[9px] h-px bg-[var(--text-primary)]" />
      )}
    </button>
  ))}
</nav>
```

**Anchor #4 insertion point**: Append a new entry to the `navItems` array (line 54) and it will automatically render in the desktop nav. For the mobile nav, see question 10.

---

## 10. Mobile nav

**`client/src/components/MobileNav.tsx` lines 17–26**:
```typescript
const tabs = [
  { path: "/", label: "Trade", icon: TrendingUp },
  { path: "/trending", label: "Trending", icon: BarChart3 },
  ...(isAuthenticated ? [
    { path: "/portfolio", label: "Portfolio", icon: Wallet },
    { path: "/watchlist", label: "Watch", icon: Bookmark },
  ] : []),
  { path: "/leaderboard", label: "Ranks", icon: Trophy },
  { path: isAuthenticated ? "/dashboard" : "/login", label: isAuthenticated ? "Profile" : "Login", icon: User },
]
```

The bottom tab bar is already at 5 tabs (or 7 if authenticated). Adding another tab would make it crowded. **Decision**: Document in `PREDICTION_MARKETS_NOTES.md` that mobile nav is skipped for v1 to avoid overcrowding; desktop nav gets the new link only.

---

## 11. Format module

**`client/src/lib/format.ts`** exports the following functions:

| Function | Line | Purpose |
|----------|------|---------|
| `formatUsd` | 58 | ReactNode USD formatter with smart precision (B/M/K/subscript) |
| `formatUsdText` | 129 | String-only USD formatter (for aria-labels) |
| `formatTokenQty` | 188 | Compact token quantity formatter |
| `formatNative` | 229 | ETH/SOL formatter with tiered decimals |
| `formatPct` | 259 | Signed percentage `+2.44%` |
| `formatCount` | 273 | Locale-grouped integer |

We will reuse `formatUsd` and `formatPct` for prediction market UI. We will **not** write new formatters.

---

## 12. Existing `chain` enum

**`shared/schema.ts` line 31**:
```typescript
export type Chain = 'base' | 'solana';
```

Prediction-market data **does not use this enum**. It gets its own isolated tables (`prediction_markets`, `prediction_paper_balances`, `prediction_positions`, `prediction_trades`) defined in a new file `shared/predictionSchema.ts`. No `chain` column is required for prediction markets.

---

## 13. Idempotency cache

Implemented as an **in-memory `Map<string, IdempotencyEntry>`** in `server/routes.ts` at line 763:
```typescript
const idempotencyCache = new Map<string, IdempotencyEntry>();
```

Config (lines 766–770):
- TTL: 5 minutes
- Cleanup interval: 60 seconds
- Max entries: 10,000

The cache and its helpers (`getIdempotentResponse`, `setIdempotentResponse`) are **not exported** from `routes.ts`. The prediction-market trade route will use a **parallel in-memory Map** with the same TTL and cleanup pattern, living inside `predictionExecutionTx.ts` or `predictionMarketRoutes.ts`. The database unique index on `prediction_trades(userId, idempotencyKey)` provides the durable backstop.

---

## 14. TanStack Query client

**`client/src/lib/queryClient.ts` lines 89–120**:

```typescript
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 60000,
      retry: (failureCount, error: any) => {
        if (error?.status === 401 || error?.status === 403) return false;
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: (failureCount, error: any) => {
        if (error?.status === 401 || error?.status === 403 || error?.status === 400) return false;
        return failureCount < 2;
      },
      retryDelay,
    },
  },
});
```

All new TanStack Query hooks will inherit these defaults.

---

## 15. TypeScript config

**`tsconfig.json`**:
- **Module resolution**: `bundler` (line 16)
- **Module**: `ESNext` (line 9)
- **`allowImportingTsExtensions: true`** (line 15) — TypeScript imports use `.ts` extensions (not `.js`)
- **Target**: `ES2020` (line 7)
- **Strict**: `true` (line 10)

The project does **not** use `NodeNext` resolution. Server-side ESM imports in the source use **no extension** for local files (e.g., `import { registerRoutes } from "./routes"` in `server/index.ts` line 5). However, the **build output** is bundled by esbuild, so runtime resolution is handled by the bundler.

**Important**: The brief's anchor #1 snippet shows `.js` extensions (`from "./services/predictionMarketRoutes.js"`). We will match the **existing convention in the source code** which uses **no extension** for local imports (e.g., `import { registerMarketRoutes } from "./services/marketRoutes"` in `server/routes.ts` line 21).

---

## 16. Existing `ws` dependency

**Yes, `ws` is already in `package.json`** at line 98:
```json
"ws": "^8.18.0"
```

`@types/ws` is also present in devDependencies (line 114). We will reuse this — no new dependency needed.

---

## Anchor Points Summary

| Anchor | File | Line / Location | Insertion |
|--------|------|-----------------|-----------|
| #1 | `server/index.ts` | After line 157 (`const server = await registerRoutes(app);`) | Import and call `registerPredictionMarketRoutes(app)`, `polymarketWs.start()`, `startPredictionSettler()` |
| #2 | `shared/schema.ts` | End of file (after line 449) | `export * from "./predictionSchema";` |
| #3 | `client/src/App.tsx` | Inside `<Switch>`, after `/rewards` route (line 163) and before `/_design` / catch-all | Three new `<Route>` entries for `/predictions`, `/predictions/me`, `/predictions/:slug` |
| #4 | `client/src/components/Navigation.tsx` | `navItems` array (line 54) | Append `{ path: "/predictions", label: "Predictions", icon: ... }` |

---

## Decisions & Justifications

### SSE: Option (a)
Create a standalone `predictionSseFeed.ts` with its own `/api/sse/prediction-prices` endpoint. The existing `ssePriceFeed.ts` is self-contained with private `broadcast()` and subscription keys shaped as `"chain:address"`. Extending it would require modifying the existing file.

### Migration filename
`migrations/0010_prediction_markets.sql` (next number after `0009_session_security.sql`).

### Mobile nav
Skip adding to `MobileNav.tsx` for v1 — the bottom tab bar is already at 5–7 items. Documented in `PREDICTION_MARKETS_NOTES.md`.

### Import extensions
Match existing source convention: **no file extension** for local TypeScript imports (e.g., `from "./services/predictionMarketRoutes"`), not `.js`.

---

## Baseline Type Check

```bash
$ npm run check
> rest-express@1.0.0 check
> tsc
```

**Result: 0 errors, 0 warnings.** (No output from `tsc` means clean compile.)

The acceptance criteria state we must not introduce any new TypeScript errors. Current baseline is **zero errors**.
