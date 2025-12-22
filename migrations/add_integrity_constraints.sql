-- Balance cannot go negative
ALTER TABLE users 
ADD CONSTRAINT users_balance_non_negative CHECK (balance >= 0);

-- Position amount must be positive
ALTER TABLE positions 
ADD CONSTRAINT positions_amount_non_negative CHECK (amount > 0);

-- Position sol_spent cannot be negative
ALTER TABLE positions 
ADD CONSTRAINT positions_sol_spent_non_negative CHECK (sol_spent >= 0);

-- Trade amount must be positive
ALTER TABLE trade_history
ADD CONSTRAINT trade_history_amount_positive CHECK (amount > 0);

-- Trade sol_received cannot be negative
ALTER TABLE trade_history
ADD CONSTRAINT trade_history_sol_received_non_negative CHECK (sol_received >= 0);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_positions_user_token ON positions(user_id, token_address);
CREATE INDEX IF NOT EXISTS idx_trade_history_user_closed ON trade_history(user_id, closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_history_closed_at ON trade_history(closed_at);
