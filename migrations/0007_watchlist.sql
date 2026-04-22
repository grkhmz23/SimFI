-- Watchlist table for saved tokens
CREATE TABLE IF NOT EXISTS watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chain TEXT NOT NULL DEFAULT 'solana',
  token_address TEXT NOT NULL,
  token_name TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  decimals INTEGER NOT NULL DEFAULT 6,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Unique constraint: one watchlist entry per user + token + chain
CREATE UNIQUE INDEX IF NOT EXISTS watchlist_user_token_chain_idx
ON watchlist(user_id, token_address, chain);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS watchlist_user_id_idx ON watchlist(user_id);
