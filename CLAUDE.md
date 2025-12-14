# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SMP Cash Book is a full-stack cash management application with:
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS
- **Backend**: Express.js REST API
- **Database**: Nile PostgreSQL (cloud-hosted)
- **Deployment**: Netlify (frontend + serverless functions)

## Monorepo Structure

This is a monorepo with three main directories:
- `smp-cashbook/` - React frontend application
- `smp-cashbook-backend/` - Express.js API server (for local development)
- `netlify/functions/` - Netlify serverless functions (for production)

Each directory has its own `package.json` and dependencies. The root `package.json` only contains `pg` (PostgreSQL client) needed by Netlify Functions.

## Common Commands

### Local Development

**Start both frontend and backend** (Windows):
```bash
START_SMP_CASHBOOK.bat
```
This opens two terminals: backend (port 3001) and frontend (port 5173), then opens the browser.

**Stop all services** (Windows):
```bash
STOP_SMP_CASHBOOK.bat
```

**Manual start**:
```bash
# Terminal 1 - Backend
cd smp-cashbook-backend
node server.js

# Terminal 2 - Frontend
cd smp-cashbook
npm run dev
```

### Build & Deploy

**Build frontend**:
```bash
cd smp-cashbook
npm run build
```
Output: `smp-cashbook/dist/`

**Deploy to Netlify**:
```bash
netlify deploy --prod
```

The build command in `netlify.toml` automatically:
1. Installs root dependencies (`cd .. && npm install`)
2. Builds frontend (`cd smp-cashbook && npm run build`)

### Testing

No automated tests. Manual testing via UI with sample CSV files:
- `Example_Format For Fee Import.csv`
- `Example_Format For Salary Import.csv`

## Architecture

### Data Flow (Production on Netlify)

```
User → React App (Netlify)
  → /api/* request
    → Netlify Redirect
      → /.netlify/functions/api
        → Nile PostgreSQL
```

### Data Flow (Local Development)

```
User → React App (localhost:5173)
  → Vite Proxy (/api/*)
    → Express Backend (localhost:3001)
      → Nile PostgreSQL
```

### Key Files

**Frontend Entry**: `smp-cashbook/src/main.tsx` → `App.tsx`

**Backend Entry**: `smp-cashbook-backend/server.js`

**Serverless Function**: `netlify/functions/api.js` (converted from Express routes)

**Database Service**: `smp-cashbook/src/services/database.ts` (all API calls centralized here)

**Config**:
- `smp-cashbook/src/config.ts` - API URL configuration
- `smp-cashbook/vite.config.ts` - Vite proxy for local dev
- `netlify.toml` - Netlify deployment settings

## Database

**Provider**: Nile Database (PostgreSQL-compatible)
**Table**: `cash_entries` with columns: id, date, type, cheque_no, amount, head_of_accounts, notes, financial_year, created_at, updated_at

**Connection**:
- Local: Via `smp-cashbook-backend/.env` file (`NILE_CONNECTION_STRING`)
- Production: Via Netlify environment variable (`NILE_CONNECTION_STRING`)

**Migrations**: Auto-run on backend startup from `smp-cashbook-backend/migrations/add_financial_year.sql`

## Environment Variables

**Backend** (`smp-cashbook-backend/.env`):
```
NILE_CONNECTION_STRING=postgres://[USER]:[PASS]@us-west-2.db.thenile.dev:5432/smp_cashbook
PORT=3001
NODE_ENV=development
```

**Frontend** (`smp-cashbook/.env`) - optional for local dev:
```
VITE_API_BASE_URL=http://localhost:3001/api
```

**Netlify** (set in dashboard):
```
NILE_CONNECTION_STRING=postgres://...
```

## Important Patterns

### Dual Backend Setup

This project has **two backends**:

1. **Express Server** (`smp-cashbook-backend/server.js`):
   - Used for **local development only**
   - Full Express.js application with all routes
   - Runs on port 3001
   - Connects directly to Nile Database

2. **Netlify Function** (`netlify/functions/api.js`):
   - Used for **production on Netlify**
   - Serverless function (no Express, just handler)
   - Contains same business logic as Express routes
   - Triggered via `/api/*` redirects in `netlify.toml`

**Why two backends?** Netlify is a static hosting platform and can't run Express servers directly. The Netlify Function is a serverless conversion of the Express API.

### API Base URL Resolution

The frontend automatically uses the correct API:
```typescript
// smp-cashbook/src/services/database.ts
const API_BASE_URL = '/api';  // Relative path
```

- **Local**: Vite proxy forwards `/api/*` to `http://localhost:3001`
- **Production**: Netlify redirects `/api/*` to `/.netlify/functions/api`

### Financial Year Calculation

