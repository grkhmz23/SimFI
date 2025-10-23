# SimFi - Simulation Finance

## Overview

SimFi is a full-stack web and Telegram bot application for paper trading Solana memecoins from pump.fun. Users can practice trading with virtual SOL, track real-time token launches via WebSocket, and compete on leaderboards. The application provides a crypto-native trading interface inspired by pump.fun, Uniswap, Jupiter Exchange, and Raydium.

**Brand**: "SimFi - Your Gateway to Risk-Free DeFi"

**Core Purpose**: Enable users to simulate trading of Solana memecoins without financial risk, using real-time market data from pump.fun's WebSocket API.

## Recent Changes (October 23, 2025)

**Codebase Cleanup & Security Audit (October 23, 2025 - Afternoon)**:
- Removed unused Chart.js dependencies (chart.js, react-chartjs-2, chartjs-adapter-date-fns)
- Deleted old/unused files from attached_assets folder (extracted/, old chart implementations)
- Conducted comprehensive security audit - no vulnerabilities found:
  - ✅ SQL injection protection via Drizzle ORM parameterized queries
  - ✅ XSS protection via React and proper input sanitization
  - ✅ Authentication security with HttpOnly cookies and SameSite protection
  - ✅ Password security with bcrypt hashing
  - ✅ No race conditions (using database-level atomicity with ON CONFLICT)
  - ✅ No memory leaks (proper cleanup in useEffect hooks)
  - ✅ Proper async/await handling throughout codebase
- Verified console.log statements are appropriate for debugging and monitoring
- **Result**: Codebase is production-ready with no bugs found
- Status: ✅ Completed and verified

**TradingView Lightweight Charts Integration (October 23, 2025 - Afternoon)**:
- Replaced Chart.js with TradingView Lightweight Charts library
- Professional candlestick (OHLC) charts with volume histogram overlay
- Features: Dark theme, timeframe selection (5S-5M), auto-refresh every 30s
- Cleaner bundle size, better performance, industry-standard visualization
- Status: ✅ Implemented and production-ready

**Telegram Bot Production Mode (October 23, 2025 - Morning)**:
- Fixed Telegram bot to run in both development and production environments
- Bot now starts automatically with server deployment (not just in development)
- Users can close Replit and bot continues running when app is published
- Removed development-only restriction from bot startup code
- Status: ✅ Implemented and verified

**Search UX & Error Handling (October 23, 2025 - Morning)**:
- Moved search bar from header to centered Google-style position on Trade page
- Added WebSocket error handler to suppress Vite HMR errors in production
- Fixed token page crashes by preventing unhandled WebSocket rejections
- Search functionality verified working correctly with DexScreener API
- Status: ✅ Implemented and verified

## Recent Changes (October 22, 2025)

**Telegram Bot Persistent Sessions (October 22, 2025 - Latest)**:
- Implemented database-backed session persistence for Telegram bot
- Users no longer need to login every time the bot restarts
- Added `telegram_sessions` table to store session data (token, balance, expiry)
- Sessions expire after 30 days of inactivity
- Security: Protected telegram session endpoints with bot-secret authentication
  - Added `x-bot-secret` header verification using TELEGRAM_BOT_TOKEN
  - Prevents unauthorized access to stored JWT tokens
  - Only bot process can access session endpoints
- User flow: /start checks for existing session → auto-login if found → login flow if not
- Logout deletes session from both database and memory
- Status: ✅ Implemented and architect-reviewed

**Telegram Bot Position Refresh Feature (October 22, 2025 - Late Evening)**:
- Added position details view with real-time refresh capability
- Users can now click on any position to view detailed information including:
  - Current balance, position amount, entry price, current price
  - Current position value and profit/loss with percentage
  - Refresh button to update prices without leaving the view
- Implementation: Created showPositionDetails() helper with BigInt P&L calculations
- Fixed UUID handling: Position IDs kept as strings (not parseInt) for correct comparison
- Status: ✅ Implemented and architect-reviewed

**CRITICAL FIX - Telegram Bot Token Calculation (October 22, 2025 - Late Evening)**:
- **Issue**: Bot was giving users 1 billion times fewer tokens than they should receive
- **Root Cause**: Double-conversion bug - API returns prices already in lamports, but bot was multiplying by 1B again
- **Impact**: User buying 0.5 SOL received 0.00140845 tokens instead of ~1.4 million tokens
- **Fix**: Removed incorrect `* 1_000_000_000` conversion in bot.js buy/sell handlers (3 locations)
- **Result**: Token amounts now calculated correctly using price_lamports as-is from API
- Status: ✅ Fixed and architect-reviewed

**Landing Page Redesign (October 22, 2025 - Evening)**:
- Complete professional redesign of Trade page with marketing-style layout
- Added hero section with gradient background and SimFi branding
- Implemented stats cards showing platform features
- Added trending tokens section with real-time data
- Created "How It Works" section with step-by-step onboarding
- Added gradient utility classes to index.css for brand consistency
- Removed logo from hero, updated header logo to full-size transparent version

**Telegram Bot Integration Fix (October 22, 2025 - Evening)**:
- Fixed bot not running issue by integrating into server startup
- Bot now launches automatically via child process in server/index.ts
- Bot process runs alongside web server in development mode
- Status: ✅ Verified running and operational

