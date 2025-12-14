export type EntryType = 'receipt' | 'payment';

export interface CashEntry {
  id: string;
  date: string; // dd/mm/yy format
  type: EntryType;
  cheque_no?: string;
  amount: number;
  head_of_accounts: string;
  notes?: string;
  financial_year?: string; // YY-YY format (e.g., "25-26")
  created_at: string;
  updated_at: string;
}

export interface EntryFormData {
  date: string;
  cheque_no: string;
  amount: string;
  head_of_accounts: string;
  notes: string;
}

export type AppStep = 'select-type' | 'fill-form';

export type AppPage = 'entry' | 'transactions' | 'ledgers' | 'reports' | 'settings' | 'import' | 'salary-import';

export interface AutocompleteOption {
  value: string;
  count: number;
}
