# Deployment Guide - Connecting to Nile Database

This guide explains how to connect the SMP Cash Book application to the Nile PostgreSQL database for production use.

## Current Setup

The application currently uses **localStorage** for development and testing. All database operations are abstracted in `src/services/database.ts`, making it easy to switch to a real database.

## Nile Database Information

- **Database Name**: smp_cashbook
- **Region**: AWS_US_WEST_2
- **Host**: us-west-2.db.thenile.dev
- **Port**: 5432
- **Table**: cash_entries (already created with proper schema and indexes)

## Connection Options

### Option 1: Node.js Backend API (Recommended)

Create a backend server that connects to Nile and exposes REST API endpoints.

#### Step 1: Create Backend Server

Create a new directory for the backend:

```bash
mkdir smp-cashbook-backend
cd smp-cashbook-backend
npm init -y
```

#### Step 2: Install Dependencies

```bash
npm install express pg cors dotenv
npm install -D @types/express @types/pg @types/cors @types/node typescript ts-node
```

#### Step 3: Create Backend Files

**`server.ts`**:

```typescript
import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.NILE_CONNECTION_STRING,
});

app.use(cors());
app.use(express.json());

// Get all entries
app.get('/api/entries', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM cash_entries ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching entries:', error);
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

// Get most recent date
app.get('/api/entries/recent-date', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT date FROM cash_entries ORDER BY created_at DESC LIMIT 1'
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    console.error('Error fetching recent date:', error);
    res.status(500).json({ error: 'Failed to fetch recent date' });
  }
});

// Get autocomplete suggestions for head of accounts
app.get('/api/suggestions/head', async (req, res) => {
  try {
    const { query } = req.query;
    const result = await pool.query(
      `SELECT head_of_accounts as value, COUNT(*) as count
       FROM cash_entries
       WHERE head_of_accounts ILIKE $1
       GROUP BY head_of_accounts
       ORDER BY count DESC
       LIMIT 5`,
      [`%${query}%`]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// Get autocomplete suggestions for cheque numbers
app.get('/api/suggestions/cheque', async (req, res) => {
  try {
    const { query } = req.query;
    const result = await pool.query(
      `SELECT cheque_no as value, COUNT(*) as count
       FROM cash_entries
       WHERE cheque_no ILIKE $1 AND cheque_no IS NOT NULL
       GROUP BY cheque_no
       ORDER BY count DESC
       LIMIT 5`,
      [`%${query}%`]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// Get autocomplete suggestions for notes
app.get('/api/suggestions/notes', async (req, res) => {
  try {
    const { query } = req.query;
    const result = await pool.query(
      `SELECT notes as value, COUNT(*) as count
       FROM cash_entries
       WHERE notes ILIKE $1 AND notes IS NOT NULL
       GROUP BY notes
       ORDER BY count DESC
       LIMIT 5`,
      [`%${query}%`]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// Create new entry
app.post('/api/entries', async (req, res) => {
  try {
    const { date, type, cheque_no, amount, head_of_accounts, notes } = req.body;

    const result = await pool.query(
      `INSERT INTO cash_entries (date, type, cheque_no, amount, head_of_accounts, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [date, type, cheque_no || null, amount, head_of_accounts, notes || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating entry:', error);
    res.status(500).json({ error: 'Failed to create entry' });
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
    res.status(500).json({ error: 'Failed to fetch entry' });
  }
});

