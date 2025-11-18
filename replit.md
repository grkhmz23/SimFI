# SimFi - Simulation Finance

## Overview
SimFi is a comprehensive Solana token trading and analysis platform designed for risk-free simulation of memecoin trading. It includes a full-stack web application for paper trading, a mobile-friendly Telegram bot for on-the-go interaction, and a CLI tool for on-chain token analysis. The platform leverages real-time market data from various APIs to provide an authentic trading experience without financial risk, aiming to explore the market potential of simulated trading environments.

## Recent Changes (November 2025)

### Critical Price Consistency Fix
**Issue**: Trade modals showed different prices for the same token depending on entry point (token page vs positions dropdown vs landing page).

**Root Cause**: TradeModal was using a complex fallback chain that prioritized stale data:
- Position data from `/api/trades/positions` had outdated `currentPrice`
- Token page was passing stale token state to modal
- Different entry points resulted in 15-30% price discrepancies

**Solution** (TradeModal.tsx lines 62-77):
```typescript
// ALWAYS fetch fresh token data on mount
const { data: freshToken } = useQuery<Token>({
  queryKey: [`/api/tokens/${tokenAddress}`],
  enabled: !!tokenAddress,
  staleTime: 0,              // Never use cache
  refetchInterval: 2500,     // Auto-refresh
  refetchOnMount: 'always',  // Force refetch on open
});

// Prioritize fresh data over all else
const activeToken = freshToken || token;
const currentPrice = activeToken?.price || 0;
```

**Impact**: Every trade modal now fetches and displays the absolute latest DexScreener price, ensuring 100% consistency across all pages and entry points.

### Holdings Display Fixes
**Issues**: Token amounts showing "0.00" in positions dropdown and incorrect decimal precision.

**Solutions**:
- PositionsBar.tsx: Changed from `toBigInt().toLocaleString()` to `formatTokenAmount(position.amount, 6, position.decimals || 6)`
- Positions.tsx: Removed double string conversion
- All pages now use proper lamport-to-token conversion with correct decimals

### BigInt Precision & Sell Calculations
**Issue**: Sell P/L calculations converting to Number, risking overflow for positions >9,000 SOL.

**Solution**: Keep all BigInt values as BigInt until final display via formatSol/formatTokenAmount helpers.

### UI Cleanup
**Change**: Removed PositionsBar from main landing page (Trade.tsx). Positions now only visible in dropdown menu for cleaner UI.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The platform features a dark mode interface with high-contrast colors, utilizing SimFi's cyan-to-purple gradient branding. Monospace fonts are used for numerical values, and buy/sell actions are color-coded (green/red) to minimize visual distractions and facilitate rapid data scanning. TradingView Lightweight Charts provide professional candlestick charts with volume histograms.

### Technical Implementations
- **Frontend**: Built with React, TypeScript, Wouter for routing, TanStack React Query for server state, and React Context for authentication. UI components are developed using Radix UI primitives and shadcn/ui, styled with Tailwind CSS. Form handling is managed by React Hook Form with Zod validation.
- **Backend**: Implemented with Express.js and TypeScript, providing RESTful JSON APIs. It integrates with Birdeye, DexScreener, and GeckoTerminal APIs for market data. Drizzle ORM is used for PostgreSQL interactions, and authentication is JWT-based with HttpOnly cookies.
- **Data Precision**: All currency values are stored as `BigInt` (Lamports) in the database and used with `BigInt` arithmetic throughout the backend and frontend to prevent floating-point precision loss, ensuring accurate financial calculations.
- **Authentication**: JWT tokens are secured using HttpOnly cookies with SameSite protection to mitigate XSS vulnerabilities.
- **Telegram Bot**: Developed using the Telegraf framework, featuring persistent sessions, JWT authentication, and real-time position tracking. It integrates with the backend API for trading and data. The bot runs as a child process and uses a shared secret for backend authentication. Sessions are stored in the `telegram_sessions` table with 30-day expiration.
- **Solana Token History Analyzer**: A CLI tool that parses on-chain transaction history, extracts price time-series, identifies early buyers, and supports CSV/JSON exports, integrating with the Helius API.

### Feature Specifications
- **Web Application**: Real-time TradingView charts, portfolio tracking with BigInt precision, trending token discovery, and a 6-hour leaderboard.
- **Telegram Bot**: Buy/sell tokens, view/refresh positions, leaderboard access, and persistent user sessions with auto-detection of Solana token addresses.
- **Token History Analyzer**: On-chain data analysis, price time-series extraction, early buyer identification, and multiple export formats.

### System Design Choices
- **Leaderboard Service**: A background service manages 6-hour trading periods and determines winners.
- **Storage Abstraction**: Database operations are abstracted through an `IStorage` interface.
- **Price Enrichment**: The backend enriches user position data with current prices from DexScreener.
- **Transactions**: Buy/sell operations are wrapped in database transactions to ensure data integrity.
- **Build System**: Vite is used for frontend bundling, and esbuild for backend compilation.

## External Dependencies

**Third-Party APIs**:
-   **Birdeye API**: For trending tokens, liquidity, and volume data.
-   **DexScreener API**: Provides token metadata, prices, and boosted tokens.
-   **GeckoTerminal API**: Used for OHLCV chart data.
-   **Jupiter API**: Provides swap quotes for display-only price impact estimations.
-   **Helius API**: Utilized by the Solana Token History Analyzer for on-chain data.

**Database Provider**:
-   **Neon Serverless PostgreSQL**: Cloud-hosted database for data persistence.

**UI Libraries**:
-   **Radix UI**: Provides unstyled, accessible component primitives.
-   **shadcn/ui**: Pre-styled components built on Radix UI.
-   **Tailwind CSS**: Utility-first CSS framework for styling.