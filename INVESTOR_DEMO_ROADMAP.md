# SimFi Investor Demo Roadmap
## Base-First Pivot & Feature Expansion

**Goal:** Remove Solana-Bags rewards dependency, pivot narrative to Base chain, and ship high-retention features that impress investors.

**Execution Strategy:** One feature at a time. Merge & deploy each phase before starting the next.

---

## Phase 0: Disable Bags Rewards & Hide UI
**Status:** Foundation fix — do this first.

### What
- Stop the automated rewards engine (Bags SDK) from running
- Hide all "Rewards" pages, nav links, and copy about "real SOL prizes"
- Keep the **Leaderboard** fully visible (6h periods, profit rankings, past winners)
- Keep all rewards database tables for future Base migration

### Files to Change
| File | Change |
|------|--------|
| `server/routes.ts` | Comment out `registerRewardsRoutes(app)` and `rewardsEngine.start()` (~line 2702) |
| `client/src/App.tsx` | Remove `<Route path="/rewards">` |
| `client/src/components/Navigation.tsx` | Remove `{ path: '/rewards', label: 'Rewards', icon: Gift }` from nav items |
| `client/src/pages/Leaderboard.tsx` | Remove `RewardsInfoDialog` button; update subtitles to remove "real SOL" |
| `client/src/pages/Trade.tsx` | Update hero text + feature card ("Win Real SOL" → "Win Leaderboard Ranks") |
| `client/src/components/WelcomePopup.tsx` | Remove rewards copy; replace with generic gamification copy |
| `client/src/pages/About.tsx` | Gray out or remove "Creator Fee Distribution" card; update Leaderboard description |

### Acceptance Criteria
- [ ] No `/rewards` route accessible
- [ ] No "Rewards" link in nav (desktop + mobile)
- [ ] Server starts without initializing Bags SDK
- [ ] Leaderboard still shows rankings and past period winners correctly
- [ ] All existing tests (if any) still pass

### Effort
**~30-45 min**

---

## Phase 1: Base Trending / New Pairs Page
**Status:** Core investor narrative — shows Base chain focus.

### What
A dedicated `/trending` page showing memecoin discovery feeds for Base (and Solana). Sections:
1. **Trending** — Top volume/mcap tokens on active chain
2. **New Pairs** — Recently launched pairs (1h, 6h, 24h filters)
3. **Hot** — High volume-to-liquidity ratio (momentum indicator)

Each card shows: icon, name, symbol, price, 24h change, market cap, age, 1-click **Trade** button.

### API Requirements
DexScreener already used in `marketDataService.ts`. Add these endpoints:
- `GET /api/market/trending?chain=base|solana&limit=20` *(exists)*
- `GET /api/market/new-pairs?chain=base|solana&age=1h|6h|24h`
- `GET /api/market/hot?chain=base|solana&limit=20`

### Files to Create
- `server/services/marketData.ts` — extend with `getNewPairs()` and `getHotTokens()`
- `client/src/pages/Trending.tsx` — new page with tabbed layout
- `client/src/components/TrendingTokenCard.tsx` — reusable list item

### Files to Modify
- `server/services/marketRoutes.ts` — register new endpoints
- `client/src/App.tsx` — add `/trending` route
- `client/src/components/Navigation.tsx` — add "Trending" to nav
- `client/src/pages/Trade.tsx` — add CTA link to Trending page

### DB Changes
None.

### Design Notes
- Use existing `Card` + `Badge` components
- Chain filter tabs at top (Base / Solana)
- Time-filter chips for New Pairs (1h | 6h | 24h)
- "Trade" button navigates to `/token/:address`

### Acceptance Criteria
- [ ] `/trending` loads Base tokens by default
- [ ] New pairs are sorted by launch time (newest first)
- [ ] Hot list ranks by volume/liquidity ratio
- [ ] Clicking token navigates to token detail page
- [ ] Mobile responsive (horizontal scroll or stacked cards)

### Effort
**~3-4 hours**

---

## Phase 2: Achievement Badge System
**Status:** Low-effort retention hack.

### What
Unlockable badges that appear on Dashboard and (future) public profiles.

