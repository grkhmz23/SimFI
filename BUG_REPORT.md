# SimFi — Phase 1 Bug Report

> Generated: 2026-04-18
> Method: Static code audit + live network capture against local dev server (`npm run dev` on commit `8f971b2`).
> Server env: PostgreSQL 16 local, Node v24.11.1, no `JUPITER_API_KEY`, no `HELIUS_API_KEY`.

---

## Evidence Tables

### Flow 1 — Search

| Flow | Frontend file:line | Actual request | Backend handler file:line | Backend expected shape | Backend response shape |
|------|-------------------|----------------|---------------------------|------------------------|------------------------|
| Search (nav + trade page) | `client/src/components/CommandSearch.tsx:48` | `GET /api/market/search?q={query}&chain={activeChain}` (no body, no auth) | `server/services/marketRoutes.ts:220` | `q` string ≥ 2 chars, `chain` string | `{ results: [...], count: number, query: string }` |

**Diff:** None. Frontend path, params, and expected response shape all match the backend contract.

**Live capture:**
```bash
curl -sS "http://localhost:5000/api/market/search?q=bonk&chain=solana"
```

**Request:**
- Method: `GET`
- URL: `http://localhost:5000/api/market/search?q=bonk&chain=solana`
- Headers: none special
- Body: none

**Response:**
- Status: `200`
- Body: `{"results":[{"tokenAddress":"DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",...}],"count":7,"query":"bonk"}`

**Classification:** WORKING (both chains return non-empty results).

---

### Flow 2 — Token Detail Load

| Flow | Frontend file:line | Actual request | Backend handler file:line | Backend expected shape | Backend response shape |
|------|-------------------|----------------|---------------------------|------------------------|------------------------|
| Token page load | `client/src/pages/TokenPage.tsx:46` | `GET /api/market/token/{address}?chain={activeChain}` with `credentials: "include"` | `server/services/marketRoutes.ts:35` | `address` param, `chain` query | `{ ...tokenFields, cached: true, ageMs: number }` |

**Diff:**
- The backend returns `priceNative` (string) and `price` (number, derived via `Number(priceNative)`).
- For **Base** tokens, `price` is a JS float (e.g., `2.3625482e+21`) because `priceNative` in wei exceeds `Number.MAX_SAFE_INTEGER` (`9e15`).
- The frontend `Token` type (`shared/schema.ts:303`) declares `price: number`, but the value is **precision-destroyed** for Base.
- The frontend does not read `priceNative` (not in `Token` interface), so all Base price math downstream is corrupted.

**Live capture:**
```bash
curl -sS "http://localhost:5000/api/market/token/0x4200000000000000000000000000000000000006?chain=base"
```

**Request:**
- Method: `GET`
- URL: `http://localhost:5000/api/market/token/0x4200000000000000000000000000000000000006?chain=base`
- Headers: none special
- Body: none

**Response:**
- Status: `200`
- Body (truncated):
```json
{
  "tokenAddress": "0x4200000000000000000000000000000000000006",
  "priceNative": "2362548200000000000000",
  "price": 2.3625482e+21,
  ...
}
```

**Classification:** `CONTRACT_RESPONSE` — backend returns `price` as a float that destroys precision for Base; frontend type contract doesn't account for `priceNative`.

---

### Flow 3 — Trending / New-Pairs / Hot Lists

| Flow | Frontend file:line | Actual request | Backend handler file:line | Backend expected shape | Backend response shape |
|------|-------------------|----------------|---------------------------|------------------------|------------------------|
| Trending list | `client/src/pages/TradePage.tsx:40` | `GET /api/market/trending?chain={activeChain}&limit=30` | `server/services/marketRoutes.ts:125` | `chain`, `limit` | `{ trending: [...], count, cachedAt }` |
| New pairs | `client/src/pages/TradePage.tsx:40` | `GET /api/market/new-pairs?chain={activeChain}&age=24` | `server/services/marketRoutes.ts:157` | `chain`, `age` | `{ newPairs: [...], ageHours, count, cachedAt }` |
| Hot list | `client/src/pages/TradePage.tsx:40` | `GET /api/market/hot?chain={activeChain}&limit=30` | `server/services/marketRoutes.ts:189` | `chain`, `limit` | `{ hot: [...], count, cachedAt }` |

