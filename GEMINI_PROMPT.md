# SimFI Professional Frontend Redesign — Gemini Prompt

## Project Overview
**SimFI** is a paper-trading platform for cryptocurrency (Solana + Base chain memecoins). Users trade with fake money (5 ETH + 10 SOL starting balance) using real-time DEX prices. The app is fully functional with a React + TypeScript frontend. We need a **complete professional UI redesign** that looks like a premium fintech/institutional trading platform — not a playful consumer app.

## Current Tech Stack (DO NOT CHANGE)
- **Framework:** React 18 + TypeScript
- **Build Tool:** Vite
- **Styling:** Tailwind CSS + shadcn/ui components
- **Routing:** Wouter
- **State/Query:** TanStack Query (React Query)
- **Animations:** Framer Motion
- **Charts:** Lightweight Charts (TradingView) + Recharts
- **Icons:** Lucide React ONLY

## Design Philosophy (CRITICAL)
We are moving from a "crypto degen" aesthetic to an **institutional-grade fintech aesthetic**.
- **Dark mode only.** No light mode toggle.
- **ZERO emojis** anywhere in the UI. This includes buttons, toasts, labels, badges, empty states, and loading text.
- **NO playful/childish icons** on auth pages (no Sparkles, Gift, Zap, Trophy, Flame on Login/Register). Use professional icons only (Mail, Lock, User, Wallet, ArrowRight, Eye, EyeOff, etc.).
- **Clean, minimal, high-contrast.** Think Binance Futures, dYdX, or Bloomberg Terminal meets Apple design.
- **Consistent spacing, border radius, and shadows.** No visual clutter.
- **Glassmorphism is allowed but must be subtle** — low opacity, no rainbow gradients on functional cards.
- **Gradient usage:** Reserve gradients for CTA buttons and brand headers only. Data cards should be solid with subtle borders.

---

## Complete Page Inventory

### 1. `/login` — Login Page
- Centered card on dark background.
- Fields: Email, Password.
- Professional icons inside inputs (Mail, Lock). Password visibility toggle (Eye/EyeOff).
- Submit button: "Sign In" — solid primary color, no sparkles icon.
- Footer link: "Don't have an account? Create one".
- Background: subtle radial gradient or mesh, no distracting animations.

### 2. `/register` — Registration Page
- Centered card.
- Fields: Username, Email, Password, Solana Wallet Address (optional), Base Wallet Address (optional), Preferred Chain (Solana/Base toggle/segmented control).
- Validation: at least one wallet required.
- Professional icons only.
- Submit: "Create Account".
- No celebratory animations or confetti language.

### 3. `/` — Trade (Home) Page
- **Hero search bar:** Large, centered, minimal search input for token addresses/symbols. Results dropdown with token icon, symbol, name, price, market cap.
- **Trending tokens grid:** 3-4 column responsive grid of token cards. Each card shows: icon, symbol, name, price, 24h change %, market cap, 24h volume. Green/red change indicator.
- **New pairs section:** Recently launched tokens, smaller cards.
- **Quick stats row:** Total platform volume, active traders, top gainer (optional — can be omitted if it clutters).
- Clean, spacious layout. No overwhelming animations.

### 4. `/token/:address` — Token Detail Page
- **Header:** Token icon, name, symbol, chain badge (Base/Solana), copy-address button, external explorer link.
- **Live price:** Large current price, 24h change % with up/down arrow icon (not emoji).
- **Stats grid:** Market Cap, 24h Volume, Liquidity, FDV.
- **Chart:** Full-width TradingView-style candlestick chart (lightweight-charts). Timeframe buttons: 5m, 15m, 1H, 4H, 1D.
- **Trade panel (right side on desktop, below on mobile):** Buy/Sell buttons. If authenticated, show quantity input and trade preview.
- **User position card (if owned):** Amount held, entry price, current P/L.

### 5. `/portfolio` — Portfolio Page
- **Balance header:** Total portfolio value in USD + native balance (ETH/SOL).
- **Positions table:** Token, Amount, Entry Price, Current Price, Value, P/L, P/L %, Action (Sell).
- **Allocation chart:** Donut/pie chart showing portfolio distribution by value.
- **Performance chart:** Line chart of portfolio value over time (if data exists).
- Empty state: "No open positions. Start trading to build your portfolio." + CTA button.