**Initial Badges:**
| Badge ID | Name | Unlock Condition |
|----------|------|------------------|
| `first_trade` | First Trade | Complete 1 trade |
| `base_beginner` | Base Beginner | 5 trades on Base |
| `solana_veteran` | Solana Veteran | 5 trades on Solana |
| `green_day` | Green Day | Close a day with positive total PnL |
| `top_10` | Top 10 | Reach top 10 on any leaderboard period |
| `diamond_hands` | Diamond Hands | Hold a position for >24h |
| `profit_1eth` | ETH Profit Club | Make >1 ETH realized profit on Base |
| `profit_10sol` | SOL Profit Club | Make >10 SOL realized profit on Solana |

### DB Changes
New migration file:
```sql
CREATE TABLE user_achievements (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id VARCHAR NOT NULL,
  unlocked_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, badge_id)
);
CREATE INDEX idx_user_achievements_user ON user_achievements(user_id);
```

Add to `shared/schema.ts`:
- `userAchievements` table
- `BadgeId` enum or const array

### Files to Create
- `server/services/achievementEngine.ts` — checks conditions after trades/leaderboard closes
- `client/src/components/AchievementBadge.tsx` — visual badge component
- `client/src/lib/achievements.ts` — badge metadata (name, description, icon, color)

### Files to Modify
- `server/storage.ts` — `getUserAchievements()`, `unlockAchievement()`
- `server/routes.ts` — `GET /api/achievements` endpoint
- `client/src/pages/Dashboard.tsx` — render unlocked badges grid
- `server/storage.ts` — trigger badge checks inside `executeBuyTrade` / `executeSellTrade` and leaderboard period close

### Design Notes
- Badge shape: circular icon with colored ring
- Locked badges: grayscale, 30% opacity
- Toast notification on unlock: "🎉 Achievement Unlocked: Diamond Hands!"

### Acceptance Criteria
- [ ] Badges appear on Dashboard
- [ ] First trade badge unlocks immediately after first sell
- [ ] Diamond hands badge unlocks if any open position age >24h
- [ ] Green day calculated at UTC midnight
- [ ] Locked badges visible but grayed out

### Effort
**~4-5 hours**

---

## Phase 3: Portfolio PnL Charts
**Status:** Makes the product feel like a real trading terminal.

### What
Add visual charts to Portfolio page:
1. **Balance Over Time** — line chart (7d, 30d, all-time)
2. **Win/Loss Ratio** — pie chart
3. **Best / Worst Trade** stat cards
4. **Daily PnL** bar chart (last 7 days)

### Data Strategy
Since we don't store historical balance snapshots, derive them from `trade_history`:
- Start with initial balance (5 ETH or 10 SOL)
- Replay closed trades chronologically to build balance curve
- Cache result in query for 5 minutes

### API Requirements
- `GET /api/portfolio/analytics?chain=base|solana`
  Returns:
  ```ts
  {
    balanceHistory: { date: string; balance: number }[];
    winCount: number;
    lossCount: number;
    bestTrade: Trade | null;
    worstTrade: Trade | null;
    dailyPnl: { date: string; pnl: number }[];
  }
  ```

### Files to Create
- `server/services/portfolioAnalytics.ts` — trade replay logic
- `client/src/components/PortfolioChart.tsx` — Recharts wrapper

### Files to Modify
- `server/routes.ts` — add analytics endpoint
- `client/src/pages/Portfolio.tsx` — insert charts above/below table

### DB Changes
None (derive from existing `trade_history`).

### Design Notes
- Use existing chart colors (green success, red destructive)
- Timeframe toggle: 7D | 30D | ALL
- Best/Worst cards show token symbol + % gain/loss

### Acceptance Criteria
- [ ] Line chart renders balance trajectory accurately
- [ ] Win/Loss pie chart updates with trade history
- [ ] Best trade shows token, date, and profit %
- [ ] 7-day daily PnL bars visible
- [ ] Works for both Base and Solana chains

### Effort
**~5-6 hours**

---

## Phase 4: Referral System
**Status:** Growth loop investors love.

