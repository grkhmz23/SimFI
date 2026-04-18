-- Migration: Convert amount and native-spent columns from bigint to numeric(38,0)
-- Base trades with cheap 18-decimal tokens produce amounts that exceed bigint max (~9.22e18).

-- positions table
ALTER TABLE positions ALTER COLUMN amount TYPE numeric(38, 0);
ALTER TABLE positions ALTER COLUMN sol_spent TYPE numeric(38, 0);

-- trade_history table
ALTER TABLE trade_history ALTER COLUMN amount TYPE numeric(38, 0);
ALTER TABLE trade_history ALTER COLUMN sol_spent TYPE numeric(38, 0);
ALTER TABLE trade_history ALTER COLUMN sol_received TYPE numeric(38, 0);
ALTER TABLE trade_history ALTER COLUMN profit_loss TYPE numeric(38, 0);
