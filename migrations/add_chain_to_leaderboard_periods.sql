-- Fix missing chain column on leaderboard_periods (required for Base pivot)
ALTER TABLE leaderboard_periods ADD COLUMN IF NOT EXISTS chain TEXT NOT NULL DEFAULT 'solana';

-- Backfill any existing rows that might have NULL
UPDATE leaderboard_periods SET chain = 'solana' WHERE chain IS NULL OR chain = '';
