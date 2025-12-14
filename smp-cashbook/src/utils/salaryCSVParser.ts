import type { CashEntry } from '../types';

interface MonthlyAggregate {
  date: string;
  month: string;
  year: string;
  totalGrossSalary: number;
  totalITDeduction: number;
  totalPTDeduction: number;
  totalGSLICDeduction: number;
  totalLICDeduction: number;
  totalFBFDeduction: number;
  totalDeductions: number;
  employeeCount: number;
}

export interface MonthlySummary {
  month: string;
  year: string;
  date: string;
  employeeCount: number;
  totalGrossSalary: number;
  totalITDeduction: number;
  totalPTDeduction: number;
  totalGSLICDeduction: number;
  totalLICDeduction: number;
  totalFBFDeduction: number;
  totalDeductions: number;
}

export interface SalaryParseResult {
  entries: CashEntry[];
  summary: MonthlySummary[];
}

export function parseSalaryCSVWithSummary(csvText: string): SalaryParseResult {
  // Split CSV into lines while respecting quoted fields that may contain newlines
  const lines = splitCSVIntoLines(csvText.trim());

  if (lines.length < 2) {
    return { entries: [], summary: [] };
  }

  // Parse header
  const headers = lines[0].split(',').map(h => h.trim().replace(/^\uFEFF/, ''));

  // Helper function to parse numbers with commas
  const parseNumber = (value: string): number => {
    if (!value || value.trim() === '') return 0;
    // Remove commas and any whitespace, then parse
    const cleaned = value.replace(/,/g, '').trim();
    return parseFloat(cleaned) || 0;
  };

  // Group data by date/month
  const monthlyData = new Map<string, MonthlyAggregate>();

  // Parse each row - DO NOT SKIP ANY ROWS
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Only skip completely empty lines

    const values = parseCSVLine(line);
    const row: any = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    // Skip only if Date is missing (invalid row)
    if (!row.Date || !row.Month || !row.Year) continue;

    // Create a unique key for each month (only Month-Year, not Date)
    const monthKey = `${row.Month}-${row.Year}`;

    if (!monthlyData.has(monthKey)) {
      monthlyData.set(monthKey, {
        date: row.Date, // Store the first date encountered for this month
        month: row.Month,
        year: row.Year,
        totalGrossSalary: 0,
        totalITDeduction: 0,
        totalPTDeduction: 0,
        totalGSLICDeduction: 0,
        totalLICDeduction: 0,
        totalFBFDeduction: 0,
        totalDeductions: 0,
        employeeCount: 0,
      });
    }

    const aggregate = monthlyData.get(monthKey)!;

    // Add all values, even if they are zero
    const grossSalary = parseNumber(row.Gross_Salary || '0');
    const itDeduction = parseNumber(row.IT_Deduction || '0');
    const ptDeduction = parseNumber(row.PT_Deduction || '0');
    const gslicDeduction = parseNumber(row.GSLIC_Deduction || '0');
    const licDeduction = parseNumber(row.LIC_Deduction || '0');
    const fbfDeduction = parseNumber(row.FBF_Deduction || '0');
    const totalDeductions = parseNumber(row.Total_Deductions || '0');

    aggregate.totalGrossSalary += grossSalary;
    aggregate.totalITDeduction += itDeduction;
    aggregate.totalPTDeduction += ptDeduction;
    aggregate.totalGSLICDeduction += gslicDeduction;
    aggregate.totalLICDeduction += licDeduction;
    aggregate.totalFBFDeduction += fbfDeduction;
    aggregate.totalDeductions += totalDeductions;
    aggregate.employeeCount += 1; // Count each employee/row
  }

  // Create summary array
  const summary: MonthlySummary[] = [];

  // Convert aggregated data to CashEntry format
  const entries: CashEntry[] = [];

  monthlyData.forEach((aggregate) => {
    // Add to summary
    summary.push({
      month: aggregate.month,
      year: aggregate.year,
      date: aggregate.date,
      employeeCount: aggregate.employeeCount,
      totalGrossSalary: aggregate.totalGrossSalary,
      totalITDeduction: aggregate.totalITDeduction,
      totalPTDeduction: aggregate.totalPTDeduction,
      totalGSLICDeduction: aggregate.totalGSLICDeduction,
      totalLICDeduction: aggregate.totalLICDeduction,
      totalFBFDeduction: aggregate.totalFBFDeduction,
      totalDeductions: aggregate.totalDeductions,
    });
    const formattedDate = formatDate(aggregate.date);
    const month = aggregate.month;
    const year = aggregate.year;

    // Create Receipt entries
    // IMPORTANT: Grants MUST come first, then deductions

    // 1. Govt Salary Grants (FIRST)
    if (aggregate.totalGrossSalary > 0) {
      entries.push(createEntry(
        formattedDate,
        'receipt',
        aggregate.totalGrossSalary,
        'Govt Salary Grants',
        `Received Staff Salary Grants For The Month Of ${month} ${year}`,
        'Grant'
      ));
    }

    // Then all deductions in order
    // 2. I Tax
    if (aggregate.totalITDeduction > 0) {
      entries.push(createEntry(
        formattedDate,
        'receipt',
        aggregate.totalITDeduction,
        'I Tax',
        `Staff I Tax Deduction For The Month Of ${month} ${year}`,
        'Deduction'
      ));
    }

    // 3. P Tax
    if (aggregate.totalPTDeduction > 0) {
      entries.push(createEntry(
        formattedDate,
        'receipt',
        aggregate.totalPTDeduction,
        'P Tax',
        `Staff P Tax Deduction For The Month Of ${month} ${year}`,
        'Deduction'
      ));
    }

    // 4. Lic
    if (aggregate.totalLICDeduction > 0) {
      entries.push(createEntry(
        formattedDate,
        'receipt',
        aggregate.totalLICDeduction,
        'Lic',
        `Staff Lic Deduction For The Month Of ${month} ${year}`,
        'Deduction'
      ));
    }

    // 5. Gslic
    if (aggregate.totalGSLICDeduction > 0) {
      entries.push(createEntry(
        formattedDate,
        'receipt',
        aggregate.totalGSLICDeduction,
        'Gslic',
        `Staff Gslic Deduction For The Month Of ${month} ${year}`,
        'Deduction'
      ));
    }

    // 6. Fbf
    if (aggregate.totalFBFDeduction > 0) {
      entries.push(createEntry(
        formattedDate,
        'receipt',
        aggregate.totalFBFDeduction,
        'Fbf',
        `Staff Fbf Deduction For The Month Of ${month} ${year}`,
        'Deduction'
      ));
    }

    // Create Payment entries
    // IMPORTANT: Salary Account MUST come first, then Receivable

    // 1. Govt Salary Account (FIRST)
    if (aggregate.totalGrossSalary > 0) {
      entries.push(createEntry(
        formattedDate,
        'payment',
        aggregate.totalGrossSalary,
        'Govt Salary Account',
        `Disbursed Staff Salary For The Month Of ${month} ${year}`,
        'Salary'
      ));
    }

    // 2. Receivable Account (SECOND)
    if (aggregate.totalDeductions > 0) {
      entries.push(createEntry(
        formattedDate,
        'payment',
        aggregate.totalDeductions,
        'Receivable Account',
        `Staff Salary Deductions Receivable For The Month Of ${month} ${year}`,
        'Deduction'
      ));
    }
  });

  return { entries, summary };
}