### What
- Each user gets a referral code (`?ref=USERNAME`)
- Referred user gets **+1 ETH** bonus paper balance on Base
- Referrer gets **+0.5 ETH** when referee completes first trade
- Public leaderboard of top referrers
- Promise future on-chain Base rewards for early referrals (marketing copy only)

### DB Changes
```sql
CREATE TABLE referrals (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id VARCHAR NOT NULL REFERENCES users(id),
  referee_id VARCHAR NOT NULL REFERENCES users(id) UNIQUE,
  code VARCHAR NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'pending', -- pending, converted
  reward_claimed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);
```

### Files to Create
- `client/src/pages/Referrals.tsx` — user's referral dashboard
- `client/src/components/ReferralLeaderboard.tsx` — top referrers list

### Files to Modify
- `shared/schema.ts` — add `referrals` table + types
- `server/routes.ts`:
  - Accept `?referralCode` in register payload
  - `POST /api/referrals/claim` — claim referrer reward when referee trades
  - `GET /api/referrals/me` — my stats
  - `GET /api/referrals/leaderboard` — top 20 referrers
- `server/storage.ts` — referral CRUD
- `client/src/pages/Register.tsx` — accept `?ref=` from URL, pass to API
- `client/src/App.tsx` — add `/referrals` route
- `client/src/components/Navigation.tsx` — add "Referrals" to user dropdown

### Design Notes
- Referral dashboard shows: link copy box, total referred, converted, pending rewards
- On registration, auto-detect `?ref=` query param and show "You were referred by @username"

### Acceptance Criteria
- [ ] Registration with `?ref=username` creates referral row
- [ ] Referee gets +1 ETH Base balance on signup
- [ ] Referrer gets +0.5 ETH when referee completes first trade
- [ ] Referral leaderboard shows top 20
- [ ] Referral link can be copied from dashboard

### Effort
**~5-6 hours**

---

## Phase 5: Public Trader Profiles
**Status:** Social proof + community building.

### What
Public profile pages at `/trader/:username` showing:
- Username, join date, achievement badges
- All-time PnL (Base + Solana)
- Win rate (% profitable trades)
- Average hold time
- Recent trades list (last 10)
- **Follow** button (logged-in users only)

### DB Changes
```sql
CREATE TABLE follows (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);
CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);
```

### API Requirements
- `GET /api/traders/:username` — public profile stats
- `POST /api/traders/:username/follow` — toggle follow
- `GET /api/traders/:username/trades` — recent public trades

### Files to Create
- `client/src/pages/TraderProfile.tsx`

### Files to Modify
- `shared/schema.ts` — add `follows` table
- `server/storage.ts` — follow/unfollow, get follower count, check isFollowing
- `server/routes.ts` — public trader endpoints
- `client/src/App.tsx` — add `/trader/:username` route
- `Leaderboard.tsx` — usernames become clickable links to `/trader/:username`
- `Portfolio.tsx` — add "View Public Profile" button

### Design Notes
- Profile header with gradient banner
- Stats grid: PnL | Win Rate | Avg Hold | Followers
- Trade list anonymizes exact amounts if viewed by stranger (optional)

### Acceptance Criteria
- [ ] Clicking username on leaderboard opens trader profile
- [ ] Follow button works and updates count
- [ ] Recent trades visible to everyone
- [ ] Badges displayed in profile header

### Effort
**~4-5 hours**

---

## Phase 6: Twitter/X Share Cards
**Status:** Free organic growth.

### What
Let users generate shareable PnL cards:
- From Portfolio: "Share my best trade"
- From Leaderboard: "Share my rank"
- Opens pre-composed tweet with OG image URL

### Implementation Options
**Option A (MVP):** Use HTML5 Canvas to generate image client-side, upload to a free image hosting service or data URL.
**Option B (Better):** Server-side OG image generation using `@vercel/og` or simple SVG template.

For speed, use **Option A** with canvas + `html-to-image` or pure canvas drawing.

### Files to Create
- `client/src/components/SharePnLCard.tsx` — canvas generator + download

### Files to Modify
- `client/src/pages/Portfolio.tsx` — add "Share" button on best trade card
- `client/src/pages/Leaderboard.tsx` — add "Share Rank" for top 10 users

