# SimFi

**Multi-chain paper trading platform for memecoin discovery and education.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite)](https://vitejs.dev/)
[![Express](https://img.shields.io/badge/Express-4-404040?logo=express)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?logo=postgresql)](https://neon.tech/)

SimFi is a risk-free paper trading environment for Solana and Base memecoins. Every user receives a virtual portfolio backed by live market data, enabling practice trading, competitive leaderboards, social discovery, and AI-curated market signals without exposing real capital.

---

## The Problem

Memecoin trading is high-risk, high-volatility, and expensive to learn. New traders lose real money on:

- Rug pulls and low-liquidity traps
- Emotional trading without strategy
- No safe sandbox to practice pattern recognition
- Isolation with no structured way to learn from top performers

## The Solution

SimFi provides an investor-grade paper trading environment with the following:

- **$50,000 virtual portfolios** per user: 5 ETH on Base and 10 SOL on Solana, backed by real market data from DexScreener, Jupiter, and Birdeye
- **Live leaderboards** with 6-hour competitive periods ranked by profit
- **Social features** including public trader profiles, following, and community picks
- **Alpha Desk** — AI-generated daily signals: meme token concepts for traders and onchain build ideas for developers
- **Achievement and streak system** with badges, daily trading streaks, and referral rewards
- **Token analysis tools** powered by Helius for Solana wallet and token research

---

## Key Features

| Feature | Description |
|---------|-------------|
| Paper Trading | Buy and sell real memecoins with virtual capital. Execution prices are server-authoritative and fetched live from DexScreener, Jupiter Swap V2, and Birdeye. |
| Multi-Chain | Full support for Base and Solana with independent chain-specific balances, wallets, positions, and leaderboards. Users can switch chains dynamically. |
| Alpha Desk | Daily AI-generated signals in two modes: meme launch concepts derived from social signals and dev build concepts for onchain products. |
| Leaderboards | 6-hour competitive periods ranked by realized profit. Separate leaderboards per chain. Historical winner tracking. |
| Achievements | Badge system including First Trade, Diamond Hands, Top 10, Green Day, Solana Veteran, Base Beginner, and more. |
| Social Trading | Follow top traders, view public profiles with trade history, and compete with friends. |
| Community Picks | User-submitted token picks with upvoting and voting leaderboard. |
| Watchlist | Per-user saved token lists with chain awareness. |
| Streaks and Referrals | Daily trading streaks with bonus rewards. Referral system with dedicated leaderboard. |
| Token Analysis | Helius-powered wallet portfolio analysis, transaction history, token metadata, and batch lookups. |
| Telegram Bot | Full trading bot supporting login, buy/sell, portfolio, history, leaderboard, and chain switching. |
| Real-Time Prices | Server-Sent Events (SSE) streaming native prices and subscribed token prices with auto-reconnect and polling fallback. |

---

## Tech Stack

### Frontend

- **React 18** with TypeScript
- **Vite** for builds and development server
- **Tailwind CSS** with shadcn/ui component primitives (Radix UI)
- **TanStack Query** for server state, caching, and background updates
- **wouter** for lightweight client-side routing
- **Lightweight Charts** for candlestick price charts
- **Recharts** for portfolio analytics and performance visualizations
- **Framer Motion** for UI animations

### Backend

- **Express.js** with TypeScript (ESM)
- **Drizzle ORM** with type-safe schema definitions
- **PostgreSQL** via Neon serverless with connection pooling
- **JWT authentication** with token versioning, HttpOnly cookies, and CSRF double-submit protection
- **bcryptjs** for password hashing
- **Zod** for input validation on all endpoints
- **express-rate-limit** with tiered limits (IP, auth, trade, search, bot, public API)
- Optional **Redis** backing for distributed rate limiting

### Blockchain and Market Data APIs

- **Helius** — Solana token metadata, transaction history, wallet balances, NFTs
- **DexScreener** — Real-time token prices, trending pairs, OHLCV data
- **Jupiter** — Solana swap quotes (Swap V2), Price V2, Token API
- **Birdeye** — Solana token metadata and OHLCV fallback
- **CoinGecko / GeckoTerminal** — Native price feeds and market data
- **Base RPC** — Direct Base chain queries

### AI Pipeline (Alpha Desk)

- **Moonshot Kimi K2** (primary LLM)
- **OpenAI / OpenRouter** (automatic failover)
- **SocialData.tools** — Twitter/X signal ingestion
- **GitHub API** — Developer activity signals
- **Reddit** — Narrative and culture signals from 18 subreddits

---

## Architecture

```
Client (React + Vite)
  |
  |  REST API + SSE (/api/*)
  v
Server (Express + TypeScript)
  |
  |  Drizzle ORM
  v
PostgreSQL (Neon)
```

### Server-Authoritative Trading

All market data is fetched server-side. Quote prices are pinned at request time with a 10-second TTL. Slippage and liquidity minimums ($1,000) are enforced before execution. Buy and sell operations use atomic database transactions with `SELECT ... FOR UPDATE` row-level locking to prevent race conditions and double-spending.

### Idempotency and Safety

- **Idempotency keys** on buy/sell endpoints with a 5-minute cache to prevent duplicate trade execution
- **BigInt-safe parsing** to prevent floating-point precision attacks on trade amounts
- **Trade amount bounds** enforced per chain (0.001 to 100 native units)
- **Address validation** for Solana (base58) and Base (0x hex) addresses

### Session Security

- JWT tokens stored in HttpOnly, Secure, SameSite=strict cookies
- CSRF protection via double-submit cookie pattern
- Token versioning for instant session invalidation on logout or password change
- Session listing and logout-all support

### Real-Time Price Streaming

The SSE price feed (`/api/sse/prices`) broadcasts native prices (SOL, ETH) every 3 seconds and subscribed token prices on demand. Clients can subscribe/unsubscribe to token streams via POST endpoints. Auto-reconnect with exponential backoff; falls back to polling after 3 failed connections.

---

## Alpha Desk Pipeline

Alpha Desk runs daily and produces two independent sets of signals:

1. **Meme Launch Ideas** — Viral token concepts rooted in current internet culture, politics, Twitter trends, Reddit humor, and breaking news. These are creative concepts, not investment picks.
2. **Dev Build Ideas** — Onchain product and protocol concepts for developers, derived from market gaps, GitHub activity, and emerging narratives.

### Pipeline Stages

```
Ingest
  ├── DexScreener (trending tokens, price, volume, liquidity)
  ├── Twitter/X via SocialData.tools (mentions, engagement)
  ├── Reddit (18 subreddits: news, politics, memes, tech, crypto)
  └── GitHub (commits, stars, contributors for core repos)
       |
       v
Score (z-score normalization)
  ├── Dev Score: commits, stars delta, new contributors
  ├── Social Score: mentions, unique authors, engagement
  └── Market Score: volume, liquidity
       |
       v
LLM Analysis (multi-provider: Moonshot > OpenAI > OpenRouter)
  ├── Meme prompt: generate 3-5 viral token concepts
  └── Dev prompt: generate 3-5 onchain build concepts
       |
       v
Persist (PostgreSQL)
  ├── alpha_desk_runs (run metadata, provider, status)
  ├── alpha_desk_ideas (ideas with thesis, confidence, risk flags)
  └── alpha_desk_idea_outcomes (price tracking at 1h, 6h, 24h, 7d)
```

### Execution Triggers

- **GitHub Actions cron** — Daily at 13:00 UTC via `POST /api/admin/alpha-desk/run` for Base and Solana chains
- **In-app worker** — Runs on server startup and checks every 2 hours for missing daily runs
- **Manual trigger** — Admin endpoint with bearer token authentication

### Cost Guard

`ALPHA_DESK_MAX_RUNS_PER_DAY` (default: 2) enforces a hard limit per chain per day to prevent runaway API costs.

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database (Neon recommended)

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL, JWT_SECRET, and API keys

# Push database schema
npm run db:push

# Start development server
npm run dev
```

The development server runs on `http://localhost:5000` and serves both the API and the React frontend.

### Build for Production

```bash
npm run build
npm start
```

The build process bundles the client with Vite and the server with esbuild into the `dist/` directory.

### Environment Variables

Key variables required for full functionality:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | JWT signing key (min 32 characters) |
| `SESSION_SECRET` | Session signing key |
| `MOONSHOT_API_KEY` | Primary LLM for Alpha Desk |
| `SOCIALDATA_API_KEY` | Twitter/X ingestion for Alpha Desk |
| `HELIUS_API_KEY` | Solana data enrichment |
| `ADMIN_TOKEN` | Manual Alpha Desk trigger authentication |

See `.env.example` for the complete list.

---

## Business Model

| Revenue Stream | Mechanism |
|----------------|-----------|
| Premium Subscriptions | Advanced analytics, whale alerts, early Alpha Desk access |
| API Access | B2B data feeds for trading bots and research platforms |
| Sponsored Picks | Curated token spotlights (clearly labeled) |
| Affiliate Revenue | Referral fees from DEX aggregators and wallets |

---

## Roadmap

Completed:

- Multi-chain paper trading (Base + Solana)
- Server-authoritative quote system with slippage and liquidity guards
- Leaderboards with 6-hour competitive periods
- Achievement, streak, and badge system
- Social following and public trader profiles
- Alpha Desk AI pipeline with outcome tracking
- Community picks and voting
- Watchlist
- Telegram trading bot
- Streak and referral system

Planned:

- Mobile application (React Native)
- Copy trading — auto-mirror top trader moves
- Whale alerts — onchain wallet monitoring
- Educational academy — guided trading courses
- Live tournaments — sponsored trading competitions

---

## License

Proprietary — All rights reserved.
