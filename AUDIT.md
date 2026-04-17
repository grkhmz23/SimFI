# SimFi Frontend Rebuild — AUDIT.md

> Phase 1 deliverable. Read, verified, and locked against `server/routes.ts`, `server/services/*.ts`, `shared/schema.ts`, and every file under `client/src/`.

---

## 1. Route Map

All routing is handled in `client/src/App.tsx` via **wouter** (`<Switch>` + `<Route>`). Every route except `/login` and `/register` is wrapped in `<PageLayout>` which renders `<Navigation />`, the page component, and `<Footer />`.

| Route | Page Component | Key Data Fetched | Backend Endpoints Hit |
|-------|---------------|------------------|----------------------|
| `/login` | `Login` | `useAuth`, `useMutation` | `POST /api/auth/login` |
| `/register` | `Register` | `useAuth`, `useChain`, `useMutation` | `POST /api/auth/register` |
| `/` | `Trade` | `useAuth`, `useChain`, `useQuery` | `GET /api/market/search?q=&chain=` |
| `/token/:address` | `TokenPage` | `useAuth`, `useChain`, `useQuery` (token + positions) | `GET /api/market/token/:address?chain=`, `GET /api/trades/positions?chain=` |
| `/trending` | `Trending` | `useChain`, `useQuery` x3 | `GET /api/market/trending?chain=`, `GET /api/market/new-pairs?chain=&age=`, `GET /api/market/hot?chain=` |
| `/dashboard` | `Dashboard` | `useAuth`, `usePrice`, `useQuery` x3, `useMutation` | `GET /api/auth/profile`, `GET /api/achievements`, `GET /api/streak`, `PUT /api/auth/profile`, `POST /api/streak/claim` |
| `/portfolio` | `Portfolio` | `useAuth`, `useChain`, `useQuery` x2, `useMutation` | `GET /api/trades/positions?chain=`, `GET /api/portfolio/analytics?chain=`, `POST /api/trades/sell-all` |
| `/positions` | `Positions` | `useAuth`, `useChain`, `useQuery` | `GET /api/trades/positions?chain=` |
| `/history` | `History` | `useChain`, `useQuery` | `GET /api/trades/history?page=&chain=` |
| `/leaderboard` | `Leaderboard` | `useQuery` x3 | `GET /api/leaderboard/overall?chain=`, `GET /api/leaderboard/current-period?chain=`, `GET /api/leaderboard/winners` |
| `/study` | `TokenAnalyzer` | None (static "Coming Soon") | None |
| `/about` | `About` | None (static) | None |
| `/referrals` | `Referrals` | `useEffect` + raw `fetch` | `GET /api/referrals/me` |
| `/trader/:username` | `TraderProfile` | `useAuth`, `useToast`, raw `fetch` | `GET /api/traders/:username`, `GET /api/traders/:username/trades`, `POST /api/traders/:username/follow` |
| `/whales` | `WhaleWatch` | `useState`, raw `fetch` | `GET /api/whales/activity?chain=` |
| `*` | `NotFound` | None | None |

> **Critical Gap:** The `Rewards` page (`client/src/pages/Rewards.tsx`) exists but is **not registered in the router**. It fetches `/api/rewards/status`, `/api/rewards/rules`, and `/api/rewards/history` but has no accessible route. The backend routes are also **commented out** in `registerRoutes`.

---

## 2. API Contract Table

Extracted from `server/routes.ts`, `server/marketRoutes.ts`, and `server/services/*.ts`.

### Auth
| Method | Path | Auth | Rate Limit | Request Body | Response Shape |
|--------|------|------|------------|--------------|----------------|
| POST | `/api/auth/register` | — | `authLimiter` (20/15min) | `{ username, email, password, solanaWalletAddress?, baseWalletAddress?, preferredChain? }` | `{ user: UserWithoutPassword }` |
| POST | `/api/auth/login` | — | `authLimiter` (20/15min) | `{ email? \| username?, password }` | `{ user: UserWithoutPassword }` |
| POST | `/api/auth/logout` | — | — | — | `{ message: 'Logged out successfully' }` |
| GET | `/api/auth/profile` | `authenticateToken` | — | — | `UserWithoutPassword` (BigInts serialized) |
| PUT | `/api/auth/profile` | `authenticateToken` | — | `{ username?, solanaWalletAddress?, baseWalletAddress?, preferredChain?, password? }` | `{ message }` |

### Telegram / Bot
| Method | Path | Auth | Rate Limit | Request Body | Response Shape |
|--------|------|------|------------|--------------|----------------|
| POST | `/api/telegram/auth/register` | `x-bot-secret` | `botLimiter` (200/min) | `{ email, username, password, walletAddress? }` | `{ user, token }` |
| POST | `/api/telegram/auth/login` | `x-bot-secret` | `botLimiter` | `{ email? \| username?, password }` | `{ user, token }` |
| POST | `/api/telegram/session` | `x-bot-secret` | `botLimiter` | `{ telegramUserId, userId, token, balance }` | `{ session }` |
| GET | `/api/telegram/session/:id` | `x-bot-secret` | `botLimiter` | — | `{ session }` |
| DELETE | `/api/telegram/session/:id` | `x-bot-secret` | `botLimiter` | — | `{ message }` |

### Trading
| Method | Path | Auth | Rate Limit | Request Body / Query | Response Shape |
|--------|------|------|------------|----------------------|----------------|
| GET | `/api/trades/positions` | `authenticateToken` | — | `?chain=solana\|base` | `{ positions: EnrichedPosition[] }` (adds `currentPrice`, `currentValue`) |
| POST | `/api/trades/buy` | `authenticateToken` | `ipBackstop` + `userTrade` (30/min) | `{ tokenAddress, tokenName, tokenSymbol, amount, chain }` + header `X-Idempotency-Key?` | `{ message, positionId, newBalance, tokensReceived, executionPrice, chain }` |
| POST | `/api/trades/sell` | `authenticateToken` | `ipBackstop` + `userTrade` (30/min) | `{ positionId, amountLamports?, chain? }` + header `X-Idempotency-Key?` | `{ message, profitLoss, nativeReceived, executionPrice, chain }` |
| POST | `/api/trades/sell-all` | `authenticateToken` | `ipBackstop` + `userTrade` | — | `501 { error: 'sell-all temporarily disabled' }` |
| GET | `/api/trades/history` | `authenticateToken` | — | `?page=N&chain=solana\|base` | `{ trades: Trade[], pagination: { page, limit, total, totalPages } }` |

### Market Data (`/api/market/*`) — via `marketRoutes.ts`
| Method | Path | Auth | Rate Limit | Request Body / Query | Response Shape |
|--------|------|------|------------|----------------------|----------------|
| GET | `/api/market/token/:address` | — | — | `?chain=solana\|base` | Token object + `cached`, `ageMs` |
| GET | `/api/market/tokens` | — | — | `?addresses=addr1,addr2&chain=solana\|base` (max 50) | `{ tokens: Record<addr, TokenData>, found, requested }` |
| GET | `/api/market/trending` | — | — | `?chain=solana\|base&limit=N` (max 50) | `{ trending: TokenData[], count, cachedAt }` |
| GET | `/api/market/new-pairs` | — | — | `?chain=solana\|base&age=1\|6\|24` (max 168h) | `{ newPairs: TokenData[], ageHours, count, cachedAt }` |
| GET | `/api/market/hot` | — | — | `?chain=solana\|base&limit=N` | `{ hot: TokenData[], count, cachedAt }` |
| GET | `/api/market/search` | — | `searchLimiter` (20/min) | `?q=query&chain=solana\|base` | `{ results: SearchResult[], count, query }` |
| GET | `/api/market/stats` | — | — | — | `{ market: Stats, quotes: Stats, timestamp }` |

### Quotes (`/api/quote*`) — via `marketRoutes.ts`
| Method | Path | Auth | Rate Limit | Request Body / Query | Response Shape |
|--------|------|------|------------|----------------------|----------------|
| GET | `/api/quote` | `authenticateToken` | — | `?token=addr&chain=solana\|base&side=buy\|sell&amountNative=?&amountTokens=?` | `QuoteResponse { quoteId, tokenAddress, side, chain, priceNative, estimatedOutput, expiresAt, expiresInMs, priceImpactBps, nativeSymbol }` |
| GET | `/api/quote/:quoteId` | `authenticateToken` | — | — | `{ quoteId, tokenAddress, chain, side, priceNative, estimatedOutput, expiresAt, expiresInMs, valid }` |

