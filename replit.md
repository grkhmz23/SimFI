# SimFi - Simulation Finance

## Overview

SimFi is a comprehensive Solana token trading and analysis platform designed to enable risk-free simulation of Solana memecoin trading. It comprises a full-stack web application for paper trading, a mobile-friendly Telegram bot for on-the-go interaction, and a CLI tool for on-chain token analysis. The platform utilizes real-time market data from various APIs to provide an authentic trading experience without financial risk.

## Recent Fixes (November 2025)

### Telegram Bot Authentication Fix
**Issue**: The Telegram bot was unable to communicate with the backend API due to authentication failures. The bot's session endpoints (`/api/telegram/session/*`) were rejecting requests with "403 Forbidden - Invalid bot secret".

**Root Cause**: Environment mismatch between bot token usage. The bot (`bot.js`) correctly switches between `TELEGRAM_BOT_TOKEN_DEV` (development) and `TELEGRAM_BOT_TOKEN` (production) based on `NODE_ENV`. However, the backend's `verifyBotSecret` middleware in `server/routes.ts` was hardcoded to only check against `TELEGRAM_BOT_TOKEN`, causing authentication to fail in development mode.

**Solution**: Updated `server/routes.ts` line 346-352 to mirror the bot's token selection logic:
```typescript
const expectedSecret = process.env.NODE_ENV === 'development' 
  ? process.env.TELEGRAM_BOT_TOKEN_DEV 
  : process.env.TELEGRAM_BOT_TOKEN;
```

**Verification**: 
- Tested POST `/api/telegram/session` endpoint with dev token - session successfully created
- Tested GET `/api/telegram/session/:id` endpoint - authentication successful
- Confirmed database schema includes `telegram_sessions` table with all required columns
- Verified all storage methods (`saveTelegramSession`, `getTelegramSession`, `deleteTelegramSession`) are implemented and functional

**Status**: Bot is now fully operational and can authenticate, save sessions, and interact with all backend endpoints.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The platform features a dark mode interface with high-contrast colors, utilizing SimFi's cyan-to-purple gradient branding. Monospace fonts are used for numerical values, and buy/sell actions are color-coded (green/red) to minimize visual distractions and facilitate rapid data scanning. TradingView Lightweight Charts provide professional candlestick charts with volume histograms.

### Technical Implementations
- **Frontend**: Built with React, TypeScript, Wouter for routing, TanStack React Query for server state, and React Context for authentication. UI components are developed using Radix UI primitives and shadcn/ui, styled with Tailwind CSS. Form handling is managed by React Hook Form with Zod validation.
- **Backend**: Implemented with Express.js and TypeScript, providing RESTful JSON APIs. It integrates with Birdeye, DexScreener, and GeckoTerminal APIs for market data. Drizzle ORM is used for PostgreSQL interactions, and authentication is JWT-based with HttpOnly cookies.
- **Data Precision**: A critical architectural decision involves storing all currency values as `BigInt` (Lamports) in the database and using `BigInt` arithmetic throughout the backend and frontend to prevent floating-point precision loss. This ensures accurate financial calculations for all transaction sizes.
- **Authentication**: JWT tokens are secured using HttpOnly cookies with SameSite protection to mitigate XSS vulnerabilities, ensuring tokens are inaccessible to client-side JavaScript.
- **Telegram Bot**: Developed using the Telegraf framework, featuring persistent sessions, JWT authentication, and real-time position tracking. It integrates with the backend API for trading and data. The bot runs as a child process spawned from `server/index.ts` and uses a shared secret (`x-bot-secret` header) for backend authentication. Sessions are stored in the `telegram_sessions` table with 30-day expiration.
- **Solana Token History Analyzer**: A CLI tool that parses on-chain transaction history, extracts price time-series, identifies early buyers, and supports CSV/JSON exports, integrating with the Helius API.

### Feature Specifications
- **Web Application**: Real-time TradingView charts, portfolio tracking with BigInt precision, trending token discovery, and 6-hour leaderboard.
- **Telegram Bot**: Buy/sell tokens, view/refresh positions, leaderboard access, and persistent user sessions.
- **Token History Analyzer**: On-chain data analysis, price time-series extraction, early buyer identification, and multiple export formats.

### System Design Choices
- **Leaderboard Service**: A background service manages 6-hour trading periods and determines winners.
- **Storage Abstraction**: Database operations are abstracted through an `IStorage` interface.
- **Price Enrichment**: The backend enriches user position data with current prices from DexScreener.
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

**Validation & Forms**:
-   **Zod**: Schema validation for API requests and form data.
-   **React Hook Form**: Manages form state.
-   **@hookform/resolvers**: Integrates Zod with React Hook Form.

**Build Tools**:
-   **Vite**: Frontend development server and production bundler.
-   **esbuild**: Backend TypeScript compilation.
-   **Drizzle Kit**: Database migration tool.

**Authentication Libraries**:
-   **bcryptjs**: For password hashing.
-   **jsonwebtoken**: For JWT generation and verification.
-   **cookie-parser**: Middleware for parsing HTTP cookies.