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

### Auto-Detection of Solana Token Addresses
**Feature**: The Telegram bot now automatically detects when users send Solana token contract addresses in chat messages and immediately displays the buy menu for that token.

**Implementation**: Added `isSolanaAddress()` helper function that validates messages against the base58 encoding pattern (32-44 characters, alphanumeric excluding 0, O, I, l). When detected, the bot automatically fetches token information and shows the buy menu, eliminating the need to navigate through "Buy Token" → "Enter Address" steps.

**User Experience**: Users can now simply paste a token address (e.g., `METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL`) directly into the chat, and the bot will respond with token details and purchase options.

### Persistent Login System
**Feature**: The bot implements persistent login sessions with 30-day expiration. Users only need to login once per month.

**How It Works**:
- On `/start`, the bot checks for existing sessions in the `telegram_sessions` table
- If a valid session exists, it's automatically restored and the user is taken to the main menu
- Sessions are only deleted on explicit `/logout` or after 30-day expiration
- All session data (token, balance, user info) is persisted in the database

**Note**: This feature was already implemented but may not have been obvious to users. The database query confirms active sessions exist with proper expiration dates.

### Positions Display Fixes (November 2025)
**Issues Fixed**: Position details in the dropdown menu were showing incorrect values:
- Holdings showing 0.00 instead of actual token amounts
- Entry Price and Current Price missing SOL suffix
- Position data not auto-updating frequently enough

**Root Cause**: The aggregation formula in `server/storage.ts` was using a hardcoded constant (1 billion) instead of the token's actual decimals (`10^decimals`), and the frontend was only displaying 2 decimal places for token amounts.

**Solutions**:
1. **Fixed aggregation formula** (lines 113, 148 in `server/storage.ts`):
   - Changed from hardcoded `* 1000000000` to dynamic `* power(10::numeric, COALESCE(decimals, 6))`
   - Uses numeric division with FLOOR to preserve precision
   - Guards against NULL decimals by defaulting to 6

2. **Improved Holdings display** (line 232 in `client/src/pages/Positions.tsx`):
   - Increased display precision from 2 to up to 6 decimal places
   - Prevents small fractional token amounts from rounding to "0.00"

3. **Added SOL suffix** to Entry Price and Current Price for clarity

4. **Increased update frequency** from 5 seconds to 2.5 seconds with `staleTime` optimization to prevent API saturation

**Status**: All position values now display correctly with proper precision and auto-update every 2.5 seconds.

### Holdings Display and Price Consistency Fixes (November 2025)

**Issues Fixed**:
1. Holdings showing "0.00" instead of actual token amounts in positions dropdown
2. Different prices appearing in positions dropdown vs buy/sell trade modals
3. Price jumping/changing when Jupiter quotes loaded in TradeModal

**Root Causes**:
1. **Holdings Display Bug**: `PositionsBar.tsx` was calling `toLocaleString()` on BigInt values without decimal conversion, displaying raw lamports as integers
2. **Price Inconsistency**: TradeModal was overriding DexScreener prices with Jupiter's effective price when quotes loaded, causing displayed price to jump
3. **Double Conversion**: `Positions.tsx` was converting BigInt to string before passing to formatTokenAmount, breaking decimal conversion

**Solutions**:
1. **Fixed PositionsBar.tsx (line 232)**:
   - Changed from: `{toBigInt(position.amount).toLocaleString()}`
   - Changed to: `{formatTokenAmount(position.amount, 6, position.decimals || 6)}`
   - Now properly converts token lamports to human-readable amounts

2. **Fixed Positions.tsx (line 169)**:
   - Changed from: `{formatTokenAmount(amount.toString(), 6, position.decimals || 6)}`
   - Changed to: `{formatTokenAmount(amount, 6, position.decimals || 6)}`
   - Removed redundant string conversion

3. **Fixed TradeModal.tsx**:
   - Removed `effectivePriceLamports` and `displayPriceUsd` state variables that were being overridden
   - Removed useEffect hooks that updated price from Jupiter quotes (lines 171-182)
   - Now consistently uses `currentPrice` from DexScreener for all displays
   - Jupiter quotes only used for estimated tokens and price impact, not displayed price
   - Fixed sell calculation to use proper BigInt arithmetic: `(tokenLamports * priceLamportsPerToken) / 10^decimals`
   - Added defensive Math.floor() before BigInt conversion to prevent RangeError

**Price Unit Documentation**:
- `currentPrice` represents **lamports per 1.0 whole token** (not per token lamport)
- Backend converts DexScreener's `priceNative` (in SOL) to lamports: `Math.floor(priceNative * 1_000_000_000)`
- All price displays across the platform now use DexScreener as single source of truth
- Jupiter API only used for swap quote details (price impact, estimated amounts)

**Status**: Holdings display correctly with proper decimals, prices are consistent across all views, and sell calculations use correct BigInt arithmetic.

### Critical Security and Data Integrity Fixes (November 2025)

**Issues Discovered During Comprehensive Code Review:**

1. **Security Vulnerability - Password Logging** ❌ CRITICAL
   - **Issue**: Login endpoint was logging entire request body including plaintext passwords to server logs
   - **Impact**: Severe security risk - credentials persisted in logs
   - **Fix**: Removed password from logging, only log username/email (server/routes.ts line 219-220)
   - **Status**: FIXED

2. **Data Corruption Risk - No Transactions** ❌ CRITICAL
   - **Issue**: Buy/sell operations updated balance, positions, and trades through separate async calls without database transactions
   - **Impact**: Mid-sequence failures or concurrent requests could debit SOL without recording the position/trade
   - **Fix**: Added `executeBuyTrade` and `executeSellTrade` methods that wrap all mutations in `db.transaction()` (server/storage.ts lines 342-461)
   - **Status**: FIXED

3. **Position Aggregation Bug - Wrong Decimals**
   - **Issue**: Aggregation formula used incoming `EXCLUDED.decimals` instead of preserving existing `positions.decimals`
   - **Impact**: When aggregating positions with missing decimals field, weighted average entry price would be miscalculated
   - **Fix**: Updated formula to prioritize `positions.decimals` over `EXCLUDED.decimals` (server/storage.ts line 384)
   - **Status**: FIXED

4. **Telegram Bot - Concurrent Sell Operations** ❌ CRITICAL
   - **Issue**: No locking mechanism for sell operations; rapid button taps could execute multiple sells for same position
   - **Impact**: Could drain positions incorrectly and create duplicate trades
   - **Fix**: Added `pendingOperations` Map to track and prevent concurrent operations (bot.js lines 29, 346-348, 397-399)
   - **Status**: FIXED

5. **Memory Leak - Unbounded Map Growth**
   - **Issue**: `userSessions` and `userStates` Maps never evicted idle entries
   - **Impact**: Memory grows unbounded for inactive Telegram users
   - **Fix**: Added 30-minute cleanup interval for inactive user states (bot.js lines 32-43)
   - **Status**: FIXED

**Next Steps Required:**
- ~~Consider rotating JWT secret after password logging fix~~ (low priority - logs are development only)
- Monitor transaction performance under load
- Add retry logic for failed transactions
- Consider adding operation timeout protection

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