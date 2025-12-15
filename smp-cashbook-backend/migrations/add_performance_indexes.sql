-- Add indexes for performance optimization
-- These indexes will significantly speed up queries on large datasets

-- Index on financial_year for filtering by FY
CREATE INDEX IF NOT EXISTS idx_cash_entries_financial_year
ON cash_entries(financial_year);

-- Index on cb_type for filtering by cashbook type
CREATE INDEX IF NOT EXISTS idx_cash_entries_cb_type
ON cash_entries(cb_type);

-- Composite index on financial_year and cb_type (most common filter combination)
CREATE INDEX IF NOT EXISTS idx_cash_entries_fy_cbtype
ON cash_entries(financial_year, cb_type);

-- Index on date for sorting and date-based queries
CREATE INDEX IF NOT EXISTS idx_cash_entries_date
ON cash_entries(date);

-- Index on type for filtering receipts vs payments
CREATE INDEX IF NOT EXISTS idx_cash_entries_type
ON cash_entries(type);

-- Index on head_of_accounts for ledger queries
CREATE INDEX IF NOT EXISTS idx_cash_entries_head_of_accounts
ON cash_entries(head_of_accounts);

-- Composite index for ledger queries (head + type)
CREATE INDEX IF NOT EXISTS idx_cash_entries_head_type
ON cash_entries(head_of_accounts, type);

-- Composite index for common query pattern (fy, cb_type, type)
CREATE INDEX IF NOT EXISTS idx_cash_entries_fy_cbtype_type
ON cash_entries(financial_year, cb_type, type);
