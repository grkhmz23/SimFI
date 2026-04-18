# SimFi — Authorized Backend Changes

> Authorized by user on 2026-04-18 after Phase 1 audit.
> These changes are required to unblock Base trading and align the backend contract with the frontend.

---

## Change 1: Price Column Schema Migration — `numeric(38, 18)`

### Problem
PostgreSQL `bigint` (signed 64-bit, max `9.22e18`) cannot store Base prices in wei. WETH at ~$2,362 has `priceNative ≈ 2.37e21`, causing every Base trade to crash with:
```
error: value "2374361443500000000000" is out of range for type bigint
```

### Solution
Migrate all price-shaped `bigint` columns to `numeric(38, 18)` (PostgreSQL arbitrary-precision decimal with 18 fractional digits). This preserves full precision for both Solana (9 decimals) and Base (18 decimals) while keeping the values human-readable.

### Columns to migrate

| Table | Column | Current Type | New Type |
|-------|--------|--------------|----------|
| `positions` | `entry_price` | `bigint` | `numeric(38, 18)` |
| `trade_history` | `entry_price` | `bigint` | `numeric(38, 18)` |
| `trade_history` | `exit_price` | `bigint` | `numeric(38, 18)` |

> Note: `positions.amount`, `trade_history.amount`, `users.balance`, `users.base_balance`, and native-spent/received columns remain `bigint` because token amounts and balances fit safely within 64-bit. Only *price* columns (price per token in native units) are affected.

### Files to modify
- `shared/schema.ts` — update Drizzle column definitions.
- `migrations/` — add a SQL migration script.
- `server/db.ts` — no changes needed (Drizzle handles `numeric` via `pg`).
- `server/storage.ts` — no direct column-type changes needed if Drizzle schema is updated, but see Change 2 for the converter utility.

### Migration script
```sql
-- migrations/0002_price_numeric.sql
ALTER TABLE positions ALTER COLUMN entry_price TYPE numeric(38, 18);
ALTER TABLE trade_history ALTER COLUMN entry_price TYPE numeric(38, 18);
ALTER TABLE trade_history ALTER COLUMN exit_price TYPE numeric(38, 18);
```

### Data migration for existing Solana rows
Existing Solana rows store `entry_price` in atomic units (lamports per token). After the type change, the schema will still hold the same numeric value, so no data loss occurs. However, to align with the new "decimal at persistence boundary" semantics, we should normalize existing Solana data by dividing by `10^9` and existing Base data by `10^18`.

**One-shot script:** `scripts/migrate-prices.ts`
- Reads every `positions` and `trade_history` row.
- Uses the row's `decimals` and `chain` fields to determine the divisor.
- Updates `entry_price` and `exit_price` to decimal form.
- Runs as a single transaction.

---

## Change 2: Price Converter Utility at Persistence Boundary

### Problem
Price values cross multiple boundaries:
1. External APIs (DexScreener, Jupiter) return atomic units.
2. Server logic currently does BigInt math with these atomic values.
3. Database must store decimals.
4. Frontend expects decimal strings or numbers.

### Solution
A single pair of converter functions used at the **persistence boundary only** (where data enters/leaves the database). All internal business logic continues to use `bigint` for atomic-unit math.

```ts
// server/lib/priceDecimal.ts

/**
 * Convert an atomic price (lamports or wei per token) to a decimal string
 * suitable for storage in numeric(38, 18).
 */
export function atomicToDecimal(
  atomicPrice: bigint,
  nativeDecimals: number
): string {
  const divisor = 10n ** BigInt(nativeDecimals);
  const wholePart = atomicPrice / divisor;
  const fracPart = atomicPrice % divisor;
  const fracStr = fracPart.toString().padStart(nativeDecimals, '0');
  return `${wholePart}.${fracStr}`;
}

/**
 * Convert a decimal price from the database back to atomic units (bigint).
 */
export function decimalToAtomic(
  decimalPrice: string,
  nativeDecimals: number
): bigint {
  const [wholeStr, fracStr = ''] = decimalPrice.split('.');
  const paddedFrac = fracStr.padEnd(nativeDecimals, '0').slice(0, nativeDecimals);
  const atomicStr = wholeStr + paddedFrac;
  return BigInt(atomicStr);
}
```

### Usage rules
- **Write path:** `storage.executeBuyTrade` and `storage.executeSellTrade` convert `entryPrice` / `exitPrice` from `bigint` → `string` (decimal) before passing to Drizzle.
- **Read path:** `storage.getUserPositions` and `storage.getUserTrades` convert decimal strings back to `bigint` so the rest of the backend (and the frontend) continues to receive atomic units.
- **No changes** to `server/routes.ts` trade math — it stays in `bigint` land.

---

## Change 3: Add `price` Field to List Endpoint Responses

### Problem
`marketRoutes.ts` serializes trending/new-pairs/hot items with only `priceNative: string`. The frontend `Token` type expects `price: number`, so `selectedToken.price` is `undefined` for tokens selected from lists.

### Solution
Add `price: Number(token.priceNative)` to the serialization in all three list endpoints, **matching the single-token endpoint behavior**. This is a temporary fix to restore the contract; the long-term fix is updating the frontend to read `priceNative`.

### Files
- `server/services/marketRoutes.ts` — lines ~137, ~168, ~200

### Code change
```ts
const serializedTrending = trending.map(token => ({
  ...token,
  priceNative: token.priceNative.toString(),
  price: Number(token.priceNative), // ← ADD
}));
```
> Note: This still destroys precision for Base, but it unblocks the frontend which currently relies on `price`. A frontend update to use `priceNative` directly will follow in Phase 3.

---

## Change 4: Implement Base Path in `marketDataService`

### Problem
Base trending/new-pairs/hot endpoints return empty arrays. The `marketDataService` likely only implements DexScreener fetching for Solana.

### Solution
Ensure `marketDataService` uses the correct DexScreener chain IDs and endpoints for Base:
- DexScreener chain ID for Base: `"base"`
- API: `https://api.dexscreener.com/latest/dex/tokens/{address}` (multi-chain, filter by `chainId`)
- API: `https://api.dexscreener.com/latest/dex/search/?q={query}` (multi-chain, filter by `chainId`)

Verify that `getTrending`, `getNewPairs`, and `getHotTokens` all filter/query with the `base` chain parameter rather than hardcoding `solana`.

### Files
- `server/services/marketData.ts`

---

## Change 5: Wire Server Quote into Trade Flow

### Problem
Frontend computes trade estimates client-side. Backend quote endpoints (`/api/quote`, `/api/tokens/quote/buy`) exist but are unused.

### Solution
Wire the **existing** `/api/quote` endpoint into the frontend trade modal so the displayed estimate comes from the server. Do not create new endpoints.

### Frontend changes
- `client/src/components/TradeModal.tsx`: Replace client-side `estimatedTokens` math with a `useQuery` call to `GET /api/quote`.
- Pass `tokenAddress`, `chain`, `side`, `amountNative` (for buy) or `amountTokens` (for sell).
- Display `quote.estimatedOutput` with proper decimal formatting.
- Show quote expiry countdown (`expiresInMs`).
- On trade submit, the backend will re-quote at execution time (already implemented in `server/routes.ts`).

### Backend verification
- Confirm `/api/quote` (`marketRoutes.ts:282`) works for both chains.
- Confirm `quoteService.createQuote` returns correct `priceNative` and `estimatedOutput`.
- No backend code changes needed if the endpoint is already functional.

---

## Change 6: Dialog Accessibility — `DialogTitle` in `CommandDialog`

### Problem
Radix UI `DialogContent` requires a `DialogTitle` for screen readers. The `CommandDialog` component (`command.tsx`) wraps `DialogContent` without a title.

### Solution
Add a visually hidden `DialogTitle` inside `CommandDialog` in `client/src/components/ui/command.tsx`.

```tsx
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden" // or custom sr-only class

const CommandDialog = ({ children, ...props }: DialogProps) => {
  return (
    <Dialog {...props}>
      <DialogContent className="overflow-hidden p-0 shadow-lg">
        <VisuallyHidden>
          <DialogTitle>Search tokens</DialogTitle>
        </VisuallyHidden>
        <Command className="...">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}
```

If `@radix-ui/react-visually-hidden` is not installed, use a Tailwind `sr-only` class instead.

---

## Change 7: Price Fallback Cascade Verification

### Problem
Production logs show 503s on `/api/solana/price` and `/api/base/price`.

### Verification steps
1. Review `server/solPrice.ts` fallback logic:
   - Source order: Jupiter Price v2 → CoinGecko → Binance → stale cache.
   - ETH sources: CoinGecko → Binance → stale cache.
2. Confirm that when all sources fail, the frontend `PriceProvider` falls back to hardcoded defaults (`$140` SOL, `$3500` ETH).
3. If the cascade works (falls back to stale cache, then frontend defaults), the 503s are cosmetic and low priority.
4. If the cascade skips stale cache or throws unhandled, fix the error handling.

### Files
- `server/solPrice.ts`
- `client/src/lib/price-context.tsx`

---

## Change 8: Registration Crash (Node v24)

### Problem
`console.error('Registration error:', error)` at `server/routes.ts:1069` crashes Node.js v24 when `error` has an unusual property descriptor.

### Solution
Wrap the log in a safe stringifier or avoid passing the raw error object to `console.error`.

```ts
console.error('Registration error:', error?.message || String(error));
```

This is a minimal, safe change that prevents the server from dying on any catch-block error.

---

## Execution Order

1. **Schema migration** (Change 1) — must happen first or Base trades remain impossible.
2. **Converter utility** (Change 2) + **storage layer wiring**.
3. **Data migration script** (Change 1 cont.) — run against existing rows.
4. **marketDataService fixes** (Change 3 + Change 4) — restore Base lists and `price` field.
5. **Quote wiring** (Change 5) — frontend-only, depends on functional backend.
6. **Dialog a11y** (Change 6) — frontend-only, low risk.
7. **Price fallback verification** (Change 7) — read-only audit.
8. **Registration crash fix** (Change 8) — one-line backend patch.

---

## Files Modified Summary

| File | Changes |
|------|---------|
| `shared/schema.ts` | `positions.entry_price`, `trade_history.entry_price`, `trade_history.exit_price` → `numeric(38, 18)` |
| `migrations/0002_price_numeric.sql` | ALTER TYPE statements |
| `scripts/migrate-prices.ts` | One-shot data migration script |
| `server/lib/priceDecimal.ts` | `atomicToDecimal` / `decimalToAtomic` converters |
| `server/storage.ts` | Use converters at persistence boundary |
| `server/services/marketRoutes.ts` | Add `price` to list serializations |
| `server/services/marketData.ts` | Fix Base chain support in trending/new/hot |
| `server/routes.ts` | Safe error logging at registration crash site |
| `client/src/components/TradeModal.tsx` | Wire `/api/quote` for estimates |
| `client/src/components/ui/command.tsx` | Add visually hidden `DialogTitle` |
| `client/src/lib/price-context.tsx` | Verify fallback behavior |