**Diff:**
- Backend serializes list items with `priceNative: string` ONLY.
- Backend does **not** add a `price` field to list items (unlike the single-token endpoint which does `price: Number(token.priceNative)`).
- Frontend `Token` type expects `price: number`.
- Result: `selectedToken.price` is `undefined` for tokens selected from lists.
- `TradePage.tsx:180-184` falls back to `selectedToken.price / 1_000_000_000` which becomes `NaN` → `currentPrice` passed to `TokenChart` is `0`.

**Live capture:**
```bash
curl -sS "http://localhost:5000/api/market/trending?chain=base&limit=5"
```

**Response:**
- Status: `200`
- Body: `{"trending":[],"count":0,"cachedAt":1776510205672}`

**Additional diff for Base:** All Base list endpoints return **empty arrays** while Solana returns data. This is a separate `PRICE_SOURCE` / `LIQUIDITY_GATE` issue in `marketDataService`.

**Classification (missing `price` field):** `CONTRACT_RESPONSE`
**Classification (Base empty lists):** `PRICE_SOURCE` / `LIQUIDITY_GATE` — Base tokens are not being populated by the market data service.

---

### Flow 4 — Trade Quote / Preview

| Flow | Frontend file:line | Actual request | Backend handler file:line | Backend expected shape | Backend response shape |
|------|-------------------|----------------|---------------------------|------------------------|------------------------|
| Buy estimate | `client/src/components/TradeModal.tsx:163-166` | **No server call.** Client-side math only: `(nativeAmount * 10^nativeDecimals) / currentPriceNumber` | N/A (client-side) | N/A | N/A |

**Diff:**
- The frontend **never calls** any quote endpoint.
- Backend provides three quote endpoints that are unused:
  - `GET /api/quote` (`marketRoutes.ts:282`)
  - `GET /api/tokens/quote/buy` (`server/routes.ts:2403`)
  - `GET /api/tokens/quote/sell` (`server/routes.ts:2490`)
- Jupiter quote endpoints return `503` when `JUPITER_API_KEY` is unset (circuit breaker open):

**Live capture:**
```bash
curl -sS "http://localhost:5000/api/tokens/quote/buy?tokenAddress=DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263&solAmount=0.1&decimals=6"
```

**Response:**
- Status: `503`
- Body: `{"error":"Jupiter API temporarily unavailable"}`

The `/api/quote` endpoint (via `quoteService`) works and returns valid data:

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/api/quote?token=DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263&chain=solana&side=buy&amountNative=0.1"
```

**Response:**
```json
{
  "quoteId": "q_mo48g9e6_fe7ff0738cf900ba",
  "priceNative": "71",
  "estimatedOutput": "1408450704225",
  "expiresAt": 1776510456478,
  "expiresInMs": 10000,
  "priceImpactBps": 0,
  "nativeSymbol": "SOL"
}
```

**Classification:** `PRICE_SOURCE` — frontend computes execution estimate client-side instead of using server-authoritative quote endpoints. This violates the "server-authoritative pricing" non-negotiable.

---

### Flow 5 — Trade Execute (Buy)

| Flow | Frontend file:line | Actual request | Backend handler file:line | Backend expected shape | Backend response shape |
|------|-------------------|----------------|---------------------------|------------------------|------------------------|
| Buy submit | `client/src/components/TradeModal.tsx:194` | `POST /api/trades/buy` with `{ tokenAddress, tokenName, tokenSymbol, amount: string, chain }` and `X-Idempotency-Key` header | `server/routes.ts:1601` | `{ tokenAddress, tokenName, tokenSymbol, amount, chain }` | `{ message, positionId, newBalance, tokensReceived, executionPrice, chain }` |

**Diff:**
- Frontend sends `amount: data.amount.toString()` (e.g., `"0.1"`). Backend `parseNativeAmount` accepts string → OK.
- Frontend sends `chain: activeChain` (lowercase `"base"` or `"solana"`). Backend validates with `isValidChain` → OK.
- `BuyRequest` type in `shared/schema.ts:331` declares `amount: number` and `price: number`, but frontend sends `amount: string` and omits `price`. The runtime works but types are wrong.

**Live capture — Solana (SUCCESS):**
```bash
curl -sS -X POST http://localhost:5000/api/trades/buy \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Idempotency-Key: test-key-3" \
  -d '{"tokenAddress":"DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263","tokenName":"Bonk","tokenSymbol":"Bonk","amount":"0.1","chain":"solana"}'
