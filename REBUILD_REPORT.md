# SimFI Frontend Rebuild Report

> Complete editorial-luxury redesign of the SimFI trading platform frontend.  
> **Scope:** Client-side React application only. Backend untouched.

---

## Executive Summary

The SimFI frontend was rebuilt from the ground up over **5 phases** spanning ~20 pages, 20+ UI primitives, and a new design system. Every file was rewritten with:

- **Zero neon / zero gradients** — warm near-black (`#0a0a0b`) canvas with muted emerald (`#3fa876`) and oxblood (`#c24d4d`) accents.
- **Editorial typography** — Instrument Serif for display headlines, Inter for UI copy, JetBrains Mono for all numbers (`tabular-nums`).
- **Strict type safety** — all rewritten files pass `tsc --noEmit`.
- **API contract preservation** — every endpoint, payload shape, and WebSocket event matches the original backend exactly.
- **Multi-chain parity** — Base and Solana flows are visually and functionally identical.

---

## Phase 1 — Audit

**Deliverable:** `AUDIT.md`

- Mapped all 18 wouter routes and their page components.
- Catalogued every API endpoint consumed by the frontend.
- Inventoried WebSocket event types.
- Listed every shadcn/ui primitive and its usage status.
- Flagged 40+ unused/orphaned components for later deletion.

---

## Phase 2 — Design System

**Deliverables:** `DESIGN_SYSTEM.md`, `client/src/styles/tokens.css`, `client/src/styles/typography.css`, updated `tailwind.config.ts` and `client/index.html`.

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-base` | `#0a0a0b` | Page background |
| `--bg-raised` | `#141416` | Cards, panels, inputs |
| `--text-primary` | `#f5f3ee` | Headings, primary copy |
| `--text-secondary` | `#9a9894` | Labels, descriptions |
| `--accent-gain` | `#3fa876` | Positive PnL, buy buttons |
| `--accent-loss` | `#c24d4d` | Negative PnL, sell buttons |
| `--accent-premium` | `#c9a96e` | Rank badges, highlights |
| `--border-subtle` | `rgba(255,255,255,0.06)` | Card borders |
| `--border-strong` | `rgba(255,255,255,0.12)` | Focus rings, dividers |

**Typography scale:** 5 display sizes (hero through caption), all using `font-mono tabular-nums` for numeric values.

**Google Fonts:** Trimmed to 3 families (Instrument Serif, Inter, JetBrains Mono) with `display=swap`.

---

## Phase 3 — Primitives

### Restyled shadcn/ui components (15+)

| Component | Key changes |
|-----------|-------------|
| `Button` | Ghost variant as primary; minimal padding; focus ring uses `border-strong` |
| `Input` | `bg-raised` background; subtle border; focus glow removed |
| `Dialog` | `bg-base` overlay; no drop-shadow; 1px border |
| `Card` | `bg-raised`; `border-subtle`; hover transition on border color |
| `Badge` | 4 variants: default, secondary, outline, premium |
| `Tabs` | Underline style; active tab uses `text-primary` |
| `Skeleton` | Shimmer animation; `bg-raised` base |
| `Toast` | Bottom-right stack; inherits palette |
| `Tooltip` | `bg-overlay` backdrop; `text-primary` |
| `DropdownMenu` | `bg-raised`; 1px separators |
| `Select` | Custom chevron; `bg-raised` |
| `Textarea` | Matches Input styling |
| `Label` | `text-secondary`; uppercase tracking |
| `Command` | Search palette for global token search (cmd+K) |

### New custom primitives

| Component | Purpose |
|-----------|---------|
| `DataCell` | Mono numeric display with gain/loss/neutral coloring and diff arrow |
| `AddressPill` | Truncated address with copy-to-clipboard and explorer link |
| `ChainChip` | Inline chain identifier (Base = blue-400, Solana = violet-400) with optional rank tier |
| `GlossaryTooltip` | Hover definitions for trading jargon (extensible dictionary) |

---

## Phase 4 — Pages & Layout

### 4.1 — Layout Shell

- **`Navigation.tsx`** — Fixed top bar with scroll-aware glassmorphism (`backdrop-blur`). Contains:
  - Wordmark logo (Instrument Serif)
  - Desktop nav links
  - `CommandSearch` (cmd+K global token search via DexScreener)
  - Segmented chain switcher (Base / Solana pill)
  - User dropdown with dual-chain balances
  - Mobile hamburger overlay (`AnimatePresence`)
- **`MobileNav.tsx`** — Bottom tab bar on viewports `< 768px` with 5 primary actions.
- **`Footer.tsx`** — Minimal 3-column footer with social links and legal.