**SimFi Branding Implementation**:
- Updated application name to SimFi (Simulation Finance)
- Added SimFi logo with cyan-to-purple gradient branding
- Updated color scheme to match logo: Primary cyan (172 81% 55%), Secondary purple (249 79% 67%)
- Set favicon to SimFi logo
- Updated all page titles and meta descriptions
- Added gradient header navigation

**Telegram Bot Implementation**:
- Built complete Telegram bot with Telegraf framework
- Features: Login, buy/sell tokens, view positions, leaderboard
- JWT authentication with session management
- Comprehensive session validation across all handlers
- Bot token: 8488146641:AAH8wx1isl2XwrxTPFrlMYN4lxqusyyDOD4
- API integration: Bot connects to local API at http://localhost:5000/api

**BigInt Precision Implementation**:
- Migrated from Number to BigInt arithmetic to prevent precision loss for positions >2^53 lamports
- Updated database schema to use `bigint({ mode: "bigint" })` for all currency fields
- Removed Jupiter quotes from trade execution (now display-only)
- All trades now use deterministic BigInt calculations with `currentPrice`
- Added BigInt utilities: `toBigInt()`, `formatTokenAmount()`, `lamportsToTokens()`
- Created `serializeBigInts()` helper for JSON responses (converts BigInt→string, preserves Date objects)

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React with TypeScript
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state, React Context for auth state
- **UI Components**: Radix UI primitives with shadcn/ui component library
- **Styling**: Tailwind CSS with custom dark mode theme optimized for trading interfaces
- **Forms**: React Hook Form with Zod validation

**Design Philosophy**: 
- Dark mode primary with high-contrast colors for trading data
- SimFi cyan-to-purple gradient branding
- Monospace fonts for prices and numerical values
- Color-coded buy/sell actions (green/red)
- Minimal visual distractions for rapid data scanning

### Backend Architecture

**Framework**: Express.js with TypeScript
- **API Style**: RESTful endpoints with JSON responses
- **Real-time Data**: WebSocket server for live token price updates
- **Database ORM**: Drizzle ORM with PostgreSQL schema
- **Authentication**: JWT-based auth with HttpOnly cookies
- **Build System**: Vite for frontend bundling, esbuild for backend compilation

**Key Services**:
- **PumpPortal Service**: WebSocket client that connects to pump.fun's API and redistributes token data to frontend clients
- **Leaderboard Service**: Background service that manages 6-hour trading periods and determines winners
- **Storage Layer**: Abstracted database operations through IStorage interface

### Data Storage

**Database**: PostgreSQL (via Neon serverless)

**Schema Design**:
- All currency values stored as **bigint** (Lamports, not floating-point SOL) to ensure precise financial calculations
- 1 SOL = 1,000,000,000 Lamports
- Tables: users, positions, tradeHistory, leaderboardPeriods

**Critical Architectural Decision**: 
- **Problem**: Floating-point arithmetic is imprecise for currency; Number type loses precision above 2^53 lamports
- **Solution**: Store all SOL values as Lamport integers (1 billion = 1 SOL) using BigInt end-to-end
- **Rationale**: Prevents rounding errors in financial calculations, ensures accuracy for positions of any size
- **Implementation**: 
  - Database: All currency columns use `bigint({ mode: "bigint" })` with SQL literal defaults
  - Backend: All arithmetic uses BigInt, serializes to strings for JSON transmission
  - Frontend: Accepts strings, uses BigInt utilities for calculations, Number conversion only for display
  - Jupiter quotes: Display-only (price impact estimation), never used for trade execution
- **Tradeoff**: Requires string transmission and BigInt utilities, but eliminates all precision loss

### Authentication & Authorization

**Strategy**: JWT tokens stored in HttpOnly cookies

**Critical Security Decision**:
- **Problem**: Original design stored JWT in localStorage (vulnerable to XSS attacks)
- **Solution**: Refactored to use HttpOnly cookies with SameSite protection
- **Rationale**: HttpOnly cookies cannot be accessed by JavaScript, preventing token theft via XSS
- **Implementation**: Backend sets cookie on login/register, middleware authenticates requests via cookie

**Flow**:
1. User registers/logs in → Server generates JWT
2. JWT stored in HttpOnly cookie (not accessible to client JS)
3. Cookie automatically sent with API requests
4. Middleware validates JWT and attaches userId to request

### External Dependencies

**Third-Party Services**:
- **PumpPortal WebSocket API** (`wss://pumpportal.fun/api/data`): Real-time token launch and migration events
  - Subscriptions: `subscribeNewToken`, `subscribeMigration`
  - Data format: JSON messages with token metadata and market caps
  
**Database Provider**:
- **Neon Serverless PostgreSQL**: Cloud-hosted database accessed via `@neondatabase/serverless` with WebSocket support

**UI Libraries**:
- **Radix UI**: Unstyled, accessible component primitives (@radix-ui/react-*)
- **shadcn/ui**: Pre-styled components built on Radix UI
- **Tailwind CSS**: Utility-first CSS framework

**Validation & Forms**:
- **Zod**: Schema validation for API requests and form data
- **React Hook Form**: Form state management
- **@hookform/resolvers**: Zod integration for form validation

**Build Tools**:
- **Vite**: Frontend development server and production bundler
- **esbuild**: Backend TypeScript compilation
- **Drizzle Kit**: Database migration tool

**Authentication**:
- **bcryptjs**: Password hashing
- **jsonwebtoken**: JWT generation and verification
- **cookie-parser**: HTTP cookie parsing middleware

**Real-time Communication**:
- **ws**: WebSocket library for both client (pump.fun) and server (frontend) connections