# Base Chain Integration Plan for SimFI

## Executive Summary

This document outlines the step-by-step plan to add Base chain (Coinbase's L2) support to SimFI alongside the existing Solana integration. Base is an EVM-compatible L2 chain using ETH as gas token.

---

## Part 1: Research Summary

### What is Base?
- **Base** is Coinbase's Ethereum Layer 2 blockchain
- **Chain ID**: 8453 (mainnet), 84532 (Sepolia testnet)
- **Gas Token**: ETH (not a native token like SOL)
- **RPC Endpoint**: `https://mainnet.base.org` (rate limited)
- **Block Explorer**: `https://base.blockscout.com/`
- **EVM Compatible**: Uses same address format as Ethereum (0x...)
- **Smallest Unit**: Wei (1 ETH = 10^18 wei) - different from lamports (10^9)

### Key Differences from Solana

| Aspect | Solana | Base (EVM) |
|--------|--------|------------|
| Address Format | Base58 (32-44 chars) | Hex (0x + 40 chars) |
| Decimals | 9 (lamports) | 18 (wei) |
| Price APIs | DexScreener (chainId: solana) | DexScreener (chainId: base) |
| Token Discovery | PumpPortal | Uniswap V3, Base native |
| Wallet Lib | @solana/web3.js | ethers.js or viem |

### Price Data Sources for Base
1. **DexScreener** supports Base: `api.dexscreener.com/latest/dex/tokens/{address}` with `chainId: base`
2. **CoinGecko** has Base chain support
3. **Alchemy/QuickNode** for RPC if needed

---

## Part 2: Current Architecture Analysis

### Solana Integration Points

1. **Database Schema** (`shared/schema.ts`):
   - `LAMPORTS_PER_SOL = 1_000_000_000` (9 decimals)
   - `walletAddress`: Solana format validation
   - `positions`/`tradeHistory`: Solana token addresses

2. **Market Data** (`server/services/marketData.ts`):
   - DexScreener API with `chainId === 'solana'` filter
   - `parseDecimalToLamports()` - 9 decimal places
   - `TokenData` interface with `priceLamports`

3. **Trade Routes** (`server/routes.ts`):
   - `isValidSolanaAddress()` - Base58 regex
   - `parseSolToLamports()` / `parseDecimalToLamports()` - 9 decimals
   - Buy/sell endpoints with Solana-specific logic

4. **Frontend** (`client/src/pages/Trade.tsx`):
   - Token search via `/api/tokens/search`
   - Wallet address input (Solana format)

5. **Rewards** (`server/services/bagsService.ts`):
   - Real Solana transactions for payouts

---

## Part 3: Implementation Plan

### Phase 1: Database Schema Updates
**Goal**: Add chain support to data models

**Files to Modify**:
- `shared/schema.ts`

**Changes**:
1. Add `chain` enum column to `positions` and `tradeHistory` tables
2. Add chain-aware wallet validation
3. Create constants for different chain decimals
4. Add utility functions for wei/ETH conversion (18 decimals)

**Migration Required**: YES - Add `chain` column, backfill existing data as 'solana'

---

### Phase 2: Market Data Service - Multi-Chain Support
**Goal**: Make market data service work with multiple chains

**Files to Modify**:
- `server/services/marketData.ts`

**Changes**:
1. Add `chain` parameter to all public methods
2. Update DexScreener filters to use dynamic chainId
3. Create `parseDecimalToWei()` for 18 decimal precision
4. Add `TokenData` price in wei for Base tokens
5. Update cache keys to include chain

---

### Phase 3: Trade Routes - Chain Abstraction
**Goal**: Update buy/sell endpoints to support both chains

**Files to Modify**:
- `server/routes.ts`

**Changes**:
1. Add `isValidEvmAddress()` validator (0x... format)
2. Add `isValidChainAddress(chain, address)` helper
3. Create `parseEthToWei()` function (18 decimals)
4. Update buy/sell endpoints to accept `chain` parameter
5. Update position aggregation to be chain-specific
6. Update idempotency keys to include chain

---

### Phase 4: Price/Decimal Utilities Refactoring
**Goal**: Centralize chain-specific math

**New File**:
- `server/lib/chain-utils.ts`

**Contents**:
- `CHAINS` enum/constants
- `CHAIN_DECIMALS` mapping
- `parseAmountToBaseUnits(chain, amount)` - unified conversion
- `formatBaseUnitsToDisplay(chain, baseUnits)`
- Address validators per chain

**Files to Update**:
- `server/routes.ts` - use new utilities
- `server/services/marketData.ts` - use new utilities
- `shared/schema.ts` - deprecate lamport-specific functions

---

### Phase 5: Frontend - Chain Selection UI
**Goal**: Allow users to select chain in the UI

**Files to Modify**:
- `client/src/pages/Trade.tsx` - Add chain selector
- `client/src/pages/Register.tsx` - Update wallet input help text
- `client/src/components/WalletExplorer.tsx` - Support both chains

**Changes**:
1. Add chain selector dropdown (Solana / Base)
2. Update token search to include chain parameter
3. Update wallet address validation per selected chain
4. Show chain badge on tokens/positions

---

### Phase 6: User Model - Multi-Chain Wallet Support
**Goal**: Allow users to have wallets on both chains

**Options**:
- **Option A**: Add `baseWalletAddress` column to users table
- **Option B**: Create separate `user_wallets` table (one-to-many)
- **Recommendation**: Option B for flexibility

**Files**:
- `shared/schema.ts` - new table or columns
- `server/routes.ts` - registration/update endpoints
- `client/src/pages/Register.tsx` - optional Base wallet input

---

### Phase 7: API Routes - Chain-Aware Endpoints
**Goal**: Update all relevant API endpoints

**Endpoints to Update**:
- `GET /api/tokens/:address` → `GET /api/tokens/:chain/:address`
- `GET /api/tokens/search` → Add `chain` query param
- `GET /api/tokens/trending` → Add `chain` query param
- `POST /api/trades/buy` → Add `chain` body param
- `POST /api/trades/sell` → Add `chain` body param
- `GET /api/positions` → Add `chain` query param, group by chain
- `GET /api/history` → Add `chain` query param

---

### Phase 8: Rewards Engine (Optional for Base)
**Goal**: Decide if rewards will be multi-chain

**Decision Needed**:
- Keep rewards in SOL only?
- Add Base-native rewards (ETH or USDC)?
- This affects `bagsService.ts` significantly

---

### Phase 9: Testing & Validation
**Goal**: Ensure both chains work correctly

**Test Cases**:
1. Register with Solana wallet ✓
2. Register with Base wallet ✓
3. Search Solana tokens ✓
4. Search Base tokens ✓
5. Buy Solana token ✓
6. Buy Base token ✓
7. Sell Solana position ✓
8. Sell Base position ✓
9. View portfolio with mixed chains ✓
10. Leaderboard calculations include both chains ✓

---

### Phase 10: Documentation & Deployment
**Goal**: Update docs and deploy

**Tasks**:
- Update API documentation
- Update user-facing documentation
- Create database migration scripts
- Deploy with feature flags if needed

---

## Part 4: Key Technical Considerations

### 1. Address Validation
```typescript
// Solana: Base58, 32-44 chars
const SOLANA_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// Base/EVM: Hex, 0x prefix, 40 hex chars
const EVM_REGEX = /^0x[a-fA-F0-9]{40}$/;
```

### 2. Decimal Precision
```typescript
const CHAIN_DECIMALS = {
  solana: 9,   // lamports
  base: 18,    // wei
} as const;

// 1 SOL = 1,000,000,000 lamports
// 1 ETH = 1,000,000,000,000,000,000 wei
```

### 3. Price API Differences
DexScreener returns `priceNative` in the chain's native token:
- Solana: price in SOL (need to convert to lamports × 10^9)
- Base: price in ETH (need to convert to wei × 10^18)

### 4. Database Backfill Strategy
```sql
-- Add chain column with default
ALTER TABLE positions ADD COLUMN chain VARCHAR(10) DEFAULT 'solana';
ALTER TABLE trade_history ADD COLUMN chain VARCHAR(10) DEFAULT 'solana';

-- Make chain part of unique constraint
ALTER TABLE positions DROP CONSTRAINT user_token_unique;
ALTER TABLE positions ADD CONSTRAINT user_token_chain_unique 
  UNIQUE (user_id, token_address, chain);
```

---

## Part 5: Implementation Order Recommendation

### Sprint 1: Foundation
1. ✅ Create plan document (THIS)
2. Database schema updates (Phase 1)
3. Chain utilities library (Phase 4)

### Sprint 2: Backend Core
4. Market data service multi-chain (Phase 2)
5. Trade routes chain abstraction (Phase 3)
6. API route updates (Phase 7)

### Sprint 3: Frontend
7. Chain selector UI (Phase 5)
8. Wallet management (Phase 6)

### Sprint 4: Polish
9. Testing & validation (Phase 9)
10. Documentation (Phase 10)

---

## Appendix: File Checklist

### Modified Files
- [ ] `shared/schema.ts`
- [ ] `server/services/marketData.ts`
- [ ] `server/routes.ts`
- [ ] `server/solPrice.ts` (rename to `nativePrice.ts`?)
- [ ] `client/src/pages/Trade.tsx`
- [ ] `client/src/pages/Register.tsx`
- [ ] `client/src/components/WalletExplorer.tsx`
- [ ] `client/src/pages/Portfolio.tsx`
- [ ] `client/src/pages/Positions.tsx`
- [ ] `client/src/pages/History.tsx`

### New Files
- [ ] `server/lib/chain-utils.ts`
- [ ] `migrations/XXXX_add_chain_support.sql`
- [ ] `server/services/baseMarketData.ts` (if needed)

---

**Status**: Ready for Sprint 1
**Next Step**: Await approval, then begin Phase 1
