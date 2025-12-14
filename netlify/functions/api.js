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

  // Extract the route path - handle all possible formats
  // Netlify can send: /.netlify/functions/api/entries/recent-date
  // Or via redirect: the path portion after /api/
  let route = event.path || '';

  // Remove function prefix if present
  route = route.replace('/.netlify/functions/api', '');
  route = route.replace(/^\/+/, ''); // Remove leading slashes
  route = route.replace(/\/+$/, ''); // Remove trailing slashes

  console.log(`[API] ${method} /${route}`, queryParams);

  try {
    // ===== HEALTH CHECK =====
    if (method === 'GET' && (route === 'health' || route === '')) {
      return sendResponse(200, { status: 'ok', message: 'SMP Cash Book API is running' });
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
          const { date, type, cheque_no, amount, head_of_accounts, notes } = entries[i];

          try {
            if (!date || !type || !amount || !head_of_accounts || !cheque_no || !notes) {
              errors.push({ index: i, entry: entries[i], error: 'Missing required fields' });
              continue;
            }

            if (type !== 'receipt' && type !== 'payment') {
              errors.push({ index: i, entry: entries[i], error: 'Invalid type' });
              continue;
            }

            const financial_year = calculateFinancialYear(date);

            const result = await client.query(
              `INSERT INTO cash_entries (date, type, cheque_no, amount, head_of_accounts, notes, financial_year)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING *`,
              [date, type, cheque_no, parseFloat(amount), head_of_accounts, notes, financial_year]
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
    if (method === 'DELETE' && route === 'entries/delete-all') {
      const result = await pool.query('DELETE FROM cash_entries');
      const deletedCount = result.rowCount || 0;

      return sendResponse(200, {
        success: true,
        deleted: deletedCount,
        message: `Successfully deleted ${deletedCount} entries`
      });
    }

    // ===== GET ALL ENTRIES =====
    if (method === 'GET' && route === 'entries') {
      const { fy } = queryParams;
      let query = `SELECT * FROM cash_entries`;
      const params = [];

      if (fy) {
        query += ` WHERE financial_year = $1`;
        params.push(fy);
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
      return sendResponse(200, result.rows);
    }

    // ===== GET SUGGESTIONS =====
    if (method === 'GET' && route === 'suggestions/head') {
      const { query } = queryParams;
      if (!query || query.length < 2) return sendResponse(200, []);

      const result = await pool.query(
        `SELECT head_of_accounts as value, COUNT(*) as count
         FROM cash_entries
         WHERE LOWER(head_of_accounts) LIKE LOWER($1)
         GROUP BY head_of_accounts
         ORDER BY count DESC
         LIMIT 5`,
        [`%${query}%`]
      );
      return sendResponse(200, result.rows);
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
      const { query } = queryParams;
      if (!query || query.length < 2) return sendResponse(200, []);

      const result = await pool.query(
        `SELECT notes as value, COUNT(*) as count
         FROM cash_entries
         WHERE notes IS NOT NULL AND LOWER(notes) LIKE LOWER($1)
         GROUP BY notes
         ORDER BY count DESC
         LIMIT 5`,
        [`%${query}%`]
      );
      return sendResponse(200, result.rows);
    }

    // ===== CREATE NEW ENTRY =====
    if (method === 'POST' && route === 'entries') {
      const { date, type, cheque_no, amount, head_of_accounts, notes } = body;

      if (!date || !type || !amount || !head_of_accounts || !cheque_no || !notes) {
        return sendResponse(400, { error: 'All fields are required' });
      }

      if (type !== 'receipt' && type !== 'payment') {
        return sendResponse(400, { error: 'Invalid type. Must be "receipt" or "payment"' });
      }

      const financial_year = calculateFinancialYear(date);

      const result = await pool.query(
        `INSERT INTO cash_entries (date, type, cheque_no, amount, head_of_accounts, notes, financial_year)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [date, type, cheque_no, parseFloat(amount), head_of_accounts, notes, financial_year]
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
      const { date, cheque_no, amount, head_of_accounts, notes } = body;

      const financial_year = calculateFinancialYear(date);

      const result = await pool.query(
        `UPDATE cash_entries
         SET date = $1, cheque_no = $2, amount = $3, head_of_accounts = $4, notes = $5, financial_year = $6, updated_at = CURRENT_TIMESTAMP
         WHERE id = $7
         RETURNING *`,
        [date, cheque_no || null, parseFloat(amount), head_of_accounts, notes || null, financial_year, id]
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
