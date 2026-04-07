-- Neon Database Migration for Base Chain Support
-- Run this in Render Shell: psql $DATABASE_URL -f neon_migration.sql

-- Create user_balances table (per-chain balances)
CREATE TABLE IF NOT EXISTS user_balances (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chain VARCHAR(10) NOT NULL CHECK (chain IN ('solana', 'base')),
    balance BIGINT NOT NULL,
    total_profit BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
    UNIQUE(user_id, chain)
);

-- Create user_wallets table (per-chain wallet addresses)
CREATE TABLE IF NOT EXISTS user_wallets (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chain VARCHAR(10) NOT NULL CHECK (chain IN ('solana', 'base')),
    address TEXT NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    UNIQUE(user_id, chain)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_balances_user_id ON user_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_user_balances_chain ON user_balances(chain);
CREATE INDEX IF NOT EXISTS idx_user_wallets_user_id ON user_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_wallets_chain ON user_wallets(chain);

-- Add chain column to positions table
ALTER TABLE positions ADD COLUMN IF NOT EXISTS chain VARCHAR(10) DEFAULT 'solana' NOT NULL;

-- Add chain column to trade_history table  
ALTER TABLE trade_history ADD COLUMN IF NOT EXISTS chain VARCHAR(10) DEFAULT 'solana' NOT NULL;

-- Add chain column to telegram_sessions table
ALTER TABLE telegram_sessions ADD COLUMN IF NOT EXISTS chain VARCHAR(10) DEFAULT 'solana' NOT NULL;

-- Rename solSpent to nativeSpent in positions
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'positions' AND column_name = 'sol_spent') THEN
        ALTER TABLE positions RENAME COLUMN sol_spent TO native_spent;
    END IF;
END$$;

-- Rename solSpent/solReceived to nativeSpent/nativeReceived in trade_history
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'trade_history' AND column_name = 'sol_spent') THEN
        ALTER TABLE trade_history RENAME COLUMN sol_spent TO native_spent;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'trade_history' AND column_name = 'sol_received') THEN
        ALTER TABLE trade_history RENAME COLUMN sol_received TO native_received;
    END IF;
END$$;

-- Update unique constraint on positions to include chain
ALTER TABLE positions DROP CONSTRAINT IF EXISTS user_token_unique;
ALTER TABLE positions DROP CONSTRAINT IF EXISTS positions_userId_tokenAddress_key;
ALTER TABLE positions DROP CONSTRAINT IF EXISTS user_token_chain_unique;
ALTER TABLE positions ADD CONSTRAINT user_token_chain_unique UNIQUE (user_id, token_address, chain);

-- Verify migration
SELECT 'Tables created successfully!' as status;
SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;