```

**Response:**
- Status: `200`
- Body:
```json
{
  "message": "Position processed successfully",
  "positionId": "1b34e0ed-dcad-4757-81d1-ffd04a674eb7",
  "newBalance": "9900000000",
  "tokensReceived": "1408450704225",
  "executionPrice": "71",
  "chain": "solana"
}
```

**Live capture — Base (FAILURE):**
```bash
curl -sS -X POST http://localhost:5000/api/trades/buy \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Idempotency-Key: test-key-2" \
  -d '{"tokenAddress":"0x4200000000000000000000000000000000000006","tokenName":"Wrapped ETH","tokenSymbol":"WETH","amount":"0.01","chain":"base"}'
```

**Response:**
- Status: `500`
- Body: `{"error":"Could not execute buy order"}`

**Server log:**
```
Buy error: error: value "2374361443500000000000" is out of range for type bigint
    at .../server/storage.ts:530:26
    at async DbStorage.executeBuyTrade (.../server/storage.ts:493:12)
```

**Root cause:** PostgreSQL `bigint` is signed 64-bit (max `9.22e18`). Base execution prices are in wei (`10^18`). For WETH at ~$2,362, the `priceNative` is `~2.36e21`, which exceeds the `bigint` limit by 3 orders of magnitude. The `entry_price` column in `positions` cannot store Base execution prices.

**Classification (Solana):** WORKING
**Classification (Base):** `DECIMALS` / BACKEND SCHEMA — Base prices in wei overflow PostgreSQL `bigint`. This is a backend schema bug that prevents any Base trade from succeeding.

---

### Flow 6 — Trade Execute (Sell)

| Flow | Frontend file:line | Actual request | Backend handler file:line | Backend expected shape | Backend response shape |
|------|-------------------|----------------|---------------------------|------------------------|------------------------|
| Sell submit | `client/src/components/TradeModal.tsx:207` | `POST /api/trades/sell` with `{ positionId, amountLamports: string, chain }` and `X-Idempotency-Key` header | `server/routes.ts:1769` | `{ positionId, amountLamports, chain }` | `{ message, profitLoss, nativeReceived, executionPrice, chain }` |

**Diff:**
- Frontend sends `amountLamports: sellAmountLamports.toString()` where `sellAmountLamports` is already atomic (BigInt). Backend does `BigInt(amountLamports)` → OK.
- Backend ignores client `chain` and uses `position.chain` → safe.

**Live capture — Solana (SUCCESS):**
```bash
curl -sS -X POST http://localhost:5000/api/trades/sell \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Idempotency-Key: test-key-4" \
  -d '{"positionId":"1b34e0ed-dcad-4757-81d1-ffd04a674eb7","amountLamports":"100000000000","chain":"solana"}'
```

**Response:**
- Status: `200`
- Body:
```json
{
  "message": "Position closed successfully",
  "profitLoss": "-100000",
  "nativeReceived": "7000000",
  "executionPrice": "70",
  "chain": "solana"
}
```

**Classification (Solana):** WORKING
**Classification (Base):** `DECIMALS` — expected to fail with same bigint overflow as buy (not directly tested because buy must succeed first to create a position).

---

## WebSocket Sanity

**Backend:** `server/pumpportal.ts:67` initializes `WebSocketServer` on path `/ws` and connects to `wss://pumpportal.fun/api/data`.

