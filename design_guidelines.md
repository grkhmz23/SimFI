# Design Guidelines: Solana Pump.Fun Paper Trading Application

## Design Approach

**Reference-Based Approach**: Drawing inspiration from pump.fun, Uniswap, Jupiter Exchange, and Raydium to create a familiar, crypto-native trading interface that prioritizes clarity, speed, and data density.

**Core Principle**: Build a high-performance trading interface where users can quickly scan data, execute trades, and monitor positions without visual distractions.

---

## Color Palette

**Dark Mode Primary** (crypto trading standard):
- Background: 15 8% 8% (deep charcoal)
- Surface: 15 6% 12% (elevated panels)
- Surface Elevated: 15 5% 16% (cards, modals)

**Primary Brand** (Solana-inspired):
- Primary: 270 80% 60% (vibrant purple)
- Primary Hover: 270 80% 55%

**Accent Colors**:
- Success/Buy: 142 76% 45% (bright green)
- Danger/Sell: 0 84% 60% (vibrant red)
- Warning: 38 92% 50% (amber for alerts)
- Info: 200 95% 50% (cyan for highlights)

**Text**:
- Primary: 0 0% 95% (high contrast white)
- Secondary: 0 0% 65% (muted gray)
- Tertiary: 0 0% 45% (subtle labels)

**Borders**:
- Default: 0 0% 20%
- Hover: 0 0% 30%

---

## Typography

**Font Families**:
- Primary: 'Inter', sans-serif (body, UI elements)
- Monospace: 'JetBrains Mono', monospace (prices, addresses, numbers)

**Hierarchy**:
- H1: 2.5rem/3rem, 700 weight (page titles)
- H2: 2rem/2.5rem, 600 weight (section headers)
- H3: 1.5rem/2rem, 600 weight (card titles)
- Body: 0.875rem/1.25rem, 400 weight (default text)
- Caption: 0.75rem/1rem, 400 weight (labels, metadata)
- Numbers: 0.875-1.25rem, 600 weight, monospace (all financial data)

---

## Layout System

**Spacing Units**: Tailwind spacing of 2, 4, 6, 8, 12, 16 (e.g., p-4, m-8, gap-6)

**Container Strategy**:
- Main Container: max-w-7xl mx-auto px-4
- Dashboard Grid: 3-column on desktop, 1-column mobile
- Sidebar: 280px fixed width on desktop, collapsible on mobile

**Breakpoints**:
- Mobile: base (< 768px)
- Tablet: md (768px+)
- Desktop: lg (1024px+)
- Wide: xl (1280px+)

---

## Component Library

### Navigation
**Top Navigation Bar**:
- Fixed header with backdrop blur
- Logo left, wallet connection right
- Navigation links centered (Dashboard, Trade, Portfolio, History)
- Height: 64px, dark background with subtle border-bottom

### Trading Interface
**Order Panel**:
- Card with two-tab switcher (Buy/Sell)
- Buy tab: green accent, Sell tab: red accent
- Input fields: Token amount, SOL amount
- Large action button at bottom matching tab color
- Real-time balance display with monospace font
- Slippage settings collapsed by default

**Price Chart Card**:
- Full-width card with integrated TradingView-style chart
- Timeframe selector (1H, 4H, 1D, 1W)
- Current price prominently displayed with percentage change
- Volume indicator below chart

**Token Info Card**:
- Token symbol and name with logo placeholder
- Market cap, 24h volume, holders count
- Mint address with copy button
- Social links (Twitter, Telegram) if available

### Dashboard Components
**Portfolio Overview**:
- Large stat cards showing: Total Balance, Today's P&L, Total Trades
- 3-column grid on desktop
- Each card: large number (monospace), label below, trend indicator

**Holdings Table**:
- Columns: Token, Amount, Entry Price, Current Price, P&L, Actions
- Sortable headers
- Color-coded P&L (green positive, red negative)
- Quick sell button per row

**Recent Trades List**:
- Compact card list showing last 10 trades
- Each item: Token symbol, Type (Buy/Sell badge), Amount, Price, Timestamp
- Color-coded badges for trade type
- "View All" link to full history page

### Forms & Inputs
**Text Inputs**:
- Dark background (surface color)
- Border: 1px solid border color
- Focus: purple ring, elevated border color
- Padding: py-3 px-4
- Monospace font for numerical inputs

**Buttons**:
- Primary: Purple gradient background, white text, medium shadow
- Success: Green solid, white text (Buy actions)
- Danger: Red solid, white text (Sell actions)
- Ghost: Transparent with border, text matches context
- Heights: py-3 for standard, py-4 for large CTAs

### Data Display
**Price Displays**:
- Always monospace font
- Large size (1.5-2rem) for current prices
- Include currency symbol (◎ for SOL)
- Percentage changes with up/down arrows and color coding

**Tables**:
- Zebra striping with subtle background alternation
- Hover states with elevated surface color
- Compact padding (py-3 px-4)
- Right-align numerical columns

### Status Indicators
**Badges**:
- Buy: Green background, darker green text
- Sell: Red background, darker red text  
- Pending: Amber background, darker amber text
- Small pill shape with px-2 py-1 padding

---

## Page Layouts

### Dashboard Page
- Three-column stat cards at top (full-width on mobile)
- Two-column split below: Holdings table (60%), Recent activity (40%)
- All cards with consistent spacing (gap-6)

### Trading Page
- Two-column split: Chart + Token Info (65%), Order Panel (35%)
- Sticky order panel on scroll
- Mobile: stack vertically with order panel fixed at bottom

### Portfolio Page
- Overview stats at top
- Full-width holdings table below
- Performance chart showing balance over time

### History Page
- Filter bar: Date range, trade type, token search
- Paginated table with all trade details
- Export functionality (CSV)

---

## Interactions & Animations

**Minimal Motion Philosophy**: Avoid distracting animations on a trading platform.

**Allowed Transitions**:
- Button hovers: background color transition (150ms)
- Card hovers: subtle elevation change (200ms)
- Modal open/close: fade + scale (200ms)
- Toast notifications: slide in from top-right (300ms)

**Real-Time Updates**:
- Price tickers: smooth number transitions without jarring jumps
- Balance updates: brief highlight flash (green for increase, red for decrease)

---

## Images

**No Hero Image**: This is a utility-focused trading application, not a marketing page. Users land directly on functional dashboards.

**Token Logos**: Circular 32px placeholders in tables, 64px in token detail cards

**Empty States**: Use simple SVG illustrations (not photographs) for:
- No holdings yet
- No trade history
- Wallet not connected

---

## Accessibility

- Maintain WCAG AA contrast ratios (verified for dark mode)
- All interactive elements keyboard accessible
- Focus indicators visible and clear (purple ring)
- Screen reader labels for icon-only buttons
- Form validation with clear error messaging