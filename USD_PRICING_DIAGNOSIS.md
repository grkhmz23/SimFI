# USD Pricing Diagnosis

## 1.1 — ETH/USD Rate Trace

### Frontend origin
The portfolio page (`client/src/pages/Portfolio.tsx`) renders USD values using:
```tsx
// Line 379
{formatUSD(totals.current, getPrice(activeChain), activeChain, 2)}
// Line 397
{formatUSD(totals.invested, getPrice(activeChain), activeChain, 2)}
// Line 436
{formatUSD(totals.pnl, getPrice(activeChain), activeChain, 2)}
// Lines 667-672 (per position)
{formatUSD(toBigInt(position.currentValue), getPrice(activeChain), activeChain, 2)}
```

`totals.current`, `totals.invested`, `totals.pnl`, and `position.currentValue` are **native units** (wei for Base). The USD value is computed client-side as:
```
USD = (wei / 1e18) * ethPriceUSD
```

### Price source on client
`getPrice(activeChain)` comes from `PriceContext` (`client/src/lib/price-context.tsx`):
- `const [ethPriceUSD, setEthPriceUSD] = useState(3500); // Default fallback` (line 17)
- Fetches `/api/base/price` on mount (line 35)
- `setEthPriceUSD(data.price || 3500);` (line 38) — hardcoded fallback if server returns falsy
- `useChainPrice(chain)` returns `3500` if no provider context (line 88)

### Server endpoint
`GET /api/base/price` (`server/routes.ts:1180-1205`) calls `fetchEthPrice()` from `server/solPrice.ts` (aliased import). The server-side fetcher:
1. Tries CoinGecko: `https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd`
2. Falls back to Binance: `https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT`
3. Returns `null` if all fail (no hardcoded fallback)

The server correctly returns HTTP 503 with `{ available: false }` when price is unavailable.

### Network capture (live test)
```bash
$ curl -sS http://localhost:5000/api/base/price
{
  "price": null,
  "available": false,
  "retryAfter": 30
}
```
When CoinGecko/Binance are rate-limited or unreachable, the server returns `price: null` + 503. The frontend then silently falls back to `3500` via `data.price || 3500`.

---

## 1.2 — SOL/USD Rate Trace

Same pattern as ETH:
- `client/src/lib/price-context.tsx` line 16: `useState(140)`
- Fetches `/api/solana/price` (line 24)
- `setSolPriceUSD(data.price || 140);` (line 27)
- `useChainPrice('solana')` returns `140` if no provider (line 88)

Server endpoint `GET /api/solana/price` (`server/routes.ts:1151-1177`):
1. Tries Jupiter Price V2 (`So1111...1112`)
2. Falls back to CoinGecko → Binance → Jupiter Legacy
3. Returns `null` if all fail

Live reference (CoinGecko public):
```bash
$ curl -sS "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,solana&vs_currencies=usd" | jq .
{
  "ethereum": { "usd": 2310.42 },
  "solana": { "usd": 148.73 }
}
```

The hardcoded ETH fallback of `3500` is **~51% higher** than the live rate of ~$2310. The hardcoded SOL fallback of `140` is **~6% lower** than the live rate of ~$149.

---

## 1.3 — Root Cause Classification

**STALE_CONSTANT** — The server correctly returns `null`/503 when live prices are unavailable, but the frontend initializes with hardcoded defaults (`140` for SOL, `3500` for ETH) and uses `||` fallbacks on every fetch response. When the price endpoint fails or returns `null`, the client silently substitutes the stale constant, making every USD display wrong.

The server has **zero** hardcoded USD fallback constants. The bug is entirely client-side.

---

## 1.4 — Fix Plan

### Files to change

1. **`server/routes.ts:1178`** — Add new endpoint `GET /api/market/native-prices` that returns:
   ```json
   {
     "eth": { "usd": 2341.52, "source": "coingecko", "timestamp": 1745078400000 },
     "sol": { "usd": 148.73, "source": "coingecko", "timestamp": 1745078400000 }
   }
   ```
   Reuse existing `getNativePrice` from `server/nativePrice.ts` (which already has `getAllNativePrices()`). Augment response with source/timestamp from cache status.

2. **`server/nativePrice.ts`** — Add DexScreener WETH/SOL pair as final fallback for both chains. Add circuit-breaker pattern (3 failures in 60s → skip 90s) reusing the logic from `marketData.ts`.

3. **`client/src/lib/price-context.tsx`** — Complete rewrite:
   - Remove **all** hardcoded defaults (`140`, `3500`)
   - Fetch from `/api/market/native-prices`
   - Initialize state as `null`, not a number
   - Never use `||` fallback on fetched data
   - `getPrice()` returns `number | null`
   - `useActivePrice()` returns `number | null`
   - `useChainPrice()` returns `number | null`

4. **`client/src/lib/format.ts`** (new file) — Create `formatUsd()` that renders `"—"` for `null`/`undefined`/`NaN`.

5. **All USD-displaying components** — Update to handle `null` prices gracefully (render `"—"` instead of `$0.00` or `NaN`).

### Server change required?
Yes. A new unified endpoint `/api/market/native-prices` is required so the frontend fetches both prices in one round-trip and receives source/timestamp metadata. The existing separate endpoints (`/api/solana/price`, `/api/base/price`) can remain for backward compatibility.

### `.env.example` update?
No. No new environment variables are needed. The price sources are all public APIs.

### Verification (curl)
```bash
# After fix
curl -sS http://localhost:5000/api/market/native-prices | jq .

# Expected shape:
# {
#   "eth": { "usd": <real-price>, "source": "coingecko", "timestamp": <epoch-ms> },
#   "sol": { "usd": <real-price>, "source": "coingecko", "timestamp": <epoch-ms> }
# }

# Compare to live reference:
curl -sS "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,solana&vs_currencies=usd" | jq .
```

### Hardcoded price grep results (pre-fix)
```
client/src/lib/price-context.tsx:16:  const [solPriceUSD, setSolPriceUSD] = useState(140); // Default fallback
client/src/lib/price-context.tsx:17:  const [ethPriceUSD, setEthPriceUSD] = useState(3500); // Default fallback
client/src/lib/price-context.tsx:27:          setSolPriceUSD(data.price || 140);
client/src/lib/price-context.tsx:38:          setEthPriceUSD(data.price || 3500);
client/src/lib/price-context.tsx:79:    return 140; // Fallback
client/src/lib/price-context.tsx:88:    return chain === 'solana' ? 140 : 3500;
```

These 6 hits are the only hardcoded USD price constants in the entire codebase (`server/` has zero).