### 6. `/positions` — Quick Positions Page
- Similar to portfolio but more compact.
- Card-based layout with key metrics per position.
- Quick sell buttons.

### 7. `/history` — Trade History Page
- Filterable table of all trades.
- Columns: Token, Side (Buy/Sell badge), Amount, Price, Total, P/L, Date.
- Pagination or infinite scroll.

### 8. `/dashboard` — User Dashboard
- **Profile card:** Username, email, wallet addresses (with copy icons), joined date.
- **Stats cards row:** Total trades, win rate, best trade, total P/L.
- **Achievements section:** Grid of achievement badges (locked/unlocked states). Use simple geometric badge shapes, no cartoon graphics.
- **Edit profile form:** Inline or in a modal.

### 9. `/leaderboard` — Leaderboard Page
- Tabs: "Overall" / "Current Period".
- Table: Rank, Trader, Total P/L, Win Rate, Total Trades.
- Top 3 highlighted with distinct but subtle styling (gold/silver/bronze borders or backgrounds — NO medal emojis).
- Current user's rank highlighted if in list.

### 10. `/trending` — Trending Tokens Page
- Full-page grid of trending tokens.
- Filters: By chain (All, Solana, Base).
- Sort: Volume, Price Change, Market Cap, Newest.

### 11. `/study` — Token Analyzer Page
- Input for token address.
- Analysis results cards: Liquidity Score, Holder Concentration, Risk Level, Momentum.
- Use progress bars, color-coded badges (Low/Medium/High), and simple metric cards.

### 12. `/referrals` — Referrals Page
- Referral code display with copy button.
- Stats: Total referrals, referral earnings.
- Referral link generator.
- Leaderboard of top referrers (optional).

### 13. `/trader/:username` — Trader Profile Page
- Public profile view.
- Username, join date, public stats.
- Recent trades list (abbreviated).
- Follow button (if following feature exists).

### 14. `/whales` — Whale Watch Page
- Feed of large trades.
- Filter by chain, minimum value.
- Cards showing: Token, Amount, Value, Time Ago, Wallet (shortened).

### 15. `/about` — About Page
- Clean marketing-style page.
- Mission statement, features list, how-it-works steps.
- Contact/social links.

### 16. `not-found` — 404 Page
- Minimal. Large "404", "Page not found", link back to home.

---

## Global Components to Redesign

### Navigation (`Navigation`)
- Fixed top navbar, dark glass background (`bg-background/80 backdrop-blur`).
- Left: Logo + "SimFi" wordmark.
- Center: Nav links (Trade, Portfolio, Leaderboard, Trending, Study).
- Right: Chain selector toggle (Base/Solana), Connect Wallet / User menu (avatar + dropdown).
- Mobile: Hamburger menu with sheet drawer.

### Chain Selector (`ChainSelector`)
- Minimal segmented control or pill toggle.
- Base = blue accent, Solana = purple accent.
- No animations that delay interaction.

### Trade Modal (`TradeModal`)
- Modal/sheet for executing buy/sell.
- Token preview, amount input, estimated output, slippage info.
- Confirm button with loading state.
- Success state: green checkmark icon + "Trade executed" text. No party emojis.

### Token Chart (`TokenChart`)
- Integrate lightweight-charts.
- Dark theme matching app palette.
- Timeframe selector pills.
- Volume histogram below candles.
- Current price line.

### Positions Bar (`PositionsBar`)
- Horizontal scroll or compact cards showing open positions.
- Quick-glance P/L with color-coded text.

### Footer (`Footer`)
- Minimal, dark, single row.
- Links: About, Terms, Privacy, Twitter/X, Discord.
- Copyright text.

### Toast Notifications
- Use shadcn `sonner` or `toast`.
- Titles should be plain text: "Login Successful", "Trade Executed", "Error", "Insufficient Balance".
- NO emojis in descriptions.

### Welcome Popup (`WelcomePopup`)
- Show once to new visitors.
- Clean modal: "Welcome to SimFi" header, brief value prop, "Get Started" and "Explore" buttons.
- NO sparkles, zap, or trophy icons. Use ArrowRight or ChevronRight only.

---

## Strict Visual Rules