Financial Year follows Indian FY (April 1 - March 31):
```javascript
// If month is Jan-Mar (1-3): FY is (year-1)-year
// If month is Apr-Dec (4-12): FY is year-(year+1)
// Format: YY-YY (e.g., "25-26")
```

Implemented in:
- Backend: `smp-cashbook-backend/server.js` (calculateFinancialYear function)
- Serverless: `netlify/functions/api.js` (same function)
- Frontend: `smp-cashbook/src/utils/financialYear.ts`

### Date Format

Always use **dd/mm/yy** format (e.g., "25/12/24"). Validation and formatting in `smp-cashbook/src/utils/helpers.ts`.

## Deployment Architecture

**Netlify Configuration** (`netlify.toml`):
- `base`: `smp-cashbook` (build runs from this directory)
- `functions`: `../netlify/functions` (relative to base, so actually `/netlify/functions`)
- Build command installs root deps first, then builds frontend
- Redirects `/api/*` to serverless functions
- SPA fallback: all routes → `/index.html`

**Critical**: The `pg` package must be in:
1. Root `package.json` (for Netlify Functions to find it)
2. `smp-cashbook/package.json` (listed as dependency, not devDependency)

## Common Issues & Solutions

**404 on API calls (Netlify)**: Check that:
- Functions deployed correctly (check Netlify Functions tab)
- `NILE_CONNECTION_STRING` set in Netlify environment variables
- `pg` is in `dependencies` (not `devDependencies`) in `smp-cashbook/package.json`

**Local: "Cannot find module 'pg'"**: Run `npm install` in both `smp-cashbook/` and `smp-cashbook-backend/`

**Build fails on Netlify**: Check build logs. Common causes:
- TypeScript errors in frontend code
- Missing dependencies in package.json
- Root `npm install` failing (wrong directory structure)

**Database connection fails**: Verify:
- Connection string format is correct
- SSL is enabled (`rejectUnauthorized: false`)
- Nile database is active (check Nile dashboard)

## Development Notes

### Adding New API Endpoints

1. **Add to Express backend** (`smp-cashbook-backend/server.js`):
   ```javascript
   app.get('/api/new-endpoint', async (req, res) => {
     // Implementation
   });
   ```

2. **Add to Netlify Function** (`netlify/functions/api.js`):
   ```javascript
   if (method === 'GET' && route === 'new-endpoint') {
     // Same implementation
     return sendResponse(200, data);
   }
   ```

3. **Add to frontend service** (`smp-cashbook/src/services/database.ts`):
   ```typescript
   export const db = {
     async newEndpoint() {
       const response = await fetch(`${API_BASE_URL}/new-endpoint`);
       return handleResponse(response);
     }
   };
   ```

### Key Dependencies

**Frontend** (`smp-cashbook/package.json`):
- `react`, `react-dom` (19.2.0) - UI framework
- `vite` (7.2.4) - Build tool
- `tailwindcss` (3.4.19) - Styling
- `typescript` (5.9.3) - Type safety
- `jspdf`, `jspdf-autotable` - PDF generation
- `pg` (8.16.3) - Required for Netlify Functions

**Backend** (`smp-cashbook-backend/package.json`):
- `express` (4.18.2) - HTTP server
- `pg` (8.11.3) - PostgreSQL client
- `cors` (2.8.5) - CORS middleware
- `dotenv` (16.3.1) - Environment variables

**Root** (`package.json`):
- `pg` (8.11.3) - Required for Netlify Functions bundling

### Frontend Component Structure

Pages in `smp-cashbook/src/pages/`:
- `EntryPage.tsx` - Create new receipts/payments
- `TransactionsPage.tsx` - View/edit all entries
- `LedgersPage.tsx` - Separate receipt/payment ledgers
- `ReportsPage.tsx` - Financial reports & analytics
- `SettingsPage.tsx` - App configuration
- `FeeImportPage.tsx` - Bulk CSV import (fees)
- `SalaryImportPage.tsx` - Bulk CSV import (salaries)

All pages use the centralized `services/database.ts` for data operations.

### State Management

No global state management library (Redux, Zustand, etc.). State managed via:
- React `useState` for local component state
- Props passing for parent-child communication
- Callback functions for child-to-parent updates

Main app state in `App.tsx`:
- `currentPage` - Current view
- `selectedFY` - Active financial year filter

## Documentation Files

- `QUICK_START_GUIDE.txt` - User manual
- `PROJECT_COMPLETE.txt` - Feature specifications
- `DEPLOYMENT_INSTRUCTIONS.md` - Cloud deployment guide
- `smp-cashbook/README.md` - Frontend documentation
- `smp-cashbook/DEPLOYMENT_GUIDE.md` - Detailed deployment steps
