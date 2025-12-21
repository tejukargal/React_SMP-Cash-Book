const { Pool } = require('pg');

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

  if (month >= 1 && month <= 3) {
    const prevYear = year - 1;
    return `${prevYear.toString().padStart(2, '0')}-${year.toString().padStart(2, '0')}`;
  }

  const nextYear = year + 1;
  return `${year.toString().padStart(2, '0')}-${nextYear.toString().padStart(2, '0')}`;
}

// Helper function to send CORS response
function sendResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event, context) => {
  // Handle OPTIONS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return sendResponse(200, {});
  }

  const method = event.httpMethod;
  const queryParams = event.queryStringParameters || {};
  let body = {};

  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch (e) {
    // Ignore JSON parse errors for empty body
  }

  // Debug log the entire event to understand what we're receiving
  console.log('[API DEBUG] event.path:', event.path);
  console.log('[API DEBUG] event.rawUrl:', event.rawUrl);

  // Extract route from path
  // The function is called via redirect from /api/* to /.netlify/functions/api/:splat
  // So event.path might be /.netlify/functions/api or the original /api/entries
  let route = '';

  // Try to extract from rawUrl first (more reliable)
  if (event.rawUrl) {
    const url = new URL(event.rawUrl);
    route = url.pathname;
    console.log('[API DEBUG] Extracted from rawUrl.pathname:', route);
  } else {
    route = event.path || '';
    console.log('[API DEBUG] Using event.path:', route);
  }

  // Remove all possible prefixes - be aggressive
  const prefixes = ['/.netlify/functions/api/', '/.netlify/functions/api', '/api/', '/api'];
  for (const prefix of prefixes) {
    if (route.startsWith(prefix)) {
      route = route.substring(prefix.length);
      console.log(`[API DEBUG] After removing "${prefix}":`, route);
      break;
    }
  }

  // Clean up slashes
  route = route.replace(/^\/+/, '').replace(/\/+$/, '');

  console.log(`[API] ${method} /${route}`);

  try {
    // ===== HEALTH CHECK =====
    if (method === 'GET' && (route === 'health' || route === '')) {
      return sendResponse(200, { status: 'ok', message: 'SMP Cash Book API is running' });
    }

    // ===== GET RECENT ENTRIES (must come before general entries route) =====
    if (method === 'GET' && route === 'entries/recent') {
      const { fy, cb_type, limit = 5 } = queryParams;
      const params = [];
      const conditions = [];

      if (fy) {
        conditions.push(`financial_year = $${params.length + 1}`);
        params.push(fy);
      }

      if (cb_type && cb_type !== 'both') {
        conditions.push(`cb_type = $${params.length + 1}`);
        params.push(cb_type);
      }

      let query = 'SELECT * FROM cash_entries';
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }
      query += ` ORDER BY created_at DESC, id DESC LIMIT $${params.length + 1}`;
      params.push(parseInt(limit, 10));

      const result = await pool.query(query, params);
      return sendResponse(200, result.rows);
    }

    // ===== GET RECENT DATE (must come before general entries route) =====
    if (method === 'GET' && route === 'entries/recent-date') {
      const result = await pool.query(
        'SELECT date FROM cash_entries ORDER BY created_at DESC LIMIT 1'
      );
      return sendResponse(200, result.rows.length > 0 ? { date: result.rows[0].date } : { date: null });
    }

    // ===== CHECK DUPLICATE (must come before POST entries) =====
    if (method === 'POST' && route === 'entries/check-duplicate') {
      const { date, type, amount, head_of_accounts, cheque_no, notes } = body;
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

      return sendResponse(200, { isDuplicate: parseInt(result.rows[0].count) > 0 });
    }

    // ===== BULK IMPORT (must come before POST entries) =====
    if (method === 'POST' && route === 'entries/bulk-import') {
      const { entries } = body;

      if (!Array.isArray(entries) || entries.length === 0) {
        return sendResponse(400, { error: 'Entries array is required' });
      }

      const client = await pool.connect();
      const results = [];
      const errors = [];

      try {
        await client.query('BEGIN');

        for (let i = 0; i < entries.length; i++) {
          const { date, type, cheque_no, amount, head_of_accounts, notes, cb_type } = entries[i];

          try {
            if (!date || !type || !amount || !head_of_accounts || !cheque_no || !notes) {
              errors.push({ index: i, entry: entries[i], error: 'Missing required fields' });
              continue;
            }

            if (type !== 'receipt' && type !== 'payment') {
              errors.push({ index: i, entry: entries[i], error: 'Invalid type' });
              continue;
            }

            const cbType = cb_type || 'aided';
            const financial_year = calculateFinancialYear(date);

            const result = await client.query(
              `INSERT INTO cash_entries (date, type, cheque_no, amount, head_of_accounts, notes, financial_year, cb_type)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               RETURNING *`,
              [date, type, cheque_no, parseFloat(amount), head_of_accounts, notes, financial_year, cbType]
            );

            results.push(result.rows[0]);
          } catch (err) {
            errors.push({ index: i, entry: entries[i], error: err.message });
          }
        }

        await client.query('COMMIT');

        return sendResponse(201, {
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
    }

    // ===== DELETE ALL ENTRIES (must come before DELETE by ID) =====
    // Supports optional cb_type query parameter to filter deletions
    if (method === 'DELETE' && route === 'entries/delete-all') {
      const { cb_type, fy } = queryParams;

      let query = 'DELETE FROM cash_entries';
      const params = [];
      const conditions = [];

      // Add WHERE clause if cb_type is specified
      if (cb_type && (cb_type === 'aided' || cb_type === 'unaided')) {
        conditions.push(`cb_type = $${params.length + 1}`);
        params.push(cb_type);
      }

      // Add WHERE clause if financial year is specified
      if (fy) {
        conditions.push(`financial_year = $${params.length + 1}`);
        params.push(fy);
      }

      // Build final query
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      const result = await pool.query(query, params);
      const deletedCount = result.rowCount || 0;

      const cbTypeLabel = cb_type === 'aided' ? 'Aided' : cb_type === 'unaided' ? 'Unaided' : 'all';
      const fyLabel = fy ? ` for FY ${fy}` : '';
      console.log(`✅ Deleted ${cbTypeLabel} entries${fyLabel}: ${deletedCount} records removed`);

      return sendResponse(200, {
        success: true,
        deleted: deletedCount,
        message: `Successfully deleted ${deletedCount} ${cbTypeLabel} entries${fyLabel}`
      });
    }

    // ===== GET DASHBOARD SUMMARY (optimized for large datasets) =====
    if (method === 'GET' && route === 'dashboard/summary') {
      const { fy, cb_type } = queryParams;

      const params = [];
      const conditions = [];

      if (fy) {
        conditions.push(`financial_year = $${params.length + 1}`);
        params.push(fy);
      }

      if (cb_type && cb_type !== 'both') {
        conditions.push(`cb_type = $${params.length + 1}`);
        params.push(cb_type);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get summary statistics in a single query
      const summaryQuery = `
        SELECT
          COUNT(*) FILTER (WHERE type = 'receipt') AS receipt_count,
          COUNT(*) FILTER (WHERE type = 'payment') AS payment_count,
          COALESCE(SUM(amount) FILTER (WHERE type = 'receipt'), 0) AS total_receipts,
          COALESCE(SUM(amount) FILTER (WHERE type = 'payment'), 0) AS total_payments,
          COUNT(DISTINCT head_of_accounts) FILTER (WHERE type = 'receipt') AS receipt_ledger_count,
          COUNT(DISTINCT head_of_accounts) FILTER (WHERE type = 'payment') AS payment_ledger_count
        FROM cash_entries
        ${whereClause}
      `;

      const summaryResult = await pool.query(summaryQuery, params);
      const summary = summaryResult.rows[0];

      // Get recent 5 transactions
      const recentQuery = `
        SELECT * FROM cash_entries
        ${whereClause}
        ORDER BY created_at DESC, id DESC
        LIMIT 5
      `;

      const recentResult = await pool.query(recentQuery, params);

      return sendResponse(200, {
        summary: {
          receiptCount: parseInt(summary.receipt_count) || 0,
          paymentCount: parseInt(summary.payment_count) || 0,
          totalReceipts: parseFloat(summary.total_receipts) || 0,
          totalPayments: parseFloat(summary.total_payments) || 0,
          balance: (parseFloat(summary.total_receipts) || 0) - (parseFloat(summary.total_payments) || 0),
          receiptLedgerCount: parseInt(summary.receipt_ledger_count) || 0,
          paymentLedgerCount: parseInt(summary.payment_ledger_count) || 0,
        },
        recentTransactions: recentResult.rows,
      });
    }

    // ===== GET ALL ENTRIES (with pagination support) =====
    if (method === 'GET' && route === 'entries') {
      const { fy, cb_type, limit, offset } = queryParams;
      let query = `SELECT * FROM cash_entries`;
      const params = [];
      const conditions = [];

      if (fy) {
        conditions.push(`financial_year = $${params.length + 1}`);
        params.push(fy);
      }

      if (cb_type && cb_type !== 'both') {
        conditions.push(`cb_type = $${params.length + 1}`);
        params.push(cb_type);
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      query += `
        ORDER BY
          CASE
            WHEN date ~ '^[0-9]{2}/[0-9]{2}/[0-9]{2}$' THEN
              TO_DATE('20' || SUBSTRING(date FROM 7 FOR 2) || '-' || SUBSTRING(date FROM 4 FOR 2) || '-' || SUBSTRING(date FROM 1 FOR 2), 'YYYY-MM-DD')
            ELSE CURRENT_DATE
          END ASC,
          created_at ASC
      `;

      // Add pagination if limit is provided
      if (limit) {
        query += ` LIMIT $${params.length + 1}`;
        params.push(parseInt(limit, 10));
      }

      if (offset) {
        query += ` OFFSET $${params.length + 1}`;
        params.push(parseInt(offset, 10));
      }

      const result = await pool.query(query, params);

      // If pagination is used, also get total count
      if (limit || offset) {
        let countQuery = 'SELECT COUNT(*) FROM cash_entries';
        if (conditions.length > 0) {
          countQuery += ` WHERE ${conditions.join(' AND ')}`;
        }
        const countResult = await pool.query(countQuery, conditions.length > 0 ? params.slice(0, conditions.length) : []);
        const total = parseInt(countResult.rows[0].count, 10);

        return sendResponse(200, {
          entries: result.rows,
          pagination: {
            total,
            limit: parseInt(limit || result.rows.length, 10),
            offset: parseInt(offset || 0, 10),
          },
        });
      } else {
        // Legacy response for backward compatibility
        return sendResponse(200, result.rows);
      }
    }

    // ===== GET SUGGESTIONS =====
    if (method === 'GET' && route === 'suggestions/head') {
      const { query, type, fy } = queryParams;
      if (!query || query.length < 1) return sendResponse(200, []); // Instant suggestions from first character!

      // Build WHERE conditions
      const conditions = ['LOWER(head_of_accounts) LIKE LOWER($1)'];
      const params = [`%${query}%`];

      // Filter by entry type (receipt or payment)
      if (type && (type === 'receipt' || type === 'payment')) {
        conditions.push(`type = $${params.length + 1}`);
        params.push(type);
      }

      // Filter by financial year
      if (fy) {
        conditions.push(`financial_year = $${params.length + 1}`);
        params.push(fy);
      }

      const whereClause = conditions.join(' AND ');

      const result = await pool.query(
        `SELECT head_of_accounts as value
         FROM cash_entries
         WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT 1`,
        params
      );
      return sendResponse(200, result.rows.map(row => ({ value: row.value, count: 0 })));
    }

    if (method === 'GET' && route === 'suggestions/cheque') {
      const { query } = queryParams;
      if (!query || query.length < 1) return sendResponse(200, []);

      const result = await pool.query(
        `SELECT cheque_no as value, COUNT(*) as count
         FROM cash_entries
         WHERE cheque_no IS NOT NULL AND LOWER(cheque_no) LIKE LOWER($1)
         GROUP BY cheque_no
         ORDER BY count DESC
         LIMIT 5`,
        [`%${query}%`]
      );
      return sendResponse(200, result.rows);
    }

    if (method === 'GET' && route === 'suggestions/notes') {
      const { query, type, fy } = queryParams;
      if (!query || query.length < 1) return sendResponse(200, []); // Instant suggestions from first character!

      // Build WHERE conditions
      const conditions = ['notes IS NOT NULL', 'LOWER(notes) LIKE LOWER($1)'];
      const params = [`%${query}%`];

      // Filter by entry type (receipt or payment)
      if (type && (type === 'receipt' || type === 'payment')) {
        conditions.push(`type = $${params.length + 1}`);
        params.push(type);
      }

      // Filter by financial year
      if (fy) {
        conditions.push(`financial_year = $${params.length + 1}`);
        params.push(fy);
      }

      const whereClause = conditions.join(' AND ');

      const result = await pool.query(
        `SELECT notes as value
         FROM cash_entries
         WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT 1`,
        params
      );
      return sendResponse(200, result.rows.map(row => ({ value: row.value, count: 0 })));
    }

    // ===== GET NOTES FOR HEAD OF ACCOUNT =====
    if (method === 'GET' && route === 'suggestions/notes-for-head') {
      const { head, type, fy } = queryParams;
      if (!head || head.length < 2) return sendResponse(200, { notes: null });

      // Build WHERE conditions
      const conditions = ['notes IS NOT NULL', 'LOWER(head_of_accounts) = LOWER($1)'];
      const params = [head];

      // Filter by entry type (receipt or payment)
      if (type && (type === 'receipt' || type === 'payment')) {
        conditions.push(`type = $${params.length + 1}`);
        params.push(type);
      }

      // Filter by financial year
      if (fy) {
        conditions.push(`financial_year = $${params.length + 1}`);
        params.push(fy);
      }

      const whereClause = conditions.join(' AND ');

      const result = await pool.query(
        `SELECT notes
         FROM cash_entries
         WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT 1`,
        params
      );

      return sendResponse(200, result.rows.length > 0 ? { notes: result.rows[0].notes } : { notes: null });
    }

    // ===== CREATE NEW ENTRY =====
    if (method === 'POST' && route === 'entries') {
      const { date, type, cheque_no, amount, head_of_accounts, notes, cb_type } = body;

      if (!date || !type || !amount || !head_of_accounts || !cheque_no || !notes) {
        return sendResponse(400, { error: 'All fields are required' });
      }

      if (type !== 'receipt' && type !== 'payment') {
        return sendResponse(400, { error: 'Invalid type. Must be "receipt" or "payment"' });
      }

      const cbType = cb_type || 'aided';
      const financial_year = calculateFinancialYear(date);

      const result = await pool.query(
        `INSERT INTO cash_entries (date, type, cheque_no, amount, head_of_accounts, notes, financial_year, cb_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [date, type, cheque_no, parseFloat(amount), head_of_accounts, notes, financial_year, cbType]
      );

      return sendResponse(201, result.rows[0]);
    }

    // ===== GET ENTRY BY ID =====
    if (method === 'GET' && route.match(/^entries\/[^/]+$/)) {
      const id = route.split('/')[1];
      const result = await pool.query('SELECT * FROM cash_entries WHERE id = $1', [id]);

      if (result.rows.length === 0) {
        return sendResponse(404, { error: 'Entry not found' });
      }
      return sendResponse(200, result.rows[0]);
    }

    // ===== UPDATE ENTRY =====
    if (method === 'PUT' && route.match(/^entries\/[^/]+$/)) {
      const id = route.split('/')[1];
      const { date, cheque_no, amount, head_of_accounts, notes, cb_type } = body;

      const financial_year = calculateFinancialYear(date);
      const cbType = cb_type || 'aided';

      const result = await pool.query(
        `UPDATE cash_entries
         SET date = $1, cheque_no = $2, amount = $3, head_of_accounts = $4, notes = $5, financial_year = $6, cb_type = $7, updated_at = CURRENT_TIMESTAMP
         WHERE id = $8
         RETURNING *`,
        [date, cheque_no || null, parseFloat(amount), head_of_accounts, notes || null, financial_year, cbType, id]
      );

      if (result.rows.length === 0) {
        return sendResponse(404, { error: 'Entry not found' });
      }
      return sendResponse(200, result.rows[0]);
    }

    // ===== DELETE ENTRY BY ID =====
    if (method === 'DELETE' && route.match(/^entries\/[^/]+$/)) {
      const id = route.split('/')[1];
      const result = await pool.query('DELETE FROM cash_entries WHERE id = $1 RETURNING *', [id]);

      if (result.rows.length === 0) {
        return sendResponse(404, { error: 'Entry not found' });
      }
      return sendResponse(200, { success: true, deleted: result.rows[0] });
    }

    // Route not found
    console.log(`[API] Route not found: ${method} /${route}`);
    return sendResponse(404, { error: 'Route not found', path: route, method });

  } catch (error) {
    console.error('[API] Error:', error);
    return sendResponse(500, { error: 'Internal server error', details: error.message });
  }
};