### Colors (Refined Palette)
Use HSL values in CSS variables. Keep these approximate hues but feel free to fine-tune saturation/lightness for professionalism:
- **Background:** `220 20% 4%` (near-black)
- **Foreground:** `0 0% 95%` (off-white)
- **Card:** `220 18% 8%`
- **Border:** `220 15% 15%`
- **Primary (Brand):** `172 81% 55%` (cyan/teal) — use for primary actions, active states, links.
- **Accent:** `265 80% 60%` (purple) — use sparingly for highlights, secondary CTAs.
- **Success:** `142 76% 45%` (green) — positive P/L, success states.
- **Destructive:** `0 84% 60%` (red) — negative P/L, errors, sells.
- **Muted Text:** `220 10% 55%`

### Typography
- **Font Family:** `Inter` or `Space Grotesk` for headings, `JetBrains Mono` for numbers/prices.
- **Headings:** font-weight 600-700, tight letter-spacing.
- **Prices/Numbers:** tabular nums, mono font.
- **Body:** 14-16px, line-height 1.5.

### Spacing & Radius
- **Cards:** `rounded-xl` (12px) or `rounded-2xl` (16px). No super-rounded bubbles.
- **Buttons:** `rounded-lg` (8px) or `rounded-xl` (12px).
- **Inputs:** `rounded-lg` with 1px subtle borders.
- **Padding:** generous internal padding (p-5 to p-6 on cards).
- **Grid gaps:** gap-4 to gap-6.

### Animations (Subtle Only)
- Page transitions: fade or slight slide (0.2-0.3s ease-out).
- Card hover: `translateY(-2px)` + subtle shadow increase. NO bounces, wobbles, or rubber-band effects.
- Loading states: skeletons or clean spinners.
- Number updates: optional subtle color flash on price change. NO marquee or ticker effects.

### Icons (Lucide Only)
**Allowed on auth pages:** `Mail`, `Lock`, `User`, `Wallet`, `ArrowRight`, `Eye`, `EyeOff`, `Loader2`, `Check`, `X`, `AlertCircle`, `Copy`, `ExternalLink`.
**Not allowed on auth pages:** `Sparkles`, `Zap`, `Trophy`, `Gift`, `Flame`, `Star`, `Rocket`, `PartyPopper`.
**Global trading icons:** `TrendingUp`, `TrendingDown`, `BarChart3`, `PieChart`, `Activity`, `DollarSign`, `Coins`, `ArrowUpRight`, `ArrowDownRight`, `History`, `Award`, `Users`, `Search`, `Filter`, `Settings`, `LogOut`, `Bell`, `Menu`, `ChevronDown`, `ChevronRight`.

---

## Responsive Breakpoints
- **Mobile (<640px):** Single column, full-width cards, bottom sheet for trade modal, hamburger nav.
- **Tablet (640-1024px):** 2-column grids, simplified sidebars.
- **Desktop (>1024px):** Full layouts, token page shows chart + trade panel side-by-side.

---

## Deliverables Expected from Gemini
For each page/component, provide:
1. **Complete React component code** (`.tsx`) using functional components and hooks.
2. **Tailwind classes** inline (no separate CSS files unless for global theme variables).
3. **Use existing hooks/contexts** where applicable (mocked if needed for standalone code).
4. **TypeScript interfaces** for all props and data shapes.
5. **Mobile-first responsive design.**

**Priority order:**
1. `Login.tsx` + `Register.tsx` (auth pages — most urgent)
2. `Navigation.tsx` + `Footer.tsx` + `ChainSelector.tsx`
3. `Trade.tsx` (home page)
4. `TokenPage.tsx` + `TokenChart.tsx`
5. `Portfolio.tsx` + `Positions.tsx` + `History.tsx`
6. `Dashboard.tsx` + `Leaderboard.tsx`
7. `TradeModal.tsx` + `WelcomePopup.tsx`
8. All remaining pages

---

## Anti-Patterns to Avoid
- ❌ Emojis anywhere in the UI.
- ❌ Rainbow gradients on cards or backgrounds.
- ❌ Playful/cartoon icons on serious pages.
- ❌ Excessive glow/blur that reduces readability.
- ❌ Center-aligned text inside data tables.
- ❌ Auto-playing animations or sound.
- ❌ Skeuomorphic buttons or 3D effects.
- ❌ Comic Sans or decorative display fonts.

---

## Context for Accurate Design
This is a **paper trading simulator** — users are practicing with fake money but the prices are real. The UI should feel trustworthy and precise, like a real exchange, while remaining approachable. It supports **two chains:** Solana and Base. The chain selector should be visually distinct but not obnoxious.
