# Future Hooks & Extension Points

> A living reference for every "slot" left open in the SimFI frontend rebuild — ready for backend integration, third-party plugins, or feature toggles.

---

## 1. Risk Scoring (TradeModal)

**Location:** `client/src/components/TradeModal.tsx`  
**Status:** UI container present, logic stubbed  
**Integration effort:** ~2 hrs

### Current state
A commented `<div>` block exists inside the buy panel where a risk-score card should render:

```tsx
{/* Risk Score Card — future hook */}
{/* <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-3">
      <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
        <Shield className="h-3.5 w-3.5" />
        Risk Score
      </div>
      <div className="mt-1 text-lg font-mono tabular-nums text-[var(--accent-premium)]">--</div>
   </div> */}
```

### What the backend needs to provide
- `GET /api/tokens/:address/risk?chain=` → `{ score: number, factors: string[] }`
- Score should be 0–100 (lower = safer)
- Factors are human-readable labels (e.g. `"Mint authority revoked"`, `"Liquidity locked"`)

### Frontend work remaining
1. Uncomment the container.
2. Add `useRiskScore(tokenAddress, chain)` hook.
3. Color-map the score:  
   - 0–30 = `accent-gain` (green)  
   - 31–70 = `accent-premium` (champagne)  
   - 71–100 = `accent-loss` (red)
4. Render `factors` as a `<ul>` with `Check` / `AlertTriangle` icons.

---

## 2. Rank Tiers (Leaderboard & TraderProfile)

**Location:** `client/src/components/ui/chain-chip.tsx` (via `rank` prop), `Leaderboard.tsx`, `TraderProfile.tsx`  
**Status:** Prop accepted, never populated  
**Integration effort:** ~1 hr

### Current state
`ChainChip` accepts an optional `rank?: 'bronze' | 'silver' | 'gold' | 'diamond'` prop. It is never passed because the API does not return ranks yet.

### What the backend needs to provide
- Add `rankTier` to user objects returned by:  
  - `GET /api/leaderboard/overall?chain=`  
  - `GET /api/leaderboard/current-period?chain=`  
  - `GET /api/traders/:username`

### Frontend work remaining
1. In `Leaderboard.tsx`, pass `rank={entry.rankTier}` to `<ChainChip />` on each row.
2. In `TraderProfile.tsx`, pass `rank={trader.rankTier}`.

---

## 3. Glossary / Contextual Help

**Location:** `client/src/components/ui/glossary-tooltip.tsx`  
**Status:** Primitive built, only 3 terms defined  
**Integration effort:** ~30 min per batch of terms

### Current state
A lightweight tooltip wrapper that replaces known jargon with hoverable definitions.

```tsx
const GLOSSARY: Record<string, string> = {
  PnL:      "Profit & Loss — net earnings from trades.",
  Slippage: "The difference between expected and executed price.",
  Spread:   "The gap between the highest bid and lowest ask.",
};
```

If a term is unknown the component renders children unchanged — safe to wrap any copy.

### Future work
- Expand `GLOSSARY` with product-specific terms (e.g. `Paper Trade`, `Leverage`, `OHLCV`).
- Add a `/glossary` route for a searchable index page.
- Consider i18n keys instead of inline strings.

---

## 4. Whale-Watch Deep Links

**Location:** `client/src/pages/WhaleWatch.tsx`  
**Status:** Table rows are clickable, but destination is generic (`/token/:address`)  
**Integration effort:** ~2 hrs

### Current state
Each whale transaction row links to `/token/:address?chain=`. There is no dedicated "whale detail" view.

### Future work
- Create `WhaleTransactionPage.tsx` showing:  
  - Full transaction graph (in/out flows)  
  - Related wallets (clustering)  
  - Historical PnL for the wallet  
- Requires backend endpoint: `GET /api/whales/:signature?chain=`

---

## 5. Achievement System (Re-enable)

**Location:** `client/src/components/AchievementBadge.tsx`, `client/src/pages/Dashboard.tsx`, `client/src/pages/TraderProfile.tsx`  
**Status:** UI preserved, no `/achievements` API consumed  
**Integration effort:** ~3 hrs

