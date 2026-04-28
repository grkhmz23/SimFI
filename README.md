# SimFi — Paper Trade. Real Skills. Zero Risk.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite)](https://vitejs.dev/)
[![Express](https://img.shields.io/badge/Express-4-404040?logo=express)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?logo=postgresql)](https://neon.tech/)

**SimFi** is a multi-chain paper trading platform for memecoin discovery and education. Practice risk-free trading on real token pairs from **Solana** and **Base**, compete on leaderboards, earn achievement badges, and follow top traders — all with zero real capital at stake.

> 🏆 Built for the onchain generation. Trade like it's real. Learn without the losses.

---

## 🎯 The Problem

Memecoin trading is high-risk, high-volatility, and expensive to learn. New traders lose real money on:
- **Rug pulls** and low-liquidity traps
- **Emotional trading** without strategy
- **No safe sandbox** to practice pattern recognition
- **Isolation** — no way to learn from top performers

## 💡 The Solution

SimFi gives every trader a **risk-free, investor-grade paper trading environment**:

- **$50,000 virtual portfolios** (5 ETH Base + 10 SOL Solana) backed by real market data
- **Live leaderboards** with 6-hour competitive periods
- **Social features** — follow top traders, copy their strategies, build your reputation
- **AI-curated Alpha Desk** — daily meme picks and dev build ideas powered by social signals
- **Achievement system** — unlock badges, streaks, and referral rewards

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| 📈 **Paper Trading** | Buy/sell real memecoins with virtual capital. Prices from DexScreener, Jupiter, Birdeye. |
| 🔗 **Multi-Chain** | Full support for **Base** (primary) and **Solana** with chain-specific balances & leaderboards. |
| 🤖 **Alpha Desk** | AI-generated daily picks: meme token ideas for day traders + onchain build ideas for developers. |
| 🏆 **Leaderboards** | 6-hour competitive periods. Rank by profit, win rate, and consistency. |
| 🎖️ **Achievements** | Unlock badges: `First Trade`, `Diamond Hands`, `Top 10`, `Green Day`, and more. |
| 👥 **Social Trading** | Follow top traders, view public profiles, compete with friends. |
| 🔥 **Streaks & Referrals** | Daily trading streaks with ETH bonuses. Referral system with leaderboard. |
| 🔬 **Token Analysis** | Helius-powered wallet and token research tools. |

---

## 🛠 Tech Stack

### Frontend
- **React 18** + **TypeScript**
- **Vite** (ultra-fast builds)
- **Tailwind CSS** + **shadcn/ui** components
- **TanStack Query** (server state)
- **Lightweight Charts** (candlestick charts)
- **Framer Motion** (animations)

### Backend
- **Express.js** + **TypeScript**
- **Drizzle ORM** (type-safe SQL)
- **PostgreSQL** (Neon serverless)
- **JWT** auth with token versioning
- **Rate limiting** (tiered: IP, auth, trade, search)

### Blockchain APIs
- **Helius** — Solana data
- **DexScreener** — real-time prices
- **Jupiter** — Solana swap quotes
- **Birdeye** — Base token data
- **CoinGecko** — native price feeds

### AI Pipeline (Alpha Desk)
- **Moonshot Kimi K2** (primary LLM)
- **OpenAI / OpenRouter** (fallbacks)
- **SocialData.tools** — Twitter/X signals
- **GitHub API** — dev activity
- **Reddit** — culture & narrative signals

---

## 🏗 Architecture Highlights

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   React + Vite  │────▶│   Express API    │────▶│  PostgreSQL     │
│   (Client)      │     │   (Server)       │     │  (Neon)         │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │
         ▼                       ▼
   TanStack Query         Circuit Breakers
   SSE Price Feed         Atomic Transactions
                          Row-Level Locking (FOR UPDATE)
```

### Security-First Design
- **Server-authoritative trading** — all prices fetched server-side; execution price pinned at quote time
- **Atomic transactions** — buy/sell operations use `FOR UPDATE` row locks to prevent race conditions
- **JWT token versioning** — instant session invalidation on logout or password change
- **CSRF double-submit cookies** — protection against cross-site request forgery
- **Input validation** — Zod schemas on all endpoints; BigInt guards against DoS
- **Rate limiting** — tiered limits per IP, user, and endpoint

### Alpha Desk Pipeline
```
Ingest (DexScreener + Twitter + Reddit + GitHub)
    ↓
Score (z-score normalization, novelty bonus, hype penalty)
    ↓
LLM Analysis (narrative thesis, risk flags, confidence score)
    ↓
Persist (PostgreSQL with outcome tracking at 1h/6h/24h/7d)
```

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your DATABASE_URL and API keys

# Push database schema
npm run db:push

# Start development server
npm run dev
```

The app runs on `http://localhost:5000`.

---

## 📊 Business Model

| Revenue Stream | Mechanism |
|----------------|-----------|
| **Premium Subscriptions** | Advanced analytics, whale alerts, early Alpha Desk access |
| **API Access** | B2B data feeds for trading bots and research platforms |
| **Sponsored Picks** | Curated token spotlights (clearly labeled) |
| **Affiliate Revenue** | Referral fees from DEX aggregators and wallets |

---

## 🗺 Roadmap

- [x] Multi-chain paper trading (Base + Solana)
- [x] Leaderboards & competitive periods
- [x] Achievement & badge system
- [x] Social following & public profiles
- [x] Alpha Desk AI pipeline
- [x] Streaks & referral system
- [ ] **Mobile app** (React Native)
- [ ] **Copy trading** — auto-mirror top trader moves
- [ ] **Whale alerts** — onchain wallet monitoring
- [ ] **Educational academy** — guided trading courses
- [ ] **Live tournaments** — sponsored trading competitions

---

## 👨‍💻 Team

Built with 💜 by the SimFi team.

---

## 📄 License

Proprietary — All rights reserved.