// Backward compatibility wrapper
export function convertSalaryCSVToEntries(csvText: string): CashEntry[] {
  const result = parseSalaryCSVWithSummary(csvText);
  return result.entries;
}

function createEntry(
  date: string,
  type: 'receipt' | 'payment',
  amount: number,
  headOfAccounts: string,
  notes: string,
  chequeNo: string
): CashEntry {
  const now = new Date().toISOString();
  return {
    id: `temp-${Date.now()}-${Math.random()}`,
    date,
    type,
    cheque_no: chequeNo,
    amount,
    head_of_accounts: headOfAccounts,
    notes,
    created_at: now,
    updated_at: now,
  };
}

function formatDate(dateStr: string): string {
  // Input format: dd-mm-yy (e.g., "12-09-25")
  // Output format: dd/mm/yy (e.g., "12/09/25")
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[0]}/${parts[1]}/${parts[2]}`;
  }
  return dateStr;
}

function splitCSVIntoLines(csvText: string): string[] {
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        currentLine += '""';
        i++;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
        currentLine += char;
      }
    } else if (char === '\n' && !inQuotes) {
      // End of line (not inside quotes)
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
    } else if (char === '\r' && nextChar === '\n' && !inQuotes) {
      // Windows line ending (not inside quotes)
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
      i++; // Skip the \n
    } else if (char === '\r' && !inQuotes) {
      // Mac line ending (not inside quotes)
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
    } else {
      currentLine += char;
    }
  }

  // Add the last line if it exists
  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  return lines;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}
