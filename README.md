# SimFi

Multi-chain paper trading platform for memecoin discovery and education. Practice risk-free trading on real token pairs from **Solana** and **Base**, compete on leaderboards, earn achievement badges, and follow top traders.

## Features

- **Paper Trading** — Trade real memecoins with virtual capital (5 ETH / 10 SOL starting balance)
- **Multi-Chain** — Full support for Base and Solana with chain-specific balances and leaderboards
- **Alpha Desk** — AI-curated daily token ideas backed by social momentum, dev activity, and on-chain signals
- **Leaderboards** — 6-hour competitive periods with live rankings
- **Achievements** — Unlock badges for trading milestones
- **Social** — Follow traders, referral system, streak tracking
- **Token Analysis** — Helius-powered wallet and token research tools

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query
- **Backend**: Express.js, TypeScript, Drizzle ORM
- **Database**: PostgreSQL (Neon)
- **Blockchain APIs**: Helius, DexScreener, Jupiter, CoinGecko, GeckoTerminal

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database URL and API keys

# Push database schema
npm run db:push

# Start development server
npm run dev
```

## Alpha Desk

Alpha Desk is SimFi's AI-curated daily token signal pipeline. It surfaces 3 high-conviction memecoin picks per day on Base and Solana.

### How it works

1. **Ingestion** — Fetches trending tokens from DexScreener, Twitter signals via SocialData.tools, and optional GitHub dev activity
2. **Scoring** — Computes weighted scores (50% dev / 35% social / 15% market by default) with novelty bonus and hype-only penalty
3. **LLM Analysis** — Moonshot Kimi K2 Thinking Turbo generates narrative thesis, why-now, and risk flags
4. **Persistence** — Stores picks in PostgreSQL with outcome tracking (1h/6h/24h/7d returns)

### Environment Variables

See `.env.example` for all Alpha Desk variables:

- `MOONSHOT_API_KEY` — Primary LLM provider
- `OPENAI_API_KEY` / `OPENROUTER_API_KEY` — Fallback LLM providers
- `SOCIALDATA_API_KEY` — Twitter/X signal ingestion
- `GITHUB_TOKEN` — Optional GitHub dev signals
- `ADMIN_TOKEN` — Secures the admin trigger endpoint
- `ALPHA_DESK_MAX_RUNS_PER_DAY` — Cost guard (default: 2)

### Manual Run

```bash
curl -X POST http://localhost:5000/api/admin/alpha-desk/run \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"chain":"base"}'
```

### Scheduled Runs

Alpha Desk runs daily at 13:00 UTC via GitHub Actions (`.github/workflows/alpha-desk-daily.yml`). The workflow POSTs to the admin endpoint for both Base and Solana.

On Render, a worker service (`simfi-alpha-desk`) can also run the pipeline and measure outcomes every 6 hours.

## Deployment

See `RENDER_DEPLOY.md` for Render deployment instructions.

## License

Proprietary — All rights reserved.