### Legacy Token Routes (`/api/tokens/*`) — Solana-biased
| Method | Path | Auth | Rate Limit | Request Body / Query | Response Shape |
|--------|------|------|------------|----------------------|----------------|
| GET | `/api/trending` | — | `publicApiLimiter` (60/min) | `?chain=solana\|base` | `{ trending: EnrichedToken[] }` |
| GET | `/api/tokens/search` | — | `searchLimiter` (20/min) | `?q=query&chain=solana\|base` | `{ results: TokenSearchResult[] }` |
| GET | `/api/tokens/:address/ohlcv` | — | `searchLimiter` | `?timeframe=5S\|15S\|30S\|1M\|3M\|5M&chain=solana\|base` | `{ success, candles: number[][], pairAddress, timeframe, candleCount }` |
| GET | `/api/tokens/:address` | — | `searchLimiter` | — | `{ token: Token }` *(Hardcoded Solana — see Mismatch #3)* |
| GET | `/api/tokens/quote/buy` | — | `publicApiLimiter` | `?tokenAddress=&solAmount=&decimals?` | `{ solAmount, solAmountLamports, tokenAmountOut, ... }` *(Solana-only)* |
| GET | `/api/tokens/quote/sell` | — | `publicApiLimiter` | `?tokenAddress=&tokenAmount=&decimals?` | `{ tokenAmount, tokenAmountUnits, solAmountOut, ... }` *(Solana-only)* |

### Study / Helius
| Method | Path | Auth | Rate Limit | Request Body / Query | Response Shape |
|--------|------|------|------------|----------------------|----------------|
| GET | `/api/analyze/:mintAddress` | — | — | — | TokenAnalysis (redirects to enhanced helius) |
| GET | `/api/study/token/:mintAddress` | — | — | — | TokenAnalysis |
| GET | `/api/study/wallet/:walletAddress` | — | — | — | WalletPortfolio |
| GET | `/api/study/transactions/:address` | — | — | `?limit=&before=&type=` | Transaction[] |
| GET | `/api/study/transaction/:signature` | — | — | — | TransactionDetails |
| GET | `/api/study/search` | — | — | `?q=` | SearchResult |
| POST | `/api/study/tokens/batch` | — | — | `{ mintAddresses: string[] }` (max 100) | TokenInfo[] |
| GET | `/api/study/stats` | — | — | — | UsageStats |

### Leaderboard
| Method | Path | Auth | Rate Limit | Request Body / Query | Response Shape |
|--------|------|------|------------|----------------------|----------------|
| GET | `/api/leaderboard/overall` | — | `publicApiLimiter` | `?chain=solana\|base` | `{ leaders: LeaderboardEntry[] }` |
| GET | `/api/leaderboard/current-period` | — | `publicApiLimiter` | `?chain=solana\|base` | `{ leaders, periodStart, periodEnd }` |
| GET | `/api/leaderboard/winners` | — | `publicApiLimiter` | — | `{ winners: PastWinner[] }` |

### Social / Achievements / Streaks
| Method | Path | Auth | Rate Limit | Request Body / Query | Response Shape |
|--------|------|------|------------|----------------------|----------------|
| GET | `/api/achievements` | `authenticateToken` | — | — | `{ achievements: UserAchievement[] }` |
| GET | `/api/portfolio/analytics` | `authenticateToken` | — | `?chain=solana\|base` | `PortfolioAnalytics { balanceHistory, winCount, lossCount, bestTrade, worstTrade, dailyPnl }` |
| GET | `/api/referrals/me` | `authenticateToken` | — | — | `{ username, referralLink, total, converted, pending }` |
| GET | `/api/referrals/leaderboard` | — | `publicApiLimiter` | — | `{ leaders: ReferralLeader[] }` |
| GET | `/api/traders/:username` | — | `publicApiLimiter` | — | `{ trader: PublicTraderStats }` |
| GET | `/api/traders/:username/trades` | — | `publicApiLimiter` | — | `{ trades: Trade[] }` |
| POST | `/api/traders/:username/follow` | `authenticateToken` | — | — | `{ following: boolean }` |
| GET | `/api/whales/activity` | — | `publicApiLimiter` | `?chain=solana\|base` | `{ activity: WhaleActivity[] }` |
| GET | `/api/streak` | `authenticateToken` | — | — | `{ streakCount, lastStreakDate, canClaim, nextBonus }` |
| POST | `/api/streak/claim` | `authenticateToken` | — | — | `{ streak, bonusEth, claimed }` |

### Misc
| Method | Path | Auth | Rate Limit | Request Body / Query | Response Shape |
|--------|------|------|------------|----------------------|----------------|
| GET | `/api/health` | — | `healthLimiter` (60/min) | — | `{ status: 'healthy' \| 'unhealthy', timestamp }` |
| GET | `/api/solana/price` | — | — | — | `{ price, available, timestamp }` |
| GET | `/api/base/price` | — | — | — | `{ price, available, timestamp }` |

### Rewards (DEAD — commented out in `registerRoutes`)
| Method | Path | Auth | Rate Limit | Request Body / Query | Response Shape |
|--------|------|------|------------|----------------------|----------------|
| GET | `/api/rewards/status` | — | — | — | `{ ok, enabled, isLeader, vaultBalance, ... }` |
| GET | `/api/rewards/history` | — | — | `?limit=` | `{ ok, history: Epoch[] }` |
| GET | `/api/rewards/rules` | — | — | — | `{ ok, rewardsPoolBps, payoutSplit, eligibility }` |
| POST | `/api/rewards/run` | Admin secret | — | — | `{ ok, message }` |
| GET | `/api/rewards/leader` | — | — | — | `{ ok, isLeader }` |

---

## 3. WebSocket Inventory

| Connection | Status | Path | Events / Messages |
|------------|--------|------|-----------------|
| **PumpPortal → Server** | **Dead code** | Outbound to `wss://pumpportal.fun/api/data` | Subscribes to `subscribeNewToken`, `subscribeMigration`. Receives token create/migrate events. |
| **Server → Frontend** | **Never initialized** | `/ws` | `initializePumpPortal(server)` is defined in `server/pumpportal.ts` but **never called** in `server/index.ts` or `server/routes.ts`. Intended events: `init`, `new`, `graduating`, `graduated`. |

**Finding:** No WebSocket server is running. The entire PumpPortal real-time feed is inactive.

---

## 4. Component Inventory

### Layout
| File | Purpose | Used By | Orphaned? |
|------|---------|---------|-----------|
| `components/Navigation.tsx` | Fixed top nav, search, chain selector, auth dropdown, mobile menu | `App.tsx` (PageLayout) | No |
| `components/ui/footer.tsx` | Site footer with links, social, newsletter | `App.tsx` (PageLayout) | No |
| `components/v2/NavigationV2.tsx` | Cleaner sticky nav + mobile bottom bar | **Nothing** | **Yes** |
| `components/v2/OmniSearch.tsx` | Cmd+K search modal using `cmdk` | `NavigationV2` | **Yes** |
| `v2/AppShellV2.tsx` | Layout shell with v2 background | **Nothing** | **Yes** |

### Trading
| File | Purpose | Used By | Orphaned? |
|------|---------|---------|-----------|
| `components/TradeModal.tsx` | Buy/Sell dialog with forms, price refresh | `TokenPage`, `Portfolio`, `Positions` | No |
| `components/TokenChart.tsx` | Lightweight Charts candlestick + volume | `TokenPage` | No |
| `components/ChainSelector.tsx` | Chain switcher (dropdown / pill / compact) + `ChainBadge` | `Navigation`, `Register`, `Trending` | No |
| `components/PositionsBar.tsx` | Compact sidebar list of open positions | **Nothing** | **Yes** |

### Charts / Analytics
| File | Purpose | Used By | Orphaned? |
|------|---------|---------|-----------|
| `components/PortfolioChart.tsx` | Recharts: balance line, win/loss pie, daily PnL bars | `Portfolio` | No |
| `components/TokenAnalysis.tsx` | Deep token analysis search UI (Helius data) | **Nothing** | **Yes** |
| `components/WalletExplorer.tsx` | Wallet portfolio explorer (tokens + NFTs) | **Nothing** | **Yes** |
| `components/TransactionHistory.tsx` | TX history search with type badges | **Nothing** | **Yes** |
| `components/RealtimeData.tsx` | Watchlist with mock price data | **Nothing** | **Yes** |
| `components/ReferralLeaderboard.tsx` | Top referrers list | **Nothing** | **Yes** |

### UI Primitives (shadcn/ui under `components/ui/`)
**Used primitives:**
`alert`, `badge`, `button`, `card`, `dialog`, `dropdown-menu`, `form`, `input`, `label`, `popover`, `select`, `separator`, `sheet`, `skeleton`, `switch`, `table`, `tabs`, `toast`, `toaster`, `toggle`, `tooltip`

**Unused / dead primitives (~26 files):**
`accordion`, `alert-dialog`, `animated-search-bar`, `ascii-orb`, `aspect-ratio`, `avatar`, `breadcrumb`, `calendar`, `carousel`, `command`, `context-menu`, `dotted-surface`, `drawer`, `fancy-ui`, `glowing-effect`, `gradient-button`, `hover-card`, `input-otp`, `menubar`, `navigation-menu`, `procedural-ground-background`, `radio-group`, `resizable`, `scroll-area`, `slider`, `textarea`, `toggle-group`

### Pages
| File | Purpose |
|------|---------|
| `pages/Login.tsx` | Auth login form |
| `pages/Register.tsx` | Registration form with wallet fields |
| `pages/Trade.tsx` | Homepage hero + token search |
| `pages/TokenPage.tsx` | Token detail + chart + buy/sell |
| `pages/Trending.tsx` | Trending / New Pairs / Hot tabs |
| `pages/Dashboard.tsx` | User profile, balances, streak, achievements |
| `pages/Portfolio.tsx` | Open positions table + analytics + sell-all |
| `pages/Positions.tsx` | Card-grid view of positions |
| `pages/History.tsx` | Paginated closed trades table |
| `pages/Leaderboard.tsx` | Overall / Current Period / Past Winners |
| `pages/About.tsx` | Static marketing / mission page |
| `pages/TokenAnalyzer.tsx` | "Study" — static Coming Soon page |
| `pages/Referrals.tsx` | Referral stats + link copy |
| `pages/TraderProfile.tsx` | Public trader profile with follow button |
| `pages/WhaleWatch.tsx` | Whale activity feed with chain toggle |
| `pages/Rewards.tsx` | Epoch rewards, countdown, history — **orphaned, no route** |
| `pages/not-found.tsx` | 404 fallback — **uses light mode colors** |

### Other Components
| File | Purpose | Used By | Orphaned? |
|------|---------|---------|-----------|
| `components/TokenCard.tsx` | Token card for listings | **Nothing** | **Yes** |
| `components/TrendingTokenCard.tsx` | Compact token row for trending | `Trending` | No |
| `components/AchievementBadge.tsx` | Badge display with tooltip | `Dashboard`, `TraderProfile` | No |
| `components/SharePnLCard.tsx` | Canvas-based share card + X tweet | `Portfolio`, `Leaderboard` | No |
| `components/WelcomePopup.tsx` | Onboarding modal with localStorage gate | `App.tsx` | No |

---

## 5. State / Context Inventory

### `AuthContext` (`lib/auth-context.tsx`)
- **State:** `user` (Omit<User, 'password'> | null), `loading`
- **Methods:** `setAuth`, `logout`, `refreshUser`, `getBalance(chain)`, `getWalletAddress(chain)`
- **Consumers:** Used across ~10 pages and `Navigation`, `TradeModal`
- **Notes:** Reads `/api/auth/profile` on mount. Holds dual-chain balance helpers.

### `ChainContext` (`lib/chain-context.tsx`)
- **State:** `activeChain` ('base' | 'solana'), persisted to `localStorage` under `simfi-preferred-chain`
- **Methods:** `setActiveChain`, `toggleChain`
- **Derived:** `nativeSymbol`, `nativeDecimals`, `isBase`, `isSolana`
- **Consumers:** Almost every page and trading component
- **Notes:** Defaults to `'base'`. Syncs with user profile preference on mount via a separate `fetch` call.

### `PriceContext` (`lib/price-context.tsx`)
- **State:** `solPriceUSD` (default 140), `ethPriceUSD` (default 3500)
- **Methods:** `getPrice(chain)`
- **Derived:** `activePriceUSD`
- **Consumers:** `Navigation`, `Dashboard`, `Portfolio`, `Positions`, `TradeModal`
- **Notes:** Fetches `/api/solana/price` and `/api/base/price` on mount, then refreshes every **30 seconds** via `setInterval`. Uses plain `fetch`, not React Query.

---

## 6. Hooks Inventory

| Hook | File | Purpose | Returns |
|------|------|---------|---------|
| `useAuth` | `lib/auth-context.tsx` | Access auth state | `user`, `setAuth`, `logout`, `refreshUser`, `isAuthenticated`, `getBalance`, `getWalletAddress` |
| `useChain` | `lib/chain-context.tsx` | Access chain state | `activeChain`, `setActiveChain`, `toggleChain`, `nativeSymbol`, `nativeDecimals`, `isBase`, `isSolana` |
| `useActiveChain` | `lib/chain-context.tsx` | Just the chain value | `Chain` |
| `usePrice` | `lib/price-context.tsx` | Access price state | `solPriceUSD`, `ethPriceUSD`, `activePriceUSD`, `getPrice` |
| `useActivePrice` | `lib/price-context.tsx` | Active chain price only | `number` |
| `useChainPrice` | `lib/price-context.tsx` | Price for specific chain | `number` |
| `useSolPrice` | `lib/price-context.tsx` | SOL price backward-compat | `number` |
| `useToast` | `hooks/use-toast.ts` | Toast notification system | `{ toasts[], toast, dismiss }` |
| `useIsMobile` | `hooks/use-mobile.tsx` | Mobile breakpoint detector | `boolean` |

---

## 7. Data Fetching Patterns

### QueryClient Config (`lib/queryClient.ts`)
- **Helper:** `apiRequest(method, url, data)` — wrapper around `fetch` with JSON body, `credentials: "include"`, and error parsing.
- **Helper:** `getQueryFn({ on401 })` — used as default `queryFn` for all queries; joins `queryKey` with `/` and fetches with credentials.
- **Defaults:**
  - `staleTime: 60000` (1 min)
  - `refetchInterval: false`
  - `refetchOnWindowFocus: false`
  - **Retry logic:** Up to 3 retries with exponential backoff. Skips retry on 401/403.
  - **Mutations:** Skip retry on 4xx errors.

### Query Key Patterns
| Query Key | Endpoint | Refetch Interval |
|-----------|----------|------------------|
| `['/api/market/search', query, chain]` | `GET /api/market/search?q=&chain=` | None |
| `['/api/tokens/:address', chain]` | `GET /api/market/token/:address?chain=` | **5s** |
| `['/api/market/token/:address', chain]` | Same as above | **2.5s** (TradeModal) |
| `['/api/trades/positions', chain]` | `GET /api/trades/positions?chain=` | **2.5s–5s** |
| `['/api/trades/history', page, chain]` | `GET /api/trades/history?page=&chain=` | None |
| `['/api/leaderboard/overall']` | `GET /api/leaderboard/overall` | None |
| `['/api/leaderboard/current-period']` | `GET /api/leaderboard/current-period` | None |
| `['/api/leaderboard/winners']` | `GET /api/leaderboard/winners` | None |
| `['/api/auth/profile']` | `GET /api/auth/profile` | **5s** |
| `['/api/achievements']` | `GET /api/achievements` | None |
| `['/api/streak']` | `GET /api/streak` | **30s** |
| `['/api/portfolio/analytics', chain]` | `GET /api/portfolio/analytics?chain=` | None |
| `['/api/rewards/status']` | `GET /api/rewards/status` | **30s** *(orphaned)* |

### Anti-Patterns
- Several components bypass React Query and use raw `fetch` inside `useEffect`: `Referrals`, `TraderProfile`, `WhaleWatch`, `ReferralLeaderboard`.
- `PriceContext` uses raw `fetch` + `setInterval` instead of React Query.
- `TokenPage` and `TradeModal` both run independent high-frequency refetches for the same token data.

---

## 8. Known Issues / Code Smells

### Critical / Functional
1. **Rewards page is orphaned** — `Rewards.tsx` exists and has full UI + data fetching, but there is **no `<Route>` for it in `App.tsx`**.
2. **Duplicate `TrendingUp` import** in `Navigation.tsx` (lines 20 and 35). One is unused.
3. **Duplicate component files:**
   - `GlowingEffect` exists in both `components/ui/glowing-effect.tsx` and `components/ui/fancy-ui.tsx`
   - `AnimatedSearchBar` exists in both `components/ui/animated-search-bar.tsx` and `components/ui/fancy-ui.tsx`
   - `GradientButton` exists in both `components/ui/gradient-button.tsx` and `components/ui/fancy-ui.tsx`
4. **V2 shell is dead code** — `AppShellV2`, `NavigationV2`, `OmniSearch`, and `ui-version.ts` are fully implemented but **never imported by App.tsx**.
5. **Hardcoded chain bias in "Study" components:**
   - `TokenAnalysis.tsx` hardcodes `solscan.io` links (Solana-only).
   - `TransactionHistory.tsx` hardcodes `solscan.io` links and SOL fee display.
   - `WalletExplorer.tsx` hardcodes `solscan.io` links and SOL balance.
   - `RealtimeData.tsx` uses `Math.random()` for mock prices with a "Coming Soon" disclaimer.
6. **Broken `formatUSD` usage in `Portfolio` and `Positions`:** `formatUSD(value, 2)` is called with only 2 args, but the backward-compatible overload expects either `(amount, decimals)` or `(amount, price, chain, decimals)`. When called with `(bigint, 2)`, it treats `2` as `decimals` and returns raw amount with `$` prefix — **not converting to USD at all**.
7. **`lamports.ts` is a circular re-export** — it re-exports `token-format.ts` and is itself re-exported by `token-format.ts` (`formatLamports`, `formatWei`).
8. **`not-found.tsx` uses light mode colors** (`bg-gray-50`, `text-gray-900`) while the rest of the app is dark-themed.

### Backend ↔ Frontend Mismatches
9. **`SellRequest` interface (`shared/schema.ts`)** defines `amount?: number` and `exitPrice: number`, but the route handler expects **`amountLamports`** and ignores `exitPrice`.
10. **`BuyRequest` interface** defines `price: number`, but the route handler **intentionally ignores** the client price. The interface should not include it.
11. **`/api/tokens/:address` is Solana-only** — uses `findBestSolanaPair` with no chain parameter. Base tokens will return wrong data or 404.
12. **`/api/trades/positions` price enrichment is Solana-only** — calls `findBestSolanaPair` regardless of the `chain` query param. Base positions will get incorrect `currentPrice`.
13. **`/api/tokens/quote/buy` and `/api/tokens/quote/sell` are hardcoded to Solana** — both use `SOL_MINT` and call Jupiter. No Base/ETH equivalent.
14. **WebSocket at `/ws` is never initialized** — `initializePumpPortal` is dead code. Real-time token feed UI will never connect.

### Visual / Professionalism
15. `TokenAnalyzer` ("Study") is a pure marketing placeholder with `motion.div` animations and "Soon" badges — contains no actual functionality.
16. `RealtimeData.tsx` displays **randomly generated mock prices** (`Math.random() * 100`) with "Demo" label. Misleading for a production platform.
17. `Navigation.tsx` line 197 uses `-z-10` inside a `motion.button` for an active indicator; could render below parent backgrounds.
18. `TokenPage.tsx` uses inline `try/catch` IIFE for position value calculation rather than a helper function.
19. `SharePnLCard.tsx` uses `ctx.roundRect()` — not supported in older Safari versions (pre-2022), may crash.
20. **29 Google Font families** are loaded in `index.html` but Tailwind only uses `Space Grotesk`, `Inter`, and system fonts.

---

## 9. Assets

### `client/public/`
| File | Usage |
|------|-------|
| `favicon.ico` | Not referenced in `index.html` (uses PNG instead) |
| `favicon.png` | Not referenced |
| `poop-up.png` | **Dead asset** — not referenced anywhere |
| `security.txt` | Standard security contact file |
| `simfi-logo.png` | Favicon, apple-touch-icon, Navigation logo, Footer logo, WelcomePopup logo |
| `site.webmanifest` | PWA manifest |

### External Fonts (Google Fonts)
Loaded in `client/index.html`:
`Architects Daughter`, `DM Sans`, `Fira Code`, `Geist Mono`, `Geist`, `IBM Plex Mono`, `IBM Plex Sans`, `Inter`, `JetBrains Mono`, `Libre Baskerville`, `Lora`, `Merriweather`, `Montserrat`, `Open Sans`, `Outfit`, `Oxanium`, `Playfair Display`, `Plus Jakarta Sans`, `Poppins`, `Roboto Mono`, `Roboto`, `Source Code Pro`, `Source Serif 4`, `Space Grotesk`, `Space Mono`

**Issue:** The app declares **29 font families** but Tailwind is configured to use only `Space Grotesk`, `Inter`, and system fonts. The rest are unused page weight.

---

## 10. Database Schema Summary

### Core Tables
| Table | Key Fields |
|-------|-----------|
| `users` | `id`, `username`, `email`, `password`, `solanaWalletAddress`, `baseWalletAddress`, `balance` (lamports), `baseBalance` (wei), `totalProfit`, `baseTotalProfit`, `preferredChain`, `streakCount`, `lastStreakDate` |
| `positions` | `id`, `userId`, `chain`, `tokenAddress`, `tokenName`, `tokenSymbol`, `decimals`, `entryPrice`, `amount`, `solSpent`, `openedAt`. Unique: `(userId, tokenAddress, chain)` |
| `trade_history` | `id`, `userId`, `chain`, `tokenAddress`, `entryPrice`, `exitPrice`, `amount`, `solSpent`, `solReceived`, `profitLoss`, `openedAt`, `closedAt` |
| `leaderboard_periods` | `id`, `chain`, `startTime`, `endTime`, `winnerId`, `winnerProfit` |

### Gamification Tables
| Table | Purpose |
|-------|---------|
| `user_achievements` | Unlocked badges (`first_trade`, `base_beginner`, `profit_1eth`, etc.) |
| `referrals` | Referrer/referee tracking with `pending`/`converted` status |
| `follows` | Social follows (followerId → followingId) |
| `telegram_sessions` | Bot session storage with expiry |

### Rewards Tables (currently unused)
| Table | Purpose |
|-------|---------|
| `rewards_state` | Singleton state: carry, treasury, last processed period |
| `rewards_epochs` | Per-period epoch: inflow, pot, payout plan, tx signatures, status |
| `rewards_winners` | Ranked winners per epoch with payout amounts |

### Shared Types
- `Chain = 'solana' | 'base'`
- `Token` interface: `tokenAddress`, `name`, `symbol`, `decimals?`, `price`, `priceUsd?`, `marketCap`, `volume24h?`, `priceChange24h?`, `creator?`, `timestamp?`, `icon?`, `chain?`
- `LeaderboardEntry`: `id`, `username`, `walletAddress?`, `totalProfit?`, `periodProfit?`, `balance?`, `rank?`, `chain?`
- `BuyRequest`: `tokenAddress`, `tokenName`, `tokenSymbol`, `amount`, `price`, `chain`
- `SellRequest`: `positionId`, `amount?`, `exitPrice`, `chain`

---

## 11. External Service Integrations

| Service | APIs Used | Purpose |
|---------|-----------|---------|
| **DexScreener** | `api.dexscreener.com/latest/dex/tokens/{mint}`, `token-profiles/latest/v1` | Token prices, market caps, metadata, search |
| **Jupiter** | `price.jup.ag/v6/price`, Swap V2 `/order`, Token API v1 | SOL price, swap quotes, token metadata |
| **CoinGecko** | `api.coingecko.com/api/v3/simple/price` | Native token prices (SOL, ETH) |
| **Binance** | `api.binance.com/api/v3/ticker/price` | Native token prices (SOLUSDT, ETHUSDT) |
| **DefiLlama** | Free price API | Base token prices |
| **GeckoTerminal** | OHLCV endpoint | Chart candle data |
| **Helius** | RPC (`mainnet.helius-rpc.com`), REST (`api.helius.xyz/v0`) | Token metadata, balances, transactions, NFTs |
| **PumpPortal** | WebSocket `wss://pumpportal.fun/api/data` | Real-time new token & migration events (dead code) |
| **Birdeye** | Token metadata fallback, whale feed | Enrichment |
| **PostgreSQL** | Advisory locks (`pg_try_advisory_lock`) | Leader election for background jobs |

---

## 12. Auth Flow (Exact)

1. **Registration/Login:**
   - `POST /api/auth/register` validates with Zod (`insertUserSchema`), hashes password with `bcrypt` (10 rounds).
   - `POST /api/auth/login` accepts email **or** username, verifies password with `bcrypt.compare`.
   - Server signs JWT: `jwt.sign({ id, username }, JWT_SECRET, { expiresIn: '24h' })`.
   - Sets **HttpOnly** cookie `token` with `secure` (production), `sameSite: strict/lax`, maxAge 24h.
   - Also returns user object in JSON.

2. **Request Authentication:**
   - `authenticateToken` middleware checks `req.cookies.token` **first**, then falls back to `Authorization: Bearer <token>` header.
   - Verifies with `process.env.JWT_SECRET || process.env.SESSION_SECRET`.
   - On success, attaches `req.userId` and `req.username`.
   - On failure, returns `401` (no token) or `403` (invalid/expired).

3. **Logout:**
   - `res.clearCookie('token', ...)` removes the cookie.

---

*End of AUDIT.md. Locked against codebase at commit `6d1ec52`.*