### Design Notes
- Card template: SimFi branded dark background, large PnL %, token symbol, chain badge
- Tweet copy: "I just made +43% on $TOKEN with SimFi paper trading 🔥 Try it free: https://simfi.fun"

### Acceptance Criteria
- [ ] Canvas generates image correctly
- [ ] Image downloads or copies to clipboard
- [ ] Twitter intent URL opens with pre-filled text
- [ ] Works on mobile

### Effort
**~3-4 hours**

---

## Phase 7: Whale Watch / Smart Money Feed
**Status:** Intelligence layer — positions SimFi as educational + data platform.

### What
A `/whales` page showing real Base whale wallet activity:
- Pre-configured list of known Base smart money wallets
- Recent token swaps (buy/sell) in last 1-24h
- **"Simulate This Trade"** button → opens token detail with pre-filled amount

### Data Source
Use Birdeye API (already referenced) or Helius for Base. Alternatively, use DexScreener token profiles + BaseScan API.

### API Requirements
- `GET /api/whales/activity?chain=base` — aggregated swap events

### Files to Create
- `client/src/pages/WhaleWatch.tsx`
- `server/services/whaleFeed.ts` — fetch and cache whale transactions

### Files to Modify
- `server/routes.ts` — add whale endpoints
- `client/src/App.tsx` — add `/whales` route
- `Navigation.tsx` — add "Whales" to nav (maybe under "Study" or standalone)

### Design Notes
- Feed style: Twitter-like cards with wallet alias (e.g., "Smart Money #1")
- Action badge: "Bought $TOKEN" (green) / "Sold $TOKEN" (red)
- Time ago (e.g., "12 min ago")

### Acceptance Criteria
- [ ] Whale feed loads recent Base transactions
- [ ] Each entry has clickable "Simulate Trade" button
- [ ] Falls back gracefully if API rate-limited

### Effort
**~4-6 hours** (depends on Base data source reliability)

---

## Phase 8: Daily Streaks & Login Bonus
**Status:** DAU/MAU booster.

### What
- Track consecutive days with login + at least 1 trade
- Show streak flame on Dashboard
- Login bonus: +0.05 ETH day 1, +0.1 ETH day 3, +0.25 ETH day 7
- Reset to 0 if missed a day

### DB Changes
Add to `users` table:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_streak_date DATE;
```

### Files to Modify
- `shared/schema.ts` — add streak fields to users schema
- `server/routes.ts` — `GET /api/streak` and `POST /api/streak/claim`
- `server/storage.ts` — streak calculation logic
- `client/src/pages/Dashboard.tsx` — streak card with claim button

### Design Notes
- Flame emoji + streak number in Dashboard header
- Claim button pulses if unclaimed bonus available
- Simple 7-day calendar grid showing which days were hit

### Acceptance Criteria
- [ ] Streak increments on login + trade day
- [ ] Streak resets if no trade for >24h
- [ ] Claiming bonus adds ETH to Base balance
- [ ] UI shows next milestone reward

### Effort
**~3-4 hours**

---

## Execution Checklist (Master)

- [x] **Phase 0** — Disable Bags Rewards & Hide UI
- [x] **Phase 1** — Base Trending / New Pairs Page
- [ ] **Phase 2** — Achievement Badge System
- [ ] **Phase 3** — Portfolio PnL Charts
- [ ] **Phase 4** — Referral System
- [ ] **Phase 5** — Public Trader Profiles
- [ ] **Phase 6** — Twitter/X Share Cards
- [ ] **Phase 7** — Whale Watch / Smart Money
- [ ] **Phase 8** — Daily Streaks & Login Bonus

---

## Investor Narrative After These Changes

> "SimFi is the **Base-native paper trading platform** for memecoin discovery and education. Users practice risk-free trading on real Base pairs, compete for leaderboard ranks, earn achievement badges, follow top traders, and share their wins on X. With built-in viral loops like referrals and streak bonuses, SimFi is designed to become the default onboarding ramp for the next generation of Base traders."

---

**Next Action:** Confirm Phase 0 start and I'll begin implementation immediately.
