# SimFi Trading Calculations Documentation

## Overview

SimFi uses **BigInt arithmetic** throughout the entire trading system to ensure precision for all financial calculations. This document explains how token amounts and SOL values are calculated.

## Core Principles

1. **All SOL amounts stored as Lamports** (1 SOL = 1,000,000,000 Lamports)
2. **All token amounts stored as "Token-Lamports"** (tokens × 10⁹ for precision)
3. **Prices always in Lamports per Token** (from API)
4. **BigInt used for all arithmetic** (no floating-point math)

## Buy Token Calculation

### Formula
```typescript
solSpent = solAmount * 1_000_000_000  // Convert SOL to Lamports
tokenAmount = (solSpent * 1_000_000_000) / priceLamports  // Get token-lamports
```

### Example
User buys with 0.5 SOL at 355 lamports/token:

```
Input:
- solAmount = 0.5 SOL
- price = 355 lamports/token

Calculation:
- solSpent = 0.5 × 1,000,000,000 = 500,000,000 lamports
- tokenAmount = (500,000,000 × 1,000,000,000) / 355
- tokenAmount = 500,000,000,000,000,000 / 355
- tokenAmount = 1,408,450,704,225,352 token-lamports

Display to User:
- tokens = 1,408,450,704,225,352 / 1,000,000,000
- tokens = 1,408,450.704 tokens ✅
```

### Verification
```
1,408,450 tokens × 355 lamports/token = 499,999,750 lamports ≈ 0.5 SOL ✅
```

## Sell Token Calculation

### Formula
```typescript
solReceived = (tokenAmount * exitPriceLamports) / 1_000_000_000
profitLoss = solReceived - solSpent
```

### Example
User sells the same position at 400 lamports/token:

```
Input:
- tokenAmount = 1,408,450,704,225,352 token-lamports (from buy)
- exitPrice = 400 lamports/token
- solSpent = 500,000,000 lamports (original cost)

Calculation:
- solReceived = (1,408,450,704,225,352 × 400) / 1,000,000,000
- solReceived = 563,380,281,690,140,800 / 1,000,000,000
- solReceived = 563,380,281 lamports
- solReceived = 0.563 SOL ✅

Profit/Loss:
- profitLoss = 563,380,281 - 500,000,000
- profitLoss = 63,380,281 lamports
- profitLoss = 0.063 SOL (+12.7% profit) ✅
```

## Partial Sell Calculation

### Formula
```typescript
sellAmount = (position.amount × percentage) / 100
proportionalCost = (position.solSpent × sellAmount) / position.amount
solReceived = (sellAmount × exitPrice) / 1_000_000_000
profitLoss = solReceived - proportionalCost
```

### Example
User sells 50% of the position:

```
Input:
- position.amount = 1,408,450,704,225,352 token-lamports
- percentage = 50%
- position.solSpent = 500,000,000 lamports
- exitPrice = 400 lamports/token

Calculation:
- sellAmount = (1,408,450,704,225,352 × 50) / 100
- sellAmount = 704,225,352,112,676 token-lamports

- proportionalCost = (500,000,000 × 704,225,352,112,676) / 1,408,450,704,225,352
- proportionalCost = 250,000,000 lamports (exactly half)

- solReceived = (704,225,352,112,676 × 400) / 1,000,000,000
- solReceived = 281,690,140 lamports = 0.282 SOL

- profitLoss = 281,690,140 - 250,000,000
- profitLoss = 31,690,140 lamports = 0.032 SOL ✅
```

## Why Token-Lamports?

Storing token amounts as `tokens × 10⁹` provides:

1. **Precision**: No floating-point rounding errors
2. **Consistency**: Same pattern as SOL ↔ Lamports
3. **Large Numbers**: Supports positions > 2⁵³ tokens (JavaScript Number limit)
4. **Exact Math**: All calculations use integer arithmetic

## Data Flow

### Backend → Frontend
```typescript
// Backend serializes BigInt as string
res.json(serializeBigInts({
  tokensReceived: tokenAmount.toString()  // "1408450704225352"
}));

// Frontend parses string to BigInt
const tokens = toBigInt(response.tokensReceived);  // 1408450704225352n

// Display: divide by 1e9
const display = Number(tokens) / 1_000_000_000;  // 1,408,450.704
```

### Frontend → Backend
```typescript
// Frontend sends BigInt as string
const sellAmount = (position.amount × percentage) / 100;
apiRequest('POST', '/api/trades/sell', {
  amountLamports: sellAmount.toString()  // Send as string
});

// Backend parses to BigInt
const sellAmountBigInt = BigInt(req.body.amountLamports);
```

## Common Pitfalls (NOW FIXED)

### ❌ WRONG: Dividing string by number
```typescript
const display = response.tokensReceived / 1_000_000_000;  // NaN!
```

### ✅ CORRECT: Convert to Number first
```typescript
const display = Number(response.tokensReceived) / 1_000_000_000;  // ✅
```

### ❌ WRONG: Comparing BigInt string to Number
```typescript
if (solSpent > user.balance) // Comparing number to string! ❌
```

### ✅ CORRECT: Convert both to BigInt
```typescript
if (BigInt(solSpent) > toBigInt(user.balance)) // ✅
```

## Summary

✅ **Token calculations are mathematically correct**
✅ **BigInt precision prevents rounding errors**
✅ **All price conversions use consistent units (lamports)**
✅ **Partial sells use proportional cost calculation**
✅ **System handles large positions (> 1 trillion tokens)**

The trading system is **production-ready** for deployment after the bug fixes.
