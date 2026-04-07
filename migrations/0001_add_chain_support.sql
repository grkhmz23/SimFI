-- Migration: Add multi-chain support for Base chain integration
-- Created: 2026-04-07
-- Description: Adds chain enum, per-chain balances, and chain identifiers to positions/trades

-- =============================================================================
-- 1. Create chain enum type
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chain') THEN
        CREATE TYPE chain AS ENUM ('solana', 'base');
    END IF;
END$$;

-- =============================================================================
-- 2. Create user_balances table (per-chain balances)
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_balances (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chain chain NOT NULL,
    balance BIGINT NOT NULL,
    total_profit BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
    UNIQUE(user_id, chain)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_balances_user_id ON user_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_user_balances_chain ON user_balances(chain);

-- =============================================================================
-- 3. Create user_wallets table (per-chain wallet addresses)
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_wallets (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chain chain NOT NULL,
    address TEXT NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    UNIQUE(user_id, chain)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_wallets_user_id ON user_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_wallets_chain ON user_wallets(chain);

-- =============================================================================
-- 4. Migrate existing user data to new tables
-- =============================================================================

-- Migrate existing user balances to user_balances table (default to Solana)
INSERT INTO user_balances (user_id, chain, balance, total_profit)
SELECT 
    id as user_id,
    'solana'::chain as chain,
    balance,
    total_profit
FROM users
ON CONFLICT (user_id, chain) DO NOTHING;

-- Migrate existing wallet addresses to user_wallets table (default to Solana)
INSERT INTO user_wallets (user_id, chain, address, is_primary)
SELECT 
    id as user_id,
    'solana'::chain as chain,
    wallet_address as address,
    1 as is_primary
FROM users
ON CONFLICT (user_id, chain) DO NOTHING;

-- =============================================================================
-- 5. Add chain column to positions table
-- =============================================================================

-- Add chain column with default
ALTER TABLE positions 
    ADD COLUMN IF NOT EXISTS chain chain NOT NULL DEFAULT 'solana';

-- Rename sol_spent to native_spent (chain-agnostic)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'positions' AND column_name = 'sol_spent') THEN
        ALTER TABLE positions RENAME COLUMN sol_spent TO native_spent;
    END IF;
END$$;

-- Add native_spent column if it doesn't exist (for fresh installs)
ALTER TABLE positions 
    ADD COLUMN IF NOT EXISTS native_spent BIGINT NOT NULL DEFAULT 0;

-- Drop old unique constraint and create new one including chain
ALTER TABLE positions 
    DROP CONSTRAINT IF EXISTS user_token_unique;

ALTER TABLE positions 
    DROP CONSTRAINT IF EXISTS positions_userId_tokenAddress_key;

-- Create new unique constraint that includes chain
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'user_token_chain_unique' AND conrelid = 'positions'::regclass
    ) THEN
        ALTER TABLE positions 
            ADD CONSTRAINT user_token_chain_unique 
            UNIQUE (user_id, token_address, chain);
    END IF;
END$$;

-- Add index for chain lookups
CREATE INDEX IF NOT EXISTS idx_positions_chain ON positions(chain);

-- =============================================================================
-- 6. Add chain column to trade_history table
-- =============================================================================

-- Add chain column with default
ALTER TABLE trade_history 
    ADD COLUMN IF NOT EXISTS chain chain NOT NULL DEFAULT 'solana';

-- Rename sol_spent to native_spent
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'trade_history' AND column_name = 'sol_spent') THEN
        ALTER TABLE trade_history RENAME COLUMN sol_spent TO native_spent;
    END IF;
END$$;

-- Rename sol_received to native_received
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'trade_history' AND column_name = 'sol_received') THEN
        ALTER TABLE trade_history RENAME COLUMN sol_received TO native_received;
    END IF;
END$$;

-- Add columns if they don't exist (for fresh installs)
ALTER TABLE trade_history 
    ADD COLUMN IF NOT EXISTS native_spent BIGINT NOT NULL DEFAULT 0;

ALTER TABLE trade_history 
    ADD COLUMN IF NOT EXISTS native_received BIGINT NOT NULL DEFAULT 0;

-- Add index for chain lookups
CREATE INDEX IF NOT EXISTS idx_trade_history_chain ON trade_history(chain);

-- =============================================================================
-- 7. Add chain column to telegram_sessions table
-- =============================================================================

ALTER TABLE telegram_sessions 
    ADD COLUMN IF NOT EXISTS chain chain NOT NULL DEFAULT 'solana';

CREATE INDEX IF NOT EXISTS idx_telegram_sessions_chain ON telegram_sessions(chain);

-- =============================================================================
-- 8. Migration verification
-- =============================================================================

-- Log migration status
DO $$
DECLARE
    user_balance_count INTEGER;
    user_wallet_count INTEGER;
    position_chain_count INTEGER;
    trade_chain_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_balance_count FROM user_balances;
    SELECT COUNT(*) INTO user_wallet_count FROM user_wallets;
    SELECT COUNT(*) INTO position_chain_count FROM positions WHERE chain = 'solana';
    SELECT COUNT(*) INTO trade_chain_count FROM trade_history WHERE chain = 'solana';
    
    RAISE NOTICE 'Migration completed successfully:';
    RAISE NOTICE '  - User balances migrated: %', user_balance_count;
    RAISE NOTICE '  - User wallets migrated: %', user_wallet_count;
    RAISE NOTICE '  - Positions with chain=solana: %', position_chain_count;
    RAISE NOTICE '  - Trades with chain=solana: %', trade_chain_count;
END$$;