### 4.2 — Landing (`Trade.tsx`, route `/`)

- Editorial hero with staggered `framer-motion` entrance.
- Live token search (debounced 400ms) hitting `/api/market/search`.
- Quick links to Trending and Leaderboard.
- Feature grid (Paper Trading, Multi-Chain, Analytics) with hover border transitions.

### 4.3 — Trading

- **`TradePage.tsx`** (new route `/trade`) — Two-pane layout:
  - Left: sortable token list with live price, 24h change, volume.
  - Right: `TokenChart` + `TradeModal` trigger.
- **`TokenPage.tsx`** (route `/token/:address`) — Token detail with hero strip, stats row, chart, trade panel, and position card if held.
- **`TradeModal.tsx`** — Buy/sell dialog:
  - Server-authoritative pricing via `useQuery` (2.5s refetch).
  - Buy: amount input + quick-select buttons (0.1, 0.5, 1, 2, 5).
  - Sell: percentage slider (25/50/75/100).
  - Idempotency key header preserved via `apiRequest` wrapper.
  - Risk score card container commented for future hook.
- **`TokenChart.tsx`** — Lightweight Charts wrapper:
  - Candlestick + volume, dark theme matching tokens.
  - Timeframes: 5S, 15S, 30S, 1M, 3M, 5M.
  - Auto-refresh every 30s.

### 4.4 — Portfolio & Positions

- **`Portfolio.tsx`** — Summary cards (Total Value, Invested, Unrealized P&L, Win Rate), balance history `recharts` LineChart, sortable positions table.
- **`Positions.tsx`** — Compact list view of open positions with quick-sell buttons.
- **`History.tsx`** — Paginated trade history with filter chips (Buy / Sell / All).

### 4.5 — Leaderboard

- **`Leaderboard.tsx`** — Three tabs: Current 6h Period, All-Time, Past Winners.
- Live countdown timer to period end.
- Top 3 styled with champagne (`#c9a96e`) borders.
- Rows use `DataCell` and `ChainChip`.

### 4.6 — Trader Profile

- **`TraderProfile.tsx`** (route `/trader/:username`) — Public profile with:
  - Avatar + bio header
  - Performance stats (Win Rate, Avg Return, Best Trade)
  - Recent trades table
  - Achievement badges (rendered if data present)

### 4.7 — Auth

- **`Login.tsx`** — Minimal form (username + password) with `zod` validation.
- **`Register.tsx`** — Extended form with wallet address, chain selector, referral code.
- Both use `apiRequest` wrapper and redirect to `/` on success.

### 4.8 — Utility Pages

- **`Dashboard.tsx`** — Post-login home with quick stats, recent activity, and achievement preview.
- **`About.tsx`** — Product philosophy and team section.
- **`Trending.tsx`** — Trending tokens table with chain filter.
- **`Referrals.tsx`** — Invite link, stats cards, and stubbed top-referrers table.
- **`WhaleWatch.tsx`** — Large transaction feed with value thresholds.
- **`TokenAnalyzer.tsx`** — On-chain heuristics (holder concentration, freshness) with placeholder for AI insights.
- **`not-found.tsx`** — Editorial 404 with animated elements.

### 4.9 — Design System Showcase

- **`DesignSystem.tsx`** (route `/_design`, dev-only) — Interactive gallery of every primitive, token swatch, and typography scale.

### 4.10 — Cleanup

- Deleted **40+ unused/orphaned components**, including:
  - All unstyled shadcn primitives (`accordion`, `calendar`, `carousel`, etc.)
  - All V2 shell components (`AppShellV2`, `NavigationV2`, `OmniSearch`)
  - All orphaned feature components (`PositionsBar`, `TokenAnalysis`, `WalletExplorer`, etc.)
  - `Rewards.tsx` page (no route points to it per instructions)

---

## Quality Gates

### TypeScript

```bash
npx tsc --noEmit
```

- **Frontend:** ✅ Zero errors across all rewritten files.
- **Backend:** 6 pre-existing errors in `server/index.ts` and `server/services/bagsService.ts` — untouched per scope instructions.

### API Contract Integrity

Every rewritten page was audited against the original `AUDIT.md` endpoint table:

