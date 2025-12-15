import express from 'express';
import cors from 'cors';
import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// PostgreSQL connection pool to Nile Database
const pool = new Pool({
  connectionString: process.env.NILE_CONNECTION_STRING,
  ssl: {
    rejectUnauthorized: false
  }
});

// Function to calculate Financial Year from date (dd/mm/yy format)
function calculateFinancialYear(dateStr) {
  const datePattern = /^(\d{2})\/(\d{2})\/(\d{2})$/;
  const match = dateStr.match(datePattern);

  if (!match) return null;

  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  // If month is Jan-Mar (1-3), FY is (year-1)-year
  if (month >= 1 && month <= 3) {
    const prevYear = year - 1;
    return `${prevYear.toString().padStart(2, '0')}-${year.toString().padStart(2, '0')}`;
  }

  // If month is Apr-Dec (4-12), FY is year-(year+1)
  const nextYear = year + 1;
  return `${year.toString().padStart(2, '0')}-${nextYear.toString().padStart(2, '0')}`;
}

// Run database migration on startup
async function runMigration() {
  try {
    const migrationPath = path.join(__dirname, 'migrations', 'add_financial_year.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    await pool.query(migrationSQL);
    console.log('✅ Database migration completed successfully');
  } catch (error) {
    console.error('❌ Migration error:', error.message);
  }
}

// Test database connection and run migration
pool.query('SELECT NOW()', async (err, res) => {
  if (err) {
    console.error('❌ Failed to connect to Nile Database:', err.message);
  } else {
    console.log('✅ Connected to Nile Database successfully!');
    console.log('   Server time:', res.rows[0].now);

    // Run migration
    await runMigration();
  }
});

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'SMP Cash Book API is running' });
});

// Get all entries sorted by date (newest first), optionally filtered by FY and CB Type
app.get('/api/entries', async (req, res) => {
  try {
    const { fy, cb_type } = req.query;

    let query = `
      SELECT * FROM cash_entries
    `;

    const params = [];
    const conditions = [];

    // Add FY filter if provided
    if (fy) {
      conditions.push(`financial_year = $${params.length + 1}`);
      params.push(fy);
    }

    // Add CB Type filter if provided (and not 'both')
    if (cb_type && cb_type !== 'both') {
      conditions.push(`cb_type = $${params.length + 1}`);
      params.push(cb_type);
    }

    // Add WHERE clause if there are conditions
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += `
      ORDER BY
        CASE
          WHEN date ~ '^[0-9]{2}/[0-9]{2}/[0-9]{2}$' THEN
            TO_DATE('20' || SUBSTRING(date FROM 7 FOR 2) || '-' || SUBSTRING(date FROM 4 FOR 2) || '-' || SUBSTRING(date FROM 1 FOR 2), 'YYYY-MM-DD')
          ELSE CURRENT_DATE
        END DESC,
        created_at DESC
    `;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching entries:', error);
    res.status(500).json({ error: 'Failed to fetch entries', details: error.message });
  }
});

// Get most recent date
app.get('/api/entries/recent-date', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT date FROM cash_entries ORDER BY created_at DESC LIMIT 1'
    );
    res.json(result.rows.length > 0 ? { date: result.rows[0].date } : { date: null });
  } catch (error) {
    console.error('Error fetching recent date:', error);
    res.status(500).json({ error: 'Failed to fetch recent date', details: error.message });
  }
});

// Get autocomplete suggestions for head of accounts
app.get('/api/suggestions/head', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.length < 2) {
      return res.json([]);
    }

    const result = await pool.query(
      `SELECT head_of_accounts as value, COUNT(*) as count
       FROM cash_entries
       WHERE LOWER(head_of_accounts) LIKE LOWER($1)
       GROUP BY head_of_accounts
       ORDER BY count DESC
       LIMIT 5`,
      [`%${query}%`]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching head suggestions:', error);
    res.status(500).json({ error: 'Failed to fetch suggestions', details: error.message });
  }
});

