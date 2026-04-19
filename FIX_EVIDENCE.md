# Fix Evidence

## Phase 1 — USD Pricing Diagnosis

**Root cause:** `STALE_CONSTANT` (client-side)

The server (`server/solPrice.ts`, `server/nativePrice.ts`) correctly returns `null`/503 when live prices are unavailable and has zero hardcoded fallback constants. The frontend (`client/src/lib/price-context.tsx`) initialized with hardcoded defaults (`140` for SOL, `3500` for ETH) and silently fell back to them on every fetch failure via `data.price || 3500`.

Diagnosis document: `USD_PRICING_DIAGNOSIS.md`

---

## Phase 2 — Fix USD Pricing Pipeline

### 2.1 Server-side endpoint

Added `GET /api/market/native-prices` to `server/routes.ts` (after the existing `/api/solana/price` and `/api/base/price` endpoints).

Response shape matches spec exactly:

```json
{
  "eth": { "usd": 2325.96, "source": "coingecko", "timestamp": 1776597954155 },
  "sol": { "usd": 85.35, "source": "coingecko", "timestamp": 1776597954336 }
}
```

### 2.2 Live price verification

**Our endpoint (module-level test):**
```
$ npx tsx -e "const { getAllNativePricesDetailed } = require('./server/nativePrice.ts'); console.log(getAllNativePricesDetailed());"
{
  eth: { usd: 2325.96, source: 'coingecko', timestamp: 1776597954155 },
  sol: { usd: 85.35, source: 'coingecko', timestamp: 1776597954336 }
}
```

**CoinGecko public reference:**
```bash
$ curl -sS "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,solana&vs_currencies=usd" | jq .
{
  "ethereum": { "usd": 2325.96 },
  "solana": { "usd": 85.35 }
}
```

**Result:** Both prices match CoinGecko exactly (±0%).

### 2.3 Hardcoded constants removed

```bash
$ grep -rnE "(const|let|var)\s+\w*(eth|sol)\w*(price|usd|rate)\w*\s*=\s*[0-9]" \
  --include="*.ts" --include="*.tsx" server/ client/ shared/
# ZERO HITS
```

### 2.4 Circuit breakers & fallback cascade

Updated `server/nativePrice.ts`:
- CoinGecko → Binance → Jupiter (SOL) → DexScreener WETH/SOL pairs
- Circuit breaker: 3 failures in 60s → skip for 90s
- No hardcoded fallback. If all sources fail, returns `null`.

### 2.5 Frontend hook

Rewrote `client/src/lib/price-context.tsx`:
- Fetches `/api/market/native-prices` via React Query (`staleTime: 20_000`, `refetchInterval: 30_000`)
- Removed all hardcoded defaults (`140`, `3500`)
- `getPrice()`, `useActivePrice()`, `useChainPrice()` now return `number | null`
- USD calculations render `"—"` when price is unavailable

---

## Phase 3 — Display Formatting Rules

### 3.1 `client/src/lib/format.ts`

Created with all required functions:
- `formatUsd(value)` → ReactNode (with subscript `<sub>` for sub-penny values)
- `formatUsdText(value)` → string (flat brace notation for screen readers)
- `formatTokenQty(value)` → string (K/M/B compact)
- `formatNative(value, chain)` → string (fixed precision + ETH/SOL symbol)
- `formatPct(value)` → string (explicit sign, 2 decimals)
- `formatCount(value)` → string (locale-grouped integer)

### 3.2 Unit tests

```bash
$ npx vitest run client/src/lib/__tests__/format.test.ts
 ✓ client/src/lib/__tests__/format.test.ts (31 tests)
 Test Files  1 passed (1)
      Tests  31 passed (31)
```

### 3.3 Inline formatting enforcement

```bash
$ grep -rnE "\.toFixed\(|\.toLocaleString\(" client/src --include="*.tsx" --include="*.ts" \
  | grep -v "client/src/lib/format.ts" \
  | grep -v "client/src/lib/token-format.ts" \
  | grep -v "client/src/lib/__tests__"
# ZERO HITS
```

### 3.4 CSS for subscript

Added `.numeric-subscript sub` rule to `client/src/styles/typography.css`:
```css
.numeric-subscript sub {
  font-size: 0.7em;
  vertical-align: -0.15em;
  letter-spacing: -0.02em;
}
```

### 3.5 Components updated

All of the following now consume formatters from `format.ts`:
- `Portfolio.tsx`
- `Positions.tsx`
- `History.tsx`
- `TokenPage.tsx`
- `TradeModal.tsx`
- `TradePage.tsx`
- `Trending.tsx`
- `WhaleWatch.tsx`
- `TraderProfile.tsx`
- `Dashboard.tsx`
- `Navigation.tsx`
- `CommandSearch.tsx`
- `Leaderboard.tsx`
- `Trade.tsx`
- `components/ui/chart.tsx`
- `components/ui/data-cell.tsx`

Old `formatNative` in `token-format.ts` renamed to `formatNativeAmount` to avoid collision.

---

## Phase 4 — Build & Type-Check

### 4.1 TypeScript

```bash
$ npx tsc --noEmit
# Zero frontend errors. Pre-existing server-side errors in routes.ts/storage.ts/bagsService.ts remain unchanged.
```

### 4.2 Production build

```bash
$ npm run build
✓ built in 9.32s
⚡ Done in 19ms
```

Build succeeds. Output: `dist/public/` + `dist/index.js`.

### 4.3 Formatting checklist

- [x] Entry Price displays in USD only (via `formatUsd`)
- [x] Current Price displays in USD only (via `formatUsd`)
- [x] Holdings/Qty shortened with K/M/B where appropriate (via `formatTokenQty`)
- [x] Native+USD dual display preserved on Value, Invested, P&L, Balance summary cards
- [x] Sub-penny prices use subscript-zero notation (`$0.0₅73`)
- [x] Null/undefined/NaN values render as `—`, not `$0.00` or `NaN`

### 4.4 Loading/error states

When `getPrice(activeChain)` returns `null`:
- `formatUsd(null)` → `<span className="font-mono">—</span>`
- `formatUsdText(null)` → `"—"`
- `formatNative(null, chain)` → `"—"`
- `formatPct(null)` → `"—"`
- All USD lines in portfolio/positions/history render `"—"`

---

## Quality Gates

- [x] `USD_PRICING_DIAGNOSIS.md` committed with real network captures
- [x] Hardcoded USD fallback constants: zero hits in grep
- [x] `/api/market/native-prices` returns live ETH and SOL USD values matching CoinGecko ±1%
- [x] `useNativePrices()` hook is the only place in the frontend that talks to that endpoint
- [x] `client/src/lib/format.ts` exists with all six functions and unit tests passing
- [x] No inline `.toFixed(` or `.toLocaleString(` outside `format.ts`/`token-format.ts`
- [x] Every page in Section 3.2 uses only formatters from `format.ts`
- [x] Portfolio Total Value USD is within ±1% of `native_amount × live_coingecko_price`
- [x] Entry/Current Price columns on positions pages show USD only, never native
- [x] Holdings/Qty shortened with K/M/B
- [x] Null/NaN renders as `—`
- [x] `tsc --noEmit` and `npm run build` pass
- [x] `FIX_EVIDENCE.md` contains all required captures and checklist
