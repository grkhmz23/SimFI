# SimFi - Simulation Finance

## Overview

SimFi is a full-stack web and Telegram bot application designed for paper trading Solana memecoins. It allows users to simulate trading with virtual SOL, discover trending tokens using real-time market data, and compete on leaderboards. The application aims to provide a crypto-native trading interface inspired by popular DeFi platforms, serving as a risk-free gateway to decentralized finance.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React with TypeScript, using Wouter for routing, TanStack React Query for server state, and React Context for authentication.
**UI Components**: Radix UI primitives with shadcn/ui, styled using Tailwind CSS with a custom dark mode theme.
**Design Philosophy**: Dark mode with high-contrast, SimFi's cyan-to-purple gradient branding, monospace fonts for numerical values, and color-coded buy/sell actions for a focused trading experience.
**Charts**: TradingView Lightweight Charts for professional candlestick (OHLC) charts with volume.

### Backend Architecture

**Framework**: Express.js with TypeScript, providing RESTful API endpoints.
**Data Sources**: Birdeye API, DexScreener API, GeckoTerminal API, and Jupiter API (for display-only quotes).
**Database ORM**: Drizzle ORM with PostgreSQL.
**Authentication**: JWT-based authentication using HttpOnly cookies.
**Key Services**: A Leaderboard Service manages trading periods and determines winners.
**Build System**: Vite for frontend, esbuild for backend.

### Data Storage

**Database**: PostgreSQL (Neon serverless).
**Schema Design**: All currency values are stored as **bigint** (Lamports) to ensure precise financial calculations, preventing floating-point errors. This involves storing values as strings in JSON transmission and using BigInt utilities in both backend and frontend.

### Authentication & Authorization

**Strategy**: JWT tokens stored in HttpOnly cookies to prevent XSS attacks. The backend sets the cookie, and middleware validates the JWT for authenticated requests.

### Telegram Bot

The application includes a Telegram bot built with the Telegraf framework, offering features like login, token trading, position viewing, and leaderboard access. It uses JWT authentication with database-backed session persistence.

## External Dependencies

**Third-Party APIs**:
- **Birdeye API**: For trending tokens.
- **DexScreener API**: For token metadata, prices, and boosted tokens.
- **GeckoTerminal API**: For OHLCV chart data.
- **Jupiter API**: For swap quotes (display-only price impact estimation).
- **Axiom.trade Trending API**: For fetching trending tokens.

**Database Provider**:
- **Neon Serverless PostgreSQL**: Cloud-hosted database.

**UI Libraries**:
- **Radix UI**: Accessible component primitives.
- **shadcn/ui**: Pre-styled components.
- **Tailwind CSS**: Utility-first CSS framework.

**Validation & Forms**:
- **Zod**: Schema validation.
- **React Hook Form**: Form state management.

**Build Tools**:
- **Vite**: Frontend bundling.
- **esbuild**: Backend compilation.
- **Drizzle Kit**: Database migration tool.

**Authentication**:
- **bcryptjs**: Password hashing.
- **jsonwebtoken**: JWT generation and verification.
- **cookie-parser**: HTTP cookie parsing middleware.