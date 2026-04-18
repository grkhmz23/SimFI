-- Migration: Rename native_spent/native_received to sol_spent/sol_received
-- Production DB was created with older column names that don't match current code.
-- Both positions and trade_history tables are empty in production, so this is safe.

ALTER TABLE positions RENAME COLUMN native_spent TO sol_spent;
ALTER TABLE trade_history RENAME COLUMN native_spent TO sol_spent;
ALTER TABLE trade_history RENAME COLUMN native_received TO sol_received;
