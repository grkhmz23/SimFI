-- Migration 0012: Add missing userId indexes for positions and trade_history
-- These indexes accelerate the primary read patterns:
--   getUserPositions(userId) and getUserTrades(userId, closedAt DESC)
-- sb_bets already has idx_sb_bets_user_status covering userId queries.
-- IF NOT EXISTS guards make this migration safe to re-run.

CREATE INDEX IF NOT EXISTS idx_positions_user_id
  ON positions (user_id);

CREATE INDEX IF NOT EXISTS idx_trade_history_user_closed_at
  ON trade_history (user_id, closed_at DESC);
