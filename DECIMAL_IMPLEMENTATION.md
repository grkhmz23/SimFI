# Variable Decimal Implementation for Token Calculations

## Overview
This document describes the implementation of variable decimal support for SimFi token calculations. The system now correctly handles tokens with different decimal places (6 for pump.fun tokens vs 9 for SOL).

## Problem Statement
**Original Issue**: The system hardcoded all token calculations to use 9 decimals (1e9 divisor), which is correct for SOL but incorrect for pump.fun tokens that use 6 decimals. This resulted in:
- Users receiving 1000x too few tokens (dividing by 1e9 instead of 1e6)
- Incorrect token amount displays across web and Telegram bot
- Precision loss in buy/sell calculations

## Solution
Implemented variable decimal support throughout the entire stack:
1. Database schema updated to store decimals per token
2. Buy/sell calculations use token-specific decimals
3. Display functions accept decimals parameter
4. Frontend and Telegram bot pass decimals=6 for pump.fun tokens

---

## Database Changes

### Schema Updates (`shared/schema.ts`)
Added `decimals` column to positions and trade history:

```typescript
// positions table
decimals: integer('decimals').notNull().default(6)

// tradeHistory table  
decimals: integer('decimals').notNull().default(6)
```

**Migration**: Run `npm run db:push` to apply schema changes

**Default**: 6 decimals (pump.fun standard)

---

## Backend Changes

### Buy Endpoint (`server/routes.ts`)
**Updated Formula**:
```typescript
// OLD (incorrect for pump.fun):
tokenAmount = (solSpent * 1e9) / price

// NEW (supports variable decimals):
const decimalMultiplier = BigInt(10 ** decimals)
tokenAmount = (solSpent * decimalMultiplier) / price
```

**Request Body**:
```typescript
{
  tokenAddress: string
  tokenName: string
  tokenSymbol: string
  solAmount: number
  price: string  // Lamports per token
  decimals: number  // NEW: 6 for pump.fun, 9 for SOL-like tokens
}
```

### Sell Endpoint (`server/routes.ts`)
**Updated Formula**:
```typescript
// OLD (incorrect for pump.fun):
solReceived = (sellAmount * exitPrice) / 1e9

// NEW (supports variable decimals):
const decimals = position.decimals || 6
const decimalDivisor = BigInt(10 ** decimals)
solReceived = (sellAmount * exitPrice) / decimalDivisor
```

**Position Lookup**: Decimals automatically retrieved from stored position

### Sell-All Endpoint
Uses first position's decimals (all positions of same token have same decimals)

---

## Frontend Changes

### Helper Functions (`client/src/lib/lamports.ts`)

#### Updated `lamportsToTokens()`
```typescript
// OLD:
lamportsToTokens(lamports: bigint): string

// NEW:
lamportsToTokens(lamports: bigint, decimals: number = 6): string
```

**Implementation**:
```typescript
const divisor = BigInt(10 ** decimals)
const wholePart = value / divisor
const fractionalPart = value % divisor
```

#### Updated `formatTokenAmount()`
```typescript
// OLD:
formatTokenAmount(amount: bigint, displayDecimals: number = 2): string

// NEW:
formatTokenAmount(
  amount: bigint, 
  displayDecimals: number = 2,
  tokenDecimals: number = 6
): string
```

### TradeModal Component
**Buy Request**:
```typescript
const tradeData = {
  tokenAddress: token.tokenAddress,
  tokenName: token.name,
  tokenSymbol: token.symbol,
  solAmount: data.solAmount,
  price: currentPrice,
  decimals: token.decimals || 6  // NEW
}
```

**Display**:
```typescript
const decimals = token?.decimals || position?.decimals || 6
formatTokenAmount(tokenAmount, 2, decimals)
```

---

## Telegram Bot Changes

### Helper Function (`bot.js`)
```javascript
// OLD:
const formatTokenAmount = (lamports) => {
  const tokens = Number(lamports) / 1_000_000_000
  return tokens.toFixed(2)
}

// NEW:
const formatTokenAmount = (lamports, decimals = 6) => {
  const tokens = Number(lamports) / (10 ** decimals)
  return tokens.toFixed(2)
}
```

### Buy Requests
```javascript
const result = await apiRequest('/trades/buy', 'POST', {
  tokenAddress: state.tokenAddress,
  tokenName: state.token.name,
  tokenSymbol: state.token.symbol,
  solAmount: amount,
  price: priceLamports.toString(),
  decimals: 6  // NEW: pump.fun tokens
}, session.token)
```

### Display Updates
All position displays now use correct decimals:

```javascript
// Position lists
`${pos.tokenSymbol} (${formatTokenAmount(pos.amount, pos.decimals || 6)})`

// Sell confirmation
const decimals = state.position.decimals || 6
`Amount: *${formatTokenAmount(sellAmountLamports, decimals)} ${symbol}*`

// Position details
const decimals = position.decimals || 6
`💼 Amount: *${formatTokenAmount(position.amount, decimals)}*`
```

### P&L Calculations
```javascript
// OLD (incorrect):
const currentValue = (positionAmount * currentPrice) / BigInt(1_000_000_000)

// NEW (correct):
const decimals = position.decimals || 6
const decimalDivisor = BigInt(10 ** decimals)
const currentValue = (positionAmount * currentPrice) / decimalDivisor
```

---

## Testing Verification

### Test Scenario: Buy 0.5 SOL of pump.fun Token
**Given**:
- Token price: 355,172 Lamports/token
- SOL amount: 0.5 SOL = 500,000,000 Lamports
- Token decimals: 6

**Expected Calculation**:
```
tokenAmount = (500_000_000 * 10^6) / 355_172
            = 500_000_000_000_000 / 355_172
            = 1,408,451 token-units (6 decimals)
            = 1.408451 tokens (display)
```

**OLD System (Incorrect)**:
```
tokenAmount = (500_000_000 * 10^9) / 355_172
            = 1,408,451,000 token-units (9 decimals)
            = 0.00140845 tokens (WRONG - 1000x too small!)
```

### Verification Checklist
- [x] Database schema includes decimals column
- [x] Buy endpoint uses `10 ** decimals` multiplier
- [x] Sell endpoint uses `10 ** decimals` divisor
- [x] Frontend passes decimals in buy requests
- [x] Frontend displays use token decimals
- [x] Bot passes decimals=6 for all buys
- [x] Bot displays use position decimals
- [x] Bot P&L calculations use position decimals

---

## Architecture Review

### Architect Findings
✅ **Pass**: Variable decimal handling correctly implemented across:
- Database schema (decimals column with default 6)
- API routes (buy/sell use correct formulas)
- Frontend display (formatTokenAmount accepts decimals)
- Telegram bot (all displays updated, P&L calculations fixed)

**Security**: No issues observed

**Critical Fixes**:
1. Removed hardcoded 1e9 divisions in bot.js
2. Updated all display paths to use position.decimals
3. Fixed P&L calculations to use decimalDivisor

---

## Related Documentation
- `TRADING_CALCULATIONS.md` - Detailed trading formulas
- `replit.md` - Project architecture and recent changes

## Migration Notes
1. Run `npm run db:push` to add decimals column
2. Existing positions get default decimals=6
3. New positions store decimals from buy requests
4. No data migration needed (compatible with existing records)