// Update entry
app.put('/api/entries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { date, cheque_no, amount, head_of_accounts, notes } = req.body;

    const result = await pool.query(
      `UPDATE cash_entries
       SET date = $1, cheque_no = $2, amount = $3, head_of_accounts = $4, notes = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [date, cheque_no || null, amount, head_of_accounts, notes || null, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Entry not found' });
    } else {
      res.json(result.rows[0]);
    }
  } catch (error) {
    console.error('Error updating entry:', error);
    res.status(500).json({ error: 'Failed to update entry' });
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
      res.json({ success: true });
    }
  } catch (error) {
    console.error('Error deleting entry:', error);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

// Check for duplicate
app.post('/api/entries/check-duplicate', async (req, res) => {
  try {
    const { date, type, amount, head_of_accounts } = req.body;
    const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString();

    const result = await pool.query(
      `SELECT COUNT(*) as count
       FROM cash_entries
       WHERE date = $1 AND type = $2 AND amount = $3 AND head_of_accounts = $4
       AND created_at > $5`,
      [date, type, amount, head_of_accounts, fiveSecondsAgo]
    );

    res.json({ isDuplicate: parseInt(result.rows[0].count) > 0 });
  } catch (error) {
    console.error('Error checking duplicate:', error);
    res.status(500).json({ error: 'Failed to check duplicate' });
  }
});

app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
});
```

**`.env`**:

```
NILE_CONNECTION_STRING=postgres://USER:PASSWORD@us-west-2.db.thenile.dev:5432/smp_cashbook
PORT=3001
```

**`package.json`** (add script):

```json
{
  "scripts": {
    "dev": "ts-node server.ts",
    "start": "node dist/server.js"
  }
}
```

#### Step 4: Update Frontend Database Service

Replace `src/services/database.ts` with API calls:

```typescript
import { CashEntry, EntryType, EntryFormData, AutocompleteOption } from '../types';
import { API_BASE_URL } from '../config';

export const db = {
  async getAllEntries(): Promise<CashEntry[]> {
    const response = await fetch(`${API_BASE_URL}/entries`);
    if (!response.ok) throw new Error('Failed to fetch entries');
    return response.json();
  },

  async getMostRecentDate(): Promise<string | null> {
    const response = await fetch(`${API_BASE_URL}/entries/recent-date`);
    if (!response.ok) return null;
    const data = await response.json();
    return data?.date || null;
  },

  async getHeadOfAccountsSuggestions(query: string): Promise<AutocompleteOption[]> {
    const response = await fetch(`${API_BASE_URL}/suggestions/head?query=${encodeURIComponent(query)}`);
    if (!response.ok) return [];
    return response.json();
  },

  async getChequeNoSuggestions(query: string): Promise<AutocompleteOption[]> {
    const response = await fetch(`${API_BASE_URL}/suggestions/cheque?query=${encodeURIComponent(query)}`);
    if (!response.ok) return [];
    return response.json();
  },

  async getNotesSuggestions(query: string): Promise<AutocompleteOption[]> {
    const response = await fetch(`${API_BASE_URL}/suggestions/notes?query=${encodeURIComponent(query)}`);
    if (!response.ok) return [];
    return response.json();
  },

  async createEntry(type: EntryType, formData: EntryFormData): Promise<CashEntry> {
    const response = await fetch(`${API_BASE_URL}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: formData.date,
        type,
        cheque_no: formData.cheque_no || null,
        amount: parseFloat(formData.amount),
        head_of_accounts: formData.head_of_accounts,
        notes: formData.notes || null,
      }),
    });
    if (!response.ok) throw new Error('Failed to create entry');
    return response.json();
  },

  async getEntryById(id: string): Promise<CashEntry | null> {
    const response = await fetch(`${API_BASE_URL}/entries/${id}`);
    if (!response.ok) return null;
    return response.json();
  },

  async updateEntry(id: string, formData: EntryFormData): Promise<CashEntry | null> {
    const response = await fetch(`${API_BASE_URL}/entries/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: formData.date,
        cheque_no: formData.cheque_no || null,
        amount: parseFloat(formData.amount),
        head_of_accounts: formData.head_of_accounts,
        notes: formData.notes || null,
      }),
    });
    if (!response.ok) return null;
    return response.json();
  },

  async deleteEntry(id: string): Promise<boolean> {
    const response = await fetch(`${API_BASE_URL}/entries/${id}`, {
      method: 'DELETE',
    });
    return response.ok;
  },

  async checkDuplicate(
    date: string,
    type: EntryType,
    amount: string,
    head: string
  ): Promise<boolean> {
    const response = await fetch(`${API_BASE_URL}/entries/check-duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        type,
        amount: parseFloat(amount),
        head_of_accounts: head,
      }),
    });
    if (!response.ok) return false;
    const data = await response.json();
    return data.isDuplicate;
  },
};
```

#### Step 5: Start Backend and Frontend

Terminal 1 (Backend):
```bash
cd smp-cashbook-backend
npm run dev
```

Terminal 2 (Frontend):
```bash
cd smp-cashbook
npm run dev
```

### Option 2: Deploy to Vercel with Serverless Functions

Vercel can host both the frontend and serverless functions that connect to Nile.

1. Create `api/entries.ts` in your project root
2. Use the same database logic as the backend server
3. Deploy to Vercel: `vercel deploy`

### Option 3: Deploy to Netlify with Functions

Similar to Vercel, create functions in the `netlify/functions` directory.

## Production Deployment Checklist

- [ ] Set up backend server or serverless functions
- [ ] Configure Nile connection string in environment variables
- [ ] Update `src/config.ts` with production API URL
- [ ] Replace `src/services/database.ts` with API version
- [ ] Build frontend: `npm run build`
- [ ] Deploy backend server (e.g., Railway, Render, Fly.io)
- [ ] Deploy frontend (e.g., Vercel, Netlify, GitHub Pages)
- [ ] Test all CRUD operations
- [ ] Set up SSL certificates
- [ ] Configure CORS properly
- [ ] Set up monitoring and logging

## Security Considerations

1. **Never expose Nile connection string in frontend code**
2. **Use environment variables for sensitive data**
3. **Implement authentication and authorization**
4. **Validate all inputs on backend**
5. **Use prepared statements to prevent SQL injection**
6. **Enable CORS only for trusted domains**
7. **Use HTTPS in production**
8. **Implement rate limiting**

## Monitoring

Consider adding:
- Error tracking (Sentry)
- Performance monitoring (New Relic)
- Database query logging
- API request logging

## Backup Strategy

Set up automated backups for the Nile database:
- Daily backups
- Point-in-time recovery
- Regular backup testing

## Need Help?

Refer to:
- [Nile Documentation](https://docs.thenile.dev/)
- [Express.js Guide](https://expressjs.com/)
- [PostgreSQL Node.js Guide](https://node-postgres.com/)

---

Good luck with your deployment!