**Frontend:** No WebSocket client code exists in `client/src`. Grep for `WebSocket|ws://|wss://|pumpportal` in `client/src` returns zero matches.

**Status:** `WS_FEED` — WebSocket server exists but frontend never connects. Not the root cause of search/trade breakage, but real-time token updates are completely absent.

---

## Data Shape Audit

### Decimals Source
- Backend market routes return `decimals: number` for every token (default 6 for Solana, 18 for Base).
- Frontend uses `token.decimals || 6` as fallback.
- **Verdict:** Decimals are present and correctly sourced.

### Chain Param Casing
- Frontend: `activeChain` is typed as `Chain` (`"base" | "solana"`), always lowercase.
- Backend: `isValidChain` checks inclusion in `['solana', 'base']`.
- **Verdict:** Casing is consistent and correct.

### Pair Address vs Token Address
- Frontend carries only `tokenAddress` through the trade flow.
- Backend token-detail endpoint finds `pairAddress` internally via DexScreener for OHLCV (`server/routes.ts:2248`).
- Backend trade execution does not require `pairAddress`; it uses `tokenAddress` for price lookup.
- **Verdict:** Pair address is not needed in frontend trade payload.

### Native Symbol / Balance Field
- Frontend: `activeChain === "solana" ? user?.balance : user?.baseBalance` (`TradeModal.tsx:246`).
- Backend: `chain === 'solana' ? user.balance : user.baseBalance` (`server/routes.ts:1645`).
- **Verdict:** Correct.

---

## Root-Cause Classification Summary

| # | Bug | Classification | File(s) |
|---|-----|----------------|---------|
| 1 | Base token `price` field loses precision because `Number(priceNative)` overflows `MAX_SAFE_INTEGER` | `CONTRACT_RESPONSE` | `server/services/marketRoutes.ts:55`, `shared/schema.ts:303` |
| 2 | Trending/New-Pairs/Hot list items omit `price` field entirely; only `priceNative` (string) is returned | `CONTRACT_RESPONSE` | `server/services/marketRoutes.ts:137-140`, `server/services/marketRoutes.ts:168-171`, `server/services/marketRoutes.ts:200-203` |
| 3 | Base trending/new-pairs/hot endpoints return empty arrays | `PRICE_SOURCE` / `LIQUIDITY_GATE` | `server/services/marketData.ts` |
| 4 | Frontend computes trade estimates client-side; never calls server quote endpoints | `PRICE_SOURCE` | `client/src/components/TradeModal.tsx:163-166` |
| 5 | Base trade execution fails with PostgreSQL bigint overflow (`priceNative` in wei > 9.2e18) | `DECIMALS` (backend schema) | `server/routes.ts:1704`, `server/storage.ts:530`, `shared/schema.ts:55` |
| 6 | Jupiter quote endpoints return 503 when `JUPITER_API_KEY` is missing | `PRICE_SOURCE` | `server/routes.ts:2439`, `server/services/jupiterService.ts` |
| 7 | `DialogContent` in `CommandDialog` lacks required `DialogTitle` for a11y | `CONTRACT_RESPONSE` (UI) | `client/src/components/ui/command.tsx:27` |
| 8 | Frontend has no WebSocket client; PumpPortal feed is unused | `WS_FEED` | Entire `client/src` tree |
| 9 | `BuyRequest` / `SellRequest` types in `shared/schema.ts` do not match runtime payloads | `CONTRACT_PAYLOAD` | `shared/schema.ts:331-341` |
| 10 | Production price endpoints (`/api/solana/price`, `/api/base/price`) return 503 when external APIs rate-limit | `PRICE_SOURCE` | `server/solPrice.ts`, `server/routes.ts:1153-1207` |
| 11 | Registration crashes Node.js v24 due to `console.error` formatting bug | BACKEND CRASH | `server/routes.ts:1069` |

---

## Blockers Requiring User Decision

### Blocker B1 — Base Trade Execution (Database Schema Overflow)

