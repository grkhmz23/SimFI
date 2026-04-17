-- Fix missing columns on users table required for multi-chain registration
-- Applied to production Neon DB on 2026-04-15

-- Wallet addresses
ALTER TABLE users ADD COLUMN IF NOT EXISTS solana_wallet_address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS base_wallet_address TEXT;

-- Base chain balances / profits
ALTER TABLE users ADD COLUMN IF NOT EXISTS base_balance BIGINT NOT NULL DEFAULT 5000000000000000000;
ALTER TABLE users ADD COLUMN IF NOT EXISTS base_total_profit BIGINT NOT NULL DEFAULT 0;

-- Preferences
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_chain TEXT NOT NULL DEFAULT 'base';

-- Streak tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_streak_date TIMESTAMP;