| Endpoint | Method | Used by | Status |
|----------|--------|---------|--------|
| `/api/auth/register` | POST | Register.tsx | ✅ |
| `/api/auth/login` | POST | Login.tsx | ✅ |
| `/api/auth/me` | GET | auth-context.tsx | ✅ |
| `/api/auth/logout` | POST | Navigation.tsx | ✅ |
| `/api/market/search` | GET | Trade.tsx, CommandSearch.tsx | ✅ |
| `/api/market/trending` | GET | Trending.tsx | ✅ |
| `/api/market/token/:address` | GET | TokenPage.tsx | ✅ |
| `/api/tokens/:address/ohlcv` | GET | TokenChart.tsx | ✅ |
| `/api/trades/buy` | POST | TradeModal.tsx | ✅ |
| `/api/trades/sell` | POST | TradeModal.tsx | ✅ |
| `/api/portfolio` | GET | Portfolio.tsx | ✅ |
| `/api/positions` | GET | Positions.tsx, Portfolio.tsx | ✅ |
| `/api/history` | GET | History.tsx | ✅ |
| `/api/leaderboard/overall` | GET | Leaderboard.tsx | ✅ |
| `/api/leaderboard/current-period` | GET | Leaderboard.tsx | ✅ |
| `/api/whales` | GET | WhaleWatch.tsx | ✅ |
| `/api/analyze/:address` | GET | TokenAnalyzer.tsx | ✅ |
| WebSocket `price_update` | — | PriceProvider | ✅ |

### Auth Flow

- Registration → Login → Dashboard flow verified.
- Token stored in `localStorage` under `simfi_auth_token`.
- Logout clears token and refreshes `window.location`.

### Idempotency

All trade mutations include `X-Idempotency-Key` header via `apiRequest` wrapper — preserved from original implementation.

### Multi-Chain

- Chain switcher updates `ChainContext` and `localStorage`.
- All data-fetching hooks pass `chain` query param.
- `formatBalance` and `formatUSD` handle both SOL and ETH correctly.

---

## Files Changed

**Total commits:** 10  
**Files modified:** ~60  
**Files deleted:** 42  
**Lines changed:** ~2,900 insertions, ~8,950 deletions (net reduction through cleanup)

### Key new files

```
client/src/styles/tokens.css
client/src/styles/typography.css
client/src/components/ui/data-cell.tsx
client/src/components/ui/chain-chip.tsx
client/src/components/ui/address-pill.tsx
client/src/components/CommandSearch.tsx
client/src/components/MobileNav.tsx
client/src/pages/TradePage.tsx
client/src/pages/DesignSystem.tsx
client/src/lib/token-format.ts
```

### Key rewritten files

```
client/src/components/Navigation.tsx
client/src/components/TradeModal.tsx
client/src/components/TokenChart.tsx
client/src/pages/Trade.tsx
client/src/pages/TokenPage.tsx
client/src/pages/Portfolio.tsx
client/src/pages/Positions.tsx
client/src/pages/History.tsx
client/src/pages/Leaderboard.tsx
client/src/pages/TraderProfile.tsx
client/src/pages/Dashboard.tsx
client/src/pages/Login.tsx
client/src/pages/Register.tsx
client/src/pages/About.tsx
client/src/pages/Trending.tsx
client/src/pages/Referrals.tsx
client/src/pages/WhaleWatch.tsx
client/src/pages/TokenAnalyzer.tsx
client/src/pages/not-found.tsx
client/src/App.tsx
```

---

## Known Issues & Next Steps

See `FUTURE_HOOKS.md` for a detailed list of extension points. High-priority items:

1. **Backend type fixes** — `server/index.ts` (implicit `any` params) and `server/services/bagsService.ts` (`Transaction` vs `VersionedTransaction`).
2. **Risk scoring** — Uncomment card in `TradeModal.tsx` once `/api/tokens/:address/risk` exists.
3. **Rank tiers** — Populate `rank` prop on `ChainChip` once API returns `rankTier`.
4. **Referral leaderboard** — Replace mock data with `GET /api/referrals/leaderboard`.
5. **URL chain persistence** — Append `?chain=` to routes for shareable links.

---

## Design Principles Applied

1. **Restraint over flash.** No gradients, no neon glows, no heavy drop shadows. The palette is muted and warm.
2. **Typography is hierarchy.** Instrument Serif carries all display weight; Inter handles UI density; JetBrains Mono makes numbers scannable.
3. **Motion with purpose.** Every animation uses the same easing curve (`[0.16, 1, 0.3, 1]`) and short durations (150–300ms).
4. **Information density.** Tables are tight, labels are small and uppercase, whitespace is generous around groups but not within them.
5. **Mobile-first shell.** Bottom nav on mobile, top nav on desktop. The same content renders in both; only chrome changes.

---

*Report compiled 2026-04-17*