### Current state
`AchievementBadge` is imported and rendered in Dashboard (user's own badges) and TraderProfile (public badges). The data comes from `user.achievements` which is typed as `string[]` but the backend does not currently populate it.

### What the backend needs to provide
- `GET /api/achievements` → list of all possible badges with metadata  
- `GET /api/users/:id/achievements` → unlocked badges for a user  
- WebSocket event `achievement_unlocked` for real-time toasts

### Frontend work remaining
1. Wire `Dashboard.tsx` to fetch from `/api/achievements`.
2. Add toast on `achievement_unlocked` WS event.
3. Consider an `/achievements` gallery page.

---

## 6. Referral Program (Expand)

**Location:** `client/src/pages/Referrals.tsx`  
**Status:** Basic stats + invite link rendered. Leaderboard table stubbed.  
**Integration effort:** ~4 hrs

### Current state
- Invite link is generated from `user.referralCode`.
- Stats cards show `referralsCount` and `referralEarnings`.
- A "Top Referrers" table exists with mocked data (commented as `// TODO: fetch from /api/referrals/leaderboard`).

### What the backend needs to provide
- `GET /api/referrals/leaderboard?chain=` → top referrers by earnings

### Frontend work remaining
1. Replace mock rows with `useQuery` call.
2. Add pagination or "Load More".
3. Add social-share buttons (Twitter/X, Telegram) with pre-written copy.

---

## 7. Token Analyzer (AI Explanations)

**Location:** `client/src/pages/TokenAnalyzer.tsx`  
**Status:** Basic holder concentration + freshness analysis. No LLM integration.  
**Integration effort:** ~1 day

### Current state
The page fetches on-chain stats and applies heuristics (e.g. "High concentration" if top 10 holders > 60%). It does NOT call any AI service.

### Future work
- Add `POST /api/ai/analyze-token` with prompt engineering:
  - Token metadata
  - Holder distribution
  - Recent trade volume pattern
  - Social sentiment (if available)
- Stream the response into a collapsible insight card.
- Cache results per token for 1 hour.

---

## 8. Chain Switcher — URL Persistence

**Location:** `client/src/lib/chain-context.tsx`  
**Status:** Chain is stored in React context + localStorage. NOT synced to URL.  
**Integration effort:** ~1 hr

### Current state
Switching chains updates global state but does not rewrite the URL. A refresh loses the context if localStorage is cleared.

### Future work
- Append `?chain=base` or `?chain=solana` to every route.
- On mount, read `?chain=` and override localStorage if present.
- This enables chain-specific deep linking (e.g. share a Base leaderboard URL).

---

## 9. Design System Showcase Expansion

**Location:** `client/src/pages/DesignSystem.tsx`  
**Status:** All primitives + tokens documented.  
**Integration effort:** ~30 min per new primitive

### Future work
- Add motion/animation section (easing curves, stagger delays).
- Add responsive breakpoint demos.
- Add dark/light toggle if a light theme is ever built.

---

## 10. Performance Monitoring

**Location:** Global  
**Status:** None implemented  
**Integration effort:** ~2 hrs

### Future work
- Add Vercel Analytics or Plausible (privacy-first).
- Instrument key user journeys:
  - Time to Interactive on `/trade`
  - Search latency (DexScreener API)
  - Trade execution latency (mutation duration)
- Use `web-vitals` library for Core Web Vitals reporting.

---

## 11. Mobile Native App Shell

**Location:** `client/src/components/MobileNav.tsx`  
**Status:** Bottom tab bar implemented for mobile web.  
**Integration effort:** ~1 week (separate project)

### Future work
- Wrap the React app in Capacitor or Tauri for iOS/Android distribution.
- The existing mobile tab bar can be reused as the native shell.

---

## Quick Reference: Files with Stubbed Logic

| File | Lines | What is stubbed |
|------|-------|-----------------|
| `TradeModal.tsx` | ~320 | Risk score card (commented) |
| `Leaderboard.tsx` | ~180 | `rank` prop on `ChainChip` |
| `TraderProfile.tsx` | ~140 | `rank` prop on `ChainChip` |
| `WhaleWatch.tsx` | ~130 | Deep-link to transaction detail |
| `Referrals.tsx` | ~160 | Top referrers table (mocked) |
| `TokenAnalyzer.tsx` | ~200 | AI insight card |
| `chain-context.tsx` | ~30 | URL query param sync |

---

## 12. Alpha Desk Extensions

**Location:** `server/services/alphaDesk/`  
**Status:** Core pipeline shipped (v1). Deferred work documented below.  
**Integration effort:** ~1–2 days per item

### 12.1 Weekly Trenches Watch (Narrative Reports)
Repurposed from Trailblazer's narrative-report code. Weekly deep-dive reports that cluster protocols into narratives, generate build ideas, and produce action packs. Not migrated now because it requires the full `Report` → `Narrative` → `Idea` → `InvestigationStep` data model.

### 12.2 Real-Time Spike Detector
Trailblazer has a spike-detector workflow (`spike-detector.yml`) that runs every hour and flags tokens with abnormal volume/price movement. Deferred because Alpha Desk v1 focuses on daily curation, not real-time alerts.

### 12.3 Additional Chains
Current allowlist is `["base", "solana"]`. Extending to Sui, TON, Arbitrum, etc. requires:
- Chain-specific DexScreener/GeckoTerminal network IDs
- Native token price feeds
- Chain-aware address validation
- SocialData query keyword expansion

---

*Last updated: 2026-04-19*
