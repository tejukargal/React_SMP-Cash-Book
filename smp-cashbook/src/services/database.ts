import type { CashEntry, EntryType, EntryFormData, AutocompleteOption } from '../types';

// API Base URL - Netlify Functions (works both locally and in production)
const API_BASE_URL = '/api';

// Helper function to handle fetch errors
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }
  return response.json();
}

// Database Service - Connected to Nile via Backend API
export const db = {
  // Get all entries sorted by date (newest first), optionally filtered by FY and CB Type
  async getAllEntries(financialYear?: string, cbType?: 'aided' | 'unaided' | 'both'): Promise<CashEntry[]> {
    try {
      const params = new URLSearchParams();
      if (financialYear) params.append('fy', financialYear);
      if (cbType && cbType !== 'both') params.append('cb_type', cbType);

      const url = params.toString()
        ? `${API_BASE_URL}/entries?${params.toString()}`
        : `${API_BASE_URL}/entries`;

      const response = await fetch(url);
      const entries = await handleResponse<CashEntry[]>(response);
      return entries;
    } catch (error) {
      console.error('Failed to fetch entries:', error);
      throw error;
    }
  },

  // Get most recent entry date
  async getMostRecentDate(): Promise<string | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/entries/recent-date`);
      const data = await handleResponse<{ date: string | null }>(response);
      return data.date;
    } catch (error) {
      console.error('Failed to fetch recent date:', error);
      return null;
    }
  },

  // Get autocomplete suggestions for head of accounts
  async getHeadOfAccountsSuggestions(query: string): Promise<AutocompleteOption[]> {
    if (!query || query.length < 2) return [];

    try {
      const response = await fetch(
        `${API_BASE_URL}/suggestions/head?query=${encodeURIComponent(query)}`
      );
      const suggestions = await handleResponse<AutocompleteOption[]>(response);
      return suggestions;
    } catch (error) {
      console.error('Failed to fetch head suggestions:', error);
      return [];
    }
  },

  // Get autocomplete suggestions for cheque numbers
  async getChequeNoSuggestions(query: string): Promise<AutocompleteOption[]> {
    if (!query || query.length < 1) return [];

    try {
      const response = await fetch(
        `${API_BASE_URL}/suggestions/cheque?query=${encodeURIComponent(query)}`
      );
      const suggestions = await handleResponse<AutocompleteOption[]>(response);
      return suggestions;
    } catch (error) {
      console.error('Failed to fetch cheque suggestions:', error);
      return [];
    }
  },

  // Get autocomplete suggestions for notes
  async getNotesSuggestions(query: string): Promise<AutocompleteOption[]> {
    if (!query || query.length < 2) return [];

    try {
      const response = await fetch(
        `${API_BASE_URL}/suggestions/notes?query=${encodeURIComponent(query)}`
      );
      const suggestions = await handleResponse<AutocompleteOption[]>(response);
      return suggestions;
    } catch (error) {
      console.error('Failed to fetch notes suggestions:', error);
      return [];
    }
  },

  // Create new entry
  async createEntry(type: EntryType, formData: EntryFormData): Promise<CashEntry> {
    try {
      // Ensure cb_type is valid (only 'aided' or 'unaided')
      const validCBType = formData.cb_type === 'unaided' ? 'unaided' : 'aided';

      const payload = {
        date: formData.date,
        type,
        cheque_no: formData.cheque_no || null,
        amount: parseFloat(formData.amount),
        head_of_accounts: formData.head_of_accounts,
        notes: formData.notes || null,
        cb_type: validCBType,
      };

      console.log('🔍 Database Service - Creating entry with payload:', payload);
      console.log('🔍 Database Service - Original formData.cb_type:', formData.cb_type);
      console.log('🔍 Database Service - Validated cb_type:', validCBType);

      const response = await fetch(`${API_BASE_URL}/entries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const entry = await handleResponse<CashEntry>(response);
      console.log('🔍 Database Service - Entry created:', entry);
      return entry;
    } catch (error) {
      console.error('Failed to create entry:', error);
      throw error;
    }
  },

  // Get entry by ID
  async getEntryById(id: string): Promise<CashEntry | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/entries/${id}`);
      if (response.status === 404) return null;
      const entry = await handleResponse<CashEntry>(response);
      return entry;
    } catch (error) {
      console.error('Failed to fetch entry:', error);
      return null;
    }
  },

  // Update entry
  async updateEntry(id: string, formData: EntryFormData): Promise<CashEntry | null> {
    try {
      // Ensure cb_type is valid (only 'aided' or 'unaided')
      const validCBType = formData.cb_type === 'unaided' ? 'unaided' : 'aided';

      const response = await fetch(`${API_BASE_URL}/entries/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: formData.date,
          cheque_no: formData.cheque_no || null,
          amount: parseFloat(formData.amount),
          head_of_accounts: formData.head_of_accounts,
          notes: formData.notes || null,
          cb_type: validCBType,
        }),
      });

      if (response.status === 404) return null;
      const entry = await handleResponse<CashEntry>(response);
      return entry;
    } catch (error) {
      console.error('Failed to update entry:', error);
      throw error;
    }
  },

  // Delete entry
  async deleteEntry(id: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/entries/${id}`, {
        method: 'DELETE',
      });

      if (response.status === 404) return false;
      await handleResponse<{ success: boolean }>(response);
      return true;
    } catch (error) {
      console.error('Failed to delete entry:', error);
      return false;
    }
  },

  // Check for duplicate entries (all fields must match)
  async checkDuplicate(
    date: string,
    type: EntryType,
    amount: string,
    head: string,
    cheque_no: string,
    notes: string
  ): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/entries/check-duplicate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date,
          type,
          amount: parseFloat(amount),
          head_of_accounts: head,
          cheque_no: cheque_no || null,
          notes: notes || null,
        }),
      });

      const data = await handleResponse<{ isDuplicate: boolean }>(response);
      return data.isDuplicate;
    } catch (error) {
      console.error('Failed to check duplicate:', error);
      return false;
    }
  },

  // Bulk import entries
  async bulkImport(entries: Array<{
    date: string;
    type: EntryType;
    cheque_no: string;
    amount: number;
    head_of_accounts: string;
    notes: string;
    cb_type?: 'aided' | 'unaided';
  }>): Promise<{
    success: boolean;
    imported: number;
    failed: number;
    errors: Array<{ index: number; entry: any; error: string }>;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/entries/bulk-import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ entries }),
      });

      const data = await handleResponse<{
        success: boolean;
        imported: number;
        failed: number;
        errors: Array<{ index: number; entry: any; error: string }>;
      }>(response);
      return data;
    } catch (error) {
      console.error('Failed to bulk import:', error);
      throw error;
    }
  },

  // Delete all entries (optionally filtered by CB Type)
  async deleteAllEntries(cbType?: 'aided' | 'unaided' | 'both'): Promise<{ success: boolean; deleted: number }> {
    try {
      const params = new URLSearchParams();
      if (cbType && cbType !== 'both') {
        params.append('cb_type', cbType);
      }

      const url = params.toString()
        ? `${API_BASE_URL}/entries/delete-all?${params.toString()}`
        : `${API_BASE_URL}/entries/delete-all`;

      console.log('🔍 Database Service - Deleting entries with cb_type filter:', cbType || 'all');

      const response = await fetch(url, {
        method: 'DELETE',
      });

      const data = await handleResponse<{ success: boolean; deleted: number }>(response);
      console.log('🔍 Database Service - Deleted entries count:', data.deleted);
      return data;
    } catch (error) {
      console.error('Failed to delete all entries:', error);
      throw error;
    }
  },
};
