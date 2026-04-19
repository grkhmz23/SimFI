# Phase 0 Diagnosis: Entry/Current Price Regression

## Symptom
Entry Price and Current Price columns on `/portfolio` and `/positions` rendered `"—"` (em-dash) instead of USD values. Native token values (SOL/ETH) displayed correctly.

## Investigation

### 1. Frontend rendering
- `client/src/pages/Positions.tsx:366` and `Portfolio.tsx:651/656` call `formatUsd(entryPriceUsd)` / `formatUsd(currentPriceUsd)`
- `formatUsd` returns `"—"` when input is `null`, `undefined`, or `NaN`
- The JSX nodes were present in DOM; values were not absent, just formatted as dash

### 2. USD computation chain
```ts
// Positions.tsx:79
const nativePrice = getPrice(activeChain) ?? NaN;
// Positions.tsx:297
const entryPriceUsd = entryPriceNative * nativePrice;
```
When `getPrice(activeChain)` returns `null` (from `PriceContext`), `nativePrice` becomes `NaN`, and all USD values become `NaN` → `"—"`.

### 3. Root cause: `/api/market/native-prices` endpoint
`server/routes.ts:1208` called `getAllNativePricesDetailed()`, which is **synchronous and only reads cache**. On fresh server start, cache is empty → returns HTTP 503.

### 4. Frontend retry bug
`client/src/lib/price-context.tsx:28` checked `error?.message?.includes('503')`, but the thrown error message was `"Native prices temporarily unavailable"` (parsed from JSON body), not `"503 ..."`. So retry logic never short-circuited, wasted 3 retries, and permanently failed.

## Fix Applied

1. **server/routes.ts** — Added cache priming before reading:
   ```ts
   await getNativePrice('solana');
   await getNativePrice('base');
   const detailed = getAllNativePricesDetailed();
   ```

2. **client/src/lib/price-context.tsx** — Fixed retry matcher:
   ```ts
   if (error?.message?.includes('503') || error?.message?.includes('Native prices temporarily unavailable')) return false;
   ```

## Verification
- `/portfolio` positions table: Entry and Current now populate with USD
- `/positions` detail cards: Entry Price and Current Price populated
- Sub-penny memecoin prices render via `formatUsd` subscript-zero notation
- `null`/`undefined` values still render `"—"` (correct), not blanks or `$NaN`
