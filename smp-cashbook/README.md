# SMP Cash Book - Receipt & Payment Entry System

A desktop-first cash book management web application for Sanjay Memorial Polytechnic, Sagar.

Built with **Vite + React + TypeScript + Tailwind CSS** and **Nile Database**.

## Features

### Core Functionality

**Three-Step Entry Process:**
1. **Type Selection**: Click Receipt (green) or Payment (red) button
2. **Fill Form**: Enter transaction details with smart features
3. **Save & Reset**: Save entry and return to type selection

**Smart Input Features:**
- Auto-capitalize text (proper case for heads of accounts and notes)
- Autocomplete suggestions based on previous entries
- Date auto-fills from last entry
- Duplicate entry detection (warns if similar entry within 5 seconds)
- Real-time form validation

**Full CRUD Operations:**
- Create new receipts and payments
- Read all entries in chronological order
- Update existing entries (click row to edit)
- Delete entries with confirmation

**Financial Tracking:**
- Running balance calculation
- Color-coded entries (green for receipts, red for payments)
- Summary footer with totals and net balance
- Sortable table with fixed headers

## Database Schema

**Nile Database**: `smp_cashbook`

**Table**: `cash_entries`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | Primary Key, Auto-generated |
| date | TEXT | NOT NULL (format: dd/mm/yy) |
| type | TEXT | NOT NULL (values: 'receipt' or 'payment') |
| cheque_no | TEXT | Nullable |
| amount | DECIMAL(15,2) | NOT NULL, Positive |
| head_of_accounts | TEXT | NOT NULL |
| notes | TEXT | Nullable |
| created_at | TIMESTAMP | Auto-generated |
| updated_at | TIMESTAMP | Auto-updated |

**Indexes:**
- `idx_cash_entries_date` - For sorting by date
- `idx_cash_entries_head_of_accounts` - For autocomplete queries
- `idx_cash_entries_created_at` - For recent entry queries

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Nile Database account (optional for production)

### Installation

1. Navigate to the project directory:
   ```bash
   cd smp-cashbook
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser to `http://localhost:5173`

### Build for Production

```bash
npm run build
```

The production files will be in the `dist` folder.

## Current Implementation

The application currently uses **localStorage** for data persistence, which makes it:
- Work immediately without backend setup
- Perfect for testing and development
- Data stored in browser (not shared across devices)

All database operations are abstracted in `src/services/database.ts`, making it easy to swap to a real database later.

## Connecting to Nile Database

The Nile database (`smp_cashbook`) has been created with the proper schema. To connect the application to Nile:

### Option 1: Create a Backend API (Recommended)

1. Create a Node.js/Express backend server
2. Install PostgreSQL client:
   ```bash
   npm install pg
   ```

3. Use the Nile connection string:
   ```
   postgres://[USER]:[PASSWORD]@us-west-2.db.thenile.dev:5432/smp_cashbook
   ```

4. Create API endpoints for CRUD operations
5. Update `src/services/database.ts` to call your API endpoints

### Option 2: Use Serverless Functions

Deploy serverless functions (Vercel, Netlify, AWS Lambda) that connect to Nile and expose API endpoints.

### Database Connection Details

- **Database Name**: smp_cashbook
- **Region**: AWS_US_WEST_2
- **Connection**: See `src/config.ts` for connection string

## File Structure

```
smp-cashbook/
├── src/
│   ├── components/
│   │   ├── TypeSelection.tsx      # Receipt/Payment buttons
│   │   ├── EntryForm.tsx          # Form with validation & autocomplete
│   │   └── EntriesTable.tsx       # Table with CRUD operations
│   ├── services/
│   │   └── database.ts            # Database operations (currently localStorage)
│   ├── utils/
│   │   └── helpers.ts             # Utility functions
│   ├── types.ts                   # TypeScript interfaces
│   ├── config.ts                  # Database configuration
│   ├── App.tsx                    # Main application component
│   ├── main.tsx                   # Entry point
│   └── index.css                  # Global styles
├── public/                        # Static assets
├── index.html                     # HTML template
├── tailwind.config.js             # Tailwind configuration
├── tsconfig.json                  # TypeScript configuration
├── vite.config.ts                 # Vite configuration
└── package.json                   # Dependencies
```

## Usage Guide

### Adding a Receipt

1. Click the green **Receipt** button
2. Fill in the form:
   - Date (auto-filled from last entry)
   - Cheque No (optional)
   - Amount (required)
   - Head of Accounts (required, autocomplete available)
   - Notes (optional)
3. Click **Save Receipt**

### Adding a Payment

1. Click the red **Payment** button
2. Fill in the form (same fields as receipt)
3. Click **Save Payment**

### Editing an Entry

1. Click **Edit** on any row in the table
2. Modify the fields
3. Click **Save** button

### Deleting an Entry

1. Click **Delete** on any row
2. Confirm the deletion

### Keyboard Navigation

- **Tab**: Move between form fields
- **Arrow Keys**: Navigate autocomplete suggestions
- **Enter**: Select autocomplete suggestion
- **Escape**: Close autocomplete dropdown

## Validation Rules

- **Date**: Must be in dd/mm/yy format (DD: 01-31, MM: 01-12, YY: 00-99)
- **Amount**: Required, positive number with up to 2 decimal places
- **Head of Accounts**: Required, minimum 2 characters
- **Cheque No**: Optional, converted to uppercase
- **Notes**: Optional, converted to proper case

## Data Features

- **Proper Case**: All text fields automatically capitalize first letter of each word
- **Autocomplete**: Shows top 5 matching suggestions based on usage frequency
- **Duplicate Detection**: Warns if same date + type + amount + head within 5 seconds
- **Running Balance**: Calculated as you go (receipts add, payments subtract)
- **Date Retention**: Last entry date is remembered for next entry

## UI/UX Highlights

- **Desktop-first**: Optimized for desktop use
- **Color Coding**: Green for receipts, red for payments
- **Responsive**: Works on tablets and mobile devices
- **Smooth Transitions**: Animated form appearance and success messages
- **Fixed Headers**: Table header stays visible while scrolling
- **Sticky Footer**: Summary totals always visible at bottom
- **Compact Rows**: 36px height for efficient data viewing

## Technical Stack

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite 7
- **Styling**: Tailwind CSS 3
- **State Management**: React hooks (useState, useEffect)
- **Database**: Nile Database (PostgreSQL) - schema created
- **Current Storage**: localStorage (development)

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

### Code Organization

- **Components**: Reusable UI components
- **Services**: Business logic and data operations
- **Utils**: Helper functions
- **Types**: TypeScript type definitions

## Future Enhancements

- Export to Excel/PDF
- Date range filtering
- Search functionality
- Multi-user support with authentication
- Backup and restore
- Print receipts
- Dashboard with charts
- Mobile app version

## Institution Information

**Sanjay Memorial Polytechnic, Sagar**

This cash book system is designed specifically for managing receipts and payments for the institution.

## Support

For issues or questions, please contact the development team.

## License

Proprietary - Sanjay Memorial Polytechnic, Sagar

---

Built with care for efficient cash book management
