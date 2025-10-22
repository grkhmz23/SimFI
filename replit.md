# Solana Pump.Fun Paper Trading Application

## Overview

This is a full-stack web application for paper trading Solana memecoins from pump.fun. Users can practice trading with virtual SOL, track real-time token launches via WebSocket, and compete on leaderboards. The application provides a crypto-native trading interface inspired by pump.fun, Uniswap, Jupiter Exchange, and Raydium.

**Core Purpose**: Enable users to simulate trading of Solana memecoins without financial risk, using real-time market data from pump.fun's WebSocket API.

## Recent Changes (October 22, 2025)

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