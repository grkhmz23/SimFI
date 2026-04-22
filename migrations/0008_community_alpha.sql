-- Community Alpha / Voting (Phase 6)

CREATE TABLE IF NOT EXISTS community_picks (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chain TEXT NOT NULL DEFAULT 'solana',
  token_address TEXT NOT NULL,
  token_name TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  reason TEXT,
  vote_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS community_picks_chain_idx ON community_picks(chain);
CREATE INDEX IF NOT EXISTS community_picks_votes_idx ON community_picks(vote_count DESC);
CREATE INDEX IF NOT EXISTS community_picks_created_idx ON community_picks(created_at DESC);

CREATE TABLE IF NOT EXISTS community_votes (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  pick_id VARCHAR(36) NOT NULL REFERENCES community_picks(id) ON DELETE CASCADE,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT community_votes_user_pick_unique UNIQUE (pick_id, user_id)
);

CREATE INDEX IF NOT EXISTS community_votes_pick_idx ON community_votes(pick_id);
CREATE INDEX IF NOT EXISTS community_votes_user_idx ON community_votes(user_id);
