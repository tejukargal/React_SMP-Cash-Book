// Nile Database Configuration
// Store the connection string securely in environment variables
export const NILE_CONNECTION_STRING = import.meta.env.VITE_NILE_CONNECTION_STRING ||
  'postgres://019b1350-f28f-76f2-ab19-fe14bb494979:63597054-be0b-4454-bcf0-f5d7d575fee1@us-west-2.db.thenile.dev:5432/smp_cashbook';

export const DATABASE_NAME = 'smp_cashbook';

// API endpoint for backend service (if using a separate backend)
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
