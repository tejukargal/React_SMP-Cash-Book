-- Add financial_year column to cash_entries table
ALTER TABLE cash_entries ADD COLUMN IF NOT EXISTS financial_year VARCHAR(7);

-- Create index for faster FY-based queries
CREATE INDEX IF NOT EXISTS idx_financial_year ON cash_entries(financial_year);

-- Update existing entries with calculated financial year based on date
-- Financial Year: April 1st to March 31st (e.g., 2025-26, 2024-25)
UPDATE cash_entries
SET financial_year = CASE
    -- If date is in format dd/mm/yy, extract and calculate FY
    WHEN date ~ '^[0-9]{2}/[0-9]{2}/[0-9]{2}$' THEN
        CASE
            -- If month is Jan-Mar (01-03), FY is (year-1)-year
            WHEN CAST(SUBSTRING(date FROM 4 FOR 2) AS INT) BETWEEN 1 AND 3 THEN
                LPAD((CAST(SUBSTRING(date FROM 7 FOR 2) AS INT) - 1)::TEXT, 2, '0') || '-' || SUBSTRING(date FROM 7 FOR 2)
            -- If month is Apr-Dec (04-12), FY is year-(year+1)
            ELSE
                SUBSTRING(date FROM 7 FOR 2) || '-' || LPAD((CAST(SUBSTRING(date FROM 7 FOR 2) AS INT) + 1)::TEXT, 2, '0')
        END
    ELSE NULL
END
WHERE financial_year IS NULL;