// Get autocomplete suggestions for cheque numbers
app.get('/api/suggestions/cheque', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.length < 1) {
      return res.json([]);
    }

    const result = await pool.query(
      `SELECT cheque_no as value, COUNT(*) as count
       FROM cash_entries
       WHERE cheque_no IS NOT NULL AND LOWER(cheque_no) LIKE LOWER($1)
       GROUP BY cheque_no
       ORDER BY count DESC
       LIMIT 5`,
      [`%${query}%`]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching cheque suggestions:', error);
    res.status(500).json({ error: 'Failed to fetch suggestions', details: error.message });
  }
});

// Get autocomplete suggestions for notes
app.get('/api/suggestions/notes', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.length < 2) {
      return res.json([]);
    }

    const result = await pool.query(
      `SELECT notes as value, COUNT(*) as count
       FROM cash_entries
       WHERE notes IS NOT NULL AND LOWER(notes) LIKE LOWER($1)
       GROUP BY notes
       ORDER BY count DESC
       LIMIT 5`,
      [`%${query}%`]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching notes suggestions:', error);
    res.status(500).json({ error: 'Failed to fetch suggestions', details: error.message });
  }
});

// Create new entry
app.post('/api/entries', async (req, res) => {
  try {
    const { date, type, cheque_no, amount, head_of_accounts, notes, cb_type } = req.body;

    // Validation - ALL fields are now mandatory
    if (!date || !type || !amount || !head_of_accounts || !cheque_no || !notes) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (type !== 'receipt' && type !== 'payment') {
      return res.status(400).json({ error: 'Invalid type. Must be "receipt" or "payment"' });
    }

    // Default cb_type to 'aided' if not provided
    const cbType = cb_type || 'aided';

    // Calculate financial year
    const financial_year = calculateFinancialYear(date);

    const result = await pool.query(
      `INSERT INTO cash_entries (date, type, cheque_no, amount, head_of_accounts, notes, financial_year, cb_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [date, type, cheque_no, parseFloat(amount), head_of_accounts, notes, financial_year, cbType]
    );

    console.log(`✅ Created ${type} (${cbType}): ${head_of_accounts} - ${amount}`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating entry:', error);
    res.status(500).json({ error: 'Failed to create entry', details: error.message });
  }
});

// Get entry by ID
app.get('/api/entries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM cash_entries WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Entry not found' });
    } else {
      res.json(result.rows[0]);
    }
  } catch (error) {
    console.error('Error fetching entry:', error);
    res.status(500).json({ error: 'Failed to fetch entry', details: error.message });
  }
});

// Update entry
app.put('/api/entries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { date, cheque_no, amount, head_of_accounts, notes, cb_type } = req.body;

    // Recalculate financial year if date changed
    const financial_year = calculateFinancialYear(date);

    // Default cb_type to 'aided' if not provided
    const cbType = cb_type || 'aided';

    const result = await pool.query(
      `UPDATE cash_entries
       SET date = $1, cheque_no = $2, amount = $3, head_of_accounts = $4, notes = $5, financial_year = $6, cb_type = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [date, cheque_no || null, parseFloat(amount), head_of_accounts, notes || null, financial_year, cbType, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Entry not found' });
    } else {
      console.log(`✅ Updated entry: ${id}`);
      res.json(result.rows[0]);
    }
  } catch (error) {
    console.error('Error updating entry:', error);
    res.status(500).json({ error: 'Failed to update entry', details: error.message });
  }
});

// Delete all entries (MUST come before delete by ID route)
// Supports optional cb_type query parameter to filter deletions
app.delete('/api/entries/delete-all', async (req, res) => {
  try {
    const { cb_type } = req.query;

    let query = 'DELETE FROM cash_entries';
    const params = [];

    // Add WHERE clause if cb_type is specified
    if (cb_type && (cb_type === 'aided' || cb_type === 'unaided')) {
      query += ' WHERE cb_type = $1';
      params.push(cb_type);
    }

    const result = await pool.query(query, params);
    const deletedCount = result.rowCount || 0;

    const cbTypeLabel = cb_type === 'aided' ? 'Aided' : cb_type === 'unaided' ? 'Unaided' : 'all';
    console.log(`✅ Deleted ${cbTypeLabel} entries: ${deletedCount} records removed`);

    res.json({
      success: true,
      deleted: deletedCount,
      message: `Successfully deleted ${deletedCount} ${cbTypeLabel} entries`
    });
  } catch (error) {
    console.error('Error deleting entries:', error);
    res.status(500).json({ error: 'Failed to delete entries', details: error.message });
  }
});

// Delete entry
app.delete('/api/entries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM cash_entries WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Entry not found' });
    } else {
      console.log(`✅ Deleted entry: ${id}`);
      res.json({ success: true, deleted: result.rows[0] });
    }
  } catch (error) {
    console.error('Error deleting entry:', error);
    res.status(500).json({ error: 'Failed to delete entry', details: error.message });
  }
});

