/**
 * Utility functions for CSV parsing and date conversion
 */

export interface FeeCSVRow {
  'Sl No': string;
  'Student Name': string;
  'Father Name': string;
  'Year': string;
  'Course': string;
  'Reg No': string;
  'Cat': string;
  'Adm Type': string;
  'Adm Cat': string;
  'Date': string;
  'Rpt': string;
  'Adm': string;
  'Tution': string;
  'Lib': string;
  'RR': string;
  'Sports': string;
  'Lab': string;
  'DVP': string;
  'Mag': string;
  'ID': string;
  'Ass': string;
  'SWF': string;
  'TWF': string;
  'NSS': string;
  'Fine': string;
  'Acdmc Year': string;
  'In/Out': string;
  'Remarks': string;
}

export interface ReceiptEntry {
  date: string;
  type: 'receipt';
  cheque_no: string;
  amount: number;
  head_of_accounts: string;
  notes: string;
  cb_type?: 'aided' | 'unaided';
}

// Fee head of accounts mapping - order matters for display
const FEE_HEADS = [
  'Adm',
  'Tution',
  'RR',
  'Ass',
  'Sports',
  'Mag',
  'ID',
  'Lib',
  'Lab',
  'DVP',
  'SWF',
  'TWF',
  'NSS',
  'Fine',
] as const;

const MONTH_MAP: { [key: string]: string } = {
  Jan: '01',
  Feb: '02',
  Mar: '03',
  Apr: '04',
  May: '05',
  Jun: '06',
  Jul: '07',
  Aug: '08',
  Sep: '09',
  Oct: '10',
  Nov: '11',
  Dec: '12',
};

/**
 * Convert date from 'dd-mmm-yy' format to 'dd/mm/yy' format
 * Example: '12-May-25' -> '12/05/25'
 */
export function convertDateFormat(dateStr: string): string {
  if (!dateStr || typeof dateStr !== 'string') return '';

  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;

  const day = parts[0].padStart(2, '0');
  const monthAbbr = parts[1];
  const year = parts[2].padStart(2, '0');

  const month = MONTH_MAP[monthAbbr];
  if (!month) return dateStr;

  return `${day}/${month}/${year}`;
}

/**
 * Parse CSV text and return array of row objects
 */
export function parseCSV(csvText: string): FeeCSVRow[] {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const rows: FeeCSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length) {
      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index].trim();
      });
      rows.push(row as FeeCSVRow);
    }
  }

  return rows;
}

/**
 * Parse a single CSV line handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

/**
 * Convert entire CSV to aggregated receipt entries
 * Groups by date and head of account, summing amounts and tracking receipt number range
 */
export function convertCSVToReceipts(csvText: string, cbType: 'aided' | 'unaided' = 'aided'): ReceiptEntry[] {
  const rows = parseCSV(csvText);

  // Group by date and head of account
  const aggregated: {
    [key: string]: {
      date: string;
      head_of_accounts: string;
      totalAmount: number;
      receiptNumbers: number[];
    };
  } = {};

  rows.forEach(row => {
    const date = convertDateFormat(row.Date);
    const receiptNo = row.Rpt;
    const receiptNum = parseInt(receiptNo);

    // Process each fee head
    FEE_HEADS.forEach(head => {
      const amountStr = row[head];
      const amount = parseFloat(amountStr);

      // Only process if amount is non-zero
      if (amount && amount > 0) {
        const key = `${date}|${head}`;

        if (!aggregated[key]) {
          aggregated[key] = {
            date,
            head_of_accounts: head,
            totalAmount: 0,
            receiptNumbers: [],
          };
        }

        aggregated[key].totalAmount += amount;
        if (!isNaN(receiptNum)) {
          aggregated[key].receiptNumbers.push(receiptNum);
        }
      }
    });
  });

  // Convert aggregated data to receipt entries
  const receipts: ReceiptEntry[] = [];

  Object.values(aggregated).forEach(item => {
    // Sort receipt numbers to get min and max
    const sortedReceipts = item.receiptNumbers.sort((a, b) => a - b);
    const fromRpt = sortedReceipts[0];
    const toRpt = sortedReceipts[sortedReceipts.length - 1];

    receipts.push({
      date: item.date,
      type: 'receipt',
      cheque_no: 'Cash',
      amount: item.totalAmount,
      head_of_accounts: `${item.head_of_accounts} Fee`,
      notes: `College Fee Collection, Rpt No From: ${fromRpt} To: ${toRpt}`,
      cb_type: cbType,
    });
  });

  return receipts;
}
