-- Migration: Convert price columns from bigint to numeric(38, 18)
-- This allows storing Base prices (in ETH decimals) without overflowing PostgreSQL bigint.

ALTER TABLE positions ALTER COLUMN entry_price TYPE numeric(38, 18);
ALTER TABLE trade_history ALTER COLUMN entry_price TYPE numeric(38, 18);
ALTER TABLE trade_history ALTER COLUMN exit_price TYPE numeric(38, 18);