**Finding:** Any Base trade fails because `executionPriceNative` in wei exceeds PostgreSQL `bigint` max (`9.22e18`). WETH at $2,362 → `priceNative ≈ 2.37e21`.

**Impact:** Base trading is completely non-functional. This is not a frontend bug.

**Options:**
1. Change `positions.entry_price` and `tradeHistory.exit_price` columns from `bigint` to `numeric(78,0)` (PostgreSQL arbitrary-precision) — requires migration.
2. Store Base prices in a smaller unit (e.g., gwei = `10^9`) instead of wei — requires changing all Base price math in backend.
3. Store prices as strings in the DB — requires changing Drizzle schema and all query logic.

**Recommendation:** Option 1 (`numeric(78,0)`) is the minimal change that preserves precision and keeps the code math unchanged. This requires a migration and touching `shared/schema.ts` and `server/storage.ts`.

**Prompt rule check:** Non-negotiable #2 says "Do not modify backend code unless Phase 2 explicitly concludes a backend fix is required." Phase 1 has concluded that Base trading is impossible without this backend schema change. **I am surfacing this as a blocker before any backend code is touched.**

---

## Appendix: Raw Network Captures

### A1. Search — Solana
```http
GET /api/market/search?q=bonk&chain=solana HTTP/1.1
Host: localhost:5000

HTTP/1.1 200 OK
Content-Type: application/json

{"results":[...],"count":7,"query":"bonk"}
```

### A2. Token Detail — Base (WETH)
```http
GET /api/market/token/0x4200000000000000000000000000000000000006?chain=base HTTP/1.1
Host: localhost:5000

HTTP/1.1 200 OK
Content-Type: application/json

{"tokenAddress":"0x4200000000000000000000000000000000000006","name":"L2 Standard Bridged WETH (Base)","symbol":"weth","priceNative":"2362548200000000000000","priceUsd":2362.54,"price":2.3625482e+21,...}
```

### A3. Buy — Solana (Success)
```http
POST /api/trades/buy HTTP/1.1
Host: localhost:5000
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1Ni...
X-Idempotency-Key: test-key-3

{"tokenAddress":"DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263","tokenName":"Bonk","tokenSymbol":"Bonk","amount":"0.1","chain":"solana"}

HTTP/1.1 200 OK
Content-Type: application/json

{"message":"Position processed successfully","positionId":"1b34e0ed-dcad-4757-81d1-ffd04a674eb7","newBalance":"9900000000","tokensReceived":"1408450704225","executionPrice":"71","chain":"solana"}
```

### A4. Buy — Base (Failure)
```http
POST /api/trades/buy HTTP/1.1
Host: localhost:5000
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1Ni...
X-Idempotency-Key: test-key-2

{"tokenAddress":"0x4200000000000000000000000000000000000006","tokenName":"Wrapped ETH","tokenSymbol":"WETH","amount":"0.01","chain":"base"}

HTTP/1.1 500 Internal Server Error
Content-Type: application/json

{"error":"Could not execute buy order"}
```

### A5. Server Log — Base Buy Crash
```
💰 Server-side execution (ANTI-CHEAT) on base:
   DexScreener price: 2362548700000000000000 native units/token
   Execution price (+0.5% slippage): 2374361443500000000000 native units/token
📊 Buy: 0.01 ETH → 0.000004 tokens
Buy error: error: value "2374361443500000000000" is out of range for type bigint
    at /workspaces/SimFI/node_modules/pg/lib/client.js:545:17
    at async DbStorage.executeBuyTrade (/workspaces/SimFI/server/storage.ts:493:12)
```

### A6. Sell — Solana (Success)
```http
POST /api/trades/sell HTTP/1.1
Host: localhost:5000
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1Ni...
X-Idempotency-Key: test-key-4

{"positionId":"1b34e0ed-dcad-4757-81d1-ffd04a674eb7","amountLamports":"100000000000","chain":"solana"}

HTTP/1.1 200 OK
Content-Type: application/json

{"message":"Position closed successfully","profitLoss":"-100000","nativeReceived":"7000000","executionPrice":"70","chain":"solana"}
```