// Check for duplicate (all fields must match)
app.post('/api/entries/check-duplicate', async (req, res) => {
  try {
    const { date, type, amount, head_of_accounts, cheque_no, notes } = req.body;
    const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString();

    const result = await pool.query(
      `SELECT COUNT(*) as count
       FROM cash_entries
       WHERE date = $1 AND type = $2 AND amount = $3 AND head_of_accounts = $4
       AND (cheque_no = $5 OR (cheque_no IS NULL AND $5 IS NULL))
       AND (notes = $6 OR (notes IS NULL AND $6 IS NULL))
       AND created_at > $7`,
      [date, type, parseFloat(amount), head_of_accounts, cheque_no, notes, fiveSecondsAgo]
    );

    res.json({ isDuplicate: parseInt(result.rows[0].count) > 0 });
  } catch (error) {
    console.error('Error checking duplicate:', error);
    res.status(500).json({ error: 'Failed to check duplicate', details: error.message });
  }
});

// Bulk import entries (for fee data import)
app.post('/api/entries/bulk-import', async (req, res) => {
  try {
    const { entries } = req.body;

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'Entries array is required' });
    }

    const client = await pool.connect();
    const results = [];
    const errors = [];

    try {
      await client.query('BEGIN');

      for (let i = 0; i < entries.length; i++) {
        const { date, type, cheque_no, amount, head_of_accounts, notes, cb_type } = entries[i];

        try {
          // Validation
          if (!date || !type || !amount || !head_of_accounts || !cheque_no || !notes) {
            errors.push({
              index: i,
              entry: entries[i],
              error: 'Missing required fields',
            });
            continue;
          }

          if (type !== 'receipt' && type !== 'payment') {
            errors.push({
              index: i,
              entry: entries[i],
              error: 'Invalid type. Must be "receipt" or "payment"',
            });
            continue;
          }

          // Default cb_type to 'aided' if not provided
          const cbType = cb_type || 'aided';

          // Calculate financial year
          const financial_year = calculateFinancialYear(date);

          const result = await client.query(
            `INSERT INTO cash_entries (date, type, cheque_no, amount, head_of_accounts, notes, financial_year, cb_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [date, type, cheque_no, parseFloat(amount), head_of_accounts, notes, financial_year, cbType]
          );

          results.push(result.rows[0]);
        } catch (err) {
          errors.push({
            index: i,
            entry: entries[i],
            error: err.message,
          });
        }
      }

      await client.query('COMMIT');

      console.log(`✅ Bulk import completed: ${results.length} successful, ${errors.length} failed`);
      res.status(201).json({
        success: true,
        imported: results.length,
        failed: errors.length,
        results,
        errors,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error in bulk import:', error);
    res.status(500).json({ error: 'Failed to import entries', details: error.message });
  }
});

// Start server
app.listen(port, () => {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  🚀 SMP Cash Book Backend Server');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  📡 API running on: http://localhost:${port}`);
  console.log(`  🗄️  Database: Nile (smp_cashbook)`);
  console.log(`  🌍 Environment: ${process.env.NODE_ENV}`);
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⏹️  Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});
