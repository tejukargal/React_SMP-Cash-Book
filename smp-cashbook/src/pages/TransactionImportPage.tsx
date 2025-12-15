import React, { useState, useRef } from 'react';
import { db } from '../services/database';
import type { CBType } from '../types';

interface ImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors: Array<{ index: number; entry: any; error: string }>;
}

interface TransactionImportPageProps {
  selectedFY: string;
  selectedCBType: CBType;
}

interface ParsedEntry {
  date: string;
  type: 'receipt' | 'payment';
  cheque_no: string;
  amount: number;
  head_of_accounts: string;
  notes: string;
  financial_year: string;
  cb_type: 'aided' | 'unaided';
}

const TransactionImportPage: React.FC<TransactionImportPageProps> = ({ selectedFY, selectedCBType }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [preview, setPreview] = useState<ParsedEntry[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get the actual cb_type for entries ('both' defaults to 'aided')
  const getActualCBType = (): 'aided' | 'unaided' => {
    return selectedCBType === 'unaided' ? 'unaided' : 'aided';
  };

  // Parse date from "dd-MMM-yy" format to "dd/mm/yy" format
  const parseDate = (dateStr: string): string | null => {
    if (!dateStr || dateStr.trim() === '') return null;

    try {
      const monthMap: { [key: string]: string } = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
        'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
        'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
      };

      // Handle "dd-MMM-yy" format (e.g., "01-Apr-24")
      const parts = dateStr.trim().split('-');
      if (parts.length === 3) {
        const day = parts[0].padStart(2, '0');
        const monthAbbr = parts[1].toLowerCase();
        const year = parts[2];

        const month = monthMap[monthAbbr];
        if (month) {
          return `${day}/${month}/${year}`;
        }
      }

      return null;
    } catch (error) {
      console.error('Error parsing date:', dateStr, error);
      return null;
    }
  };

  // Parse CSV file in CB Report 1 format
  const parseCSV = (csvText: string): ParsedEntry[] => {
    const entries: ParsedEntry[] = [];
    const lines = csvText.split('\n');

    // Skip header row
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Parse CSV line (handling quoted values)
      const values: string[] = [];
      let currentValue = '';
      let insideQuotes = false;

      for (let j = 0; j < line.length; j++) {
        const char = line[j];

        if (char === '"') {
          insideQuotes = !insideQuotes;
        } else if (char === ',' && !insideQuotes) {
          values.push(currentValue.trim());
          currentValue = '';
        } else {
          currentValue += char;
        }
      }
      values.push(currentValue.trim()); // Push last value

      // Expected columns: Sl No, R.Date, R.Chq, R.Amount, R.Heads, R.Notes, P.Date, P.Chq, P.Amount, P.Heads, P.Notes
      if (values.length < 11) {
        console.warn(`Skipping line ${i + 1}: insufficient columns`);
        continue;
      }

      const [, rDate, rChq, rAmount, rHeads, rNotes, pDate, pChq, pAmount, pHeads, pNotes] = values;

      // Process receipt entry
      if (rDate && rAmount && parseFloat(rAmount) > 0) {
        const parsedDate = parseDate(rDate);
        if (parsedDate) {
          entries.push({
            date: parsedDate,
            type: 'receipt',
            cheque_no: rChq || '',
            amount: parseFloat(rAmount),
            head_of_accounts: rHeads || '',
            notes: rNotes || '',
            financial_year: selectedFY,
            cb_type: getActualCBType()
          });
        }
      }

      // Process payment entry
      if (pDate && pAmount && parseFloat(pAmount) > 0) {
        const parsedDate = parseDate(pDate);
        if (parsedDate) {
          entries.push({
            date: parsedDate,
            type: 'payment',
            cheque_no: pChq || '',
            amount: parseFloat(pAmount),
            head_of_accounts: pHeads || '',
            notes: pNotes || '',
            financial_year: selectedFY,
            cb_type: getActualCBType()
          });
        }
      }
    }

    return entries;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      alert('Please select a CSV file');
      return;
    }

    setFile(selectedFile);
    setImportResult(null);
    setShowPreview(false);

    // Read and preview the file
    const text = await selectedFile.text();
    const entries = parseCSV(text);
    setPreview(entries.slice(0, 20)); // Show first 20 entries
  };

  const handlePreview = () => {
    setShowPreview(!showPreview);
  };

  const handleImport = async () => {
    if (!file) {
      alert('Please select a file first');
      return;
    }

    setIsProcessing(true);
    setImportResult(null);

    try {
      const text = await file.text();
      const entries = parseCSV(text);

      if (entries.length === 0) {
        alert('No valid entries found in the CSV file');
        setIsProcessing(false);
        return;
      }

      // Fetch existing entries to check for duplicates
      const existingEntries = await db.getAllEntries();

      // Separate duplicates and new entries
      const duplicates: ParsedEntry[] = [];
      const newEntries = entries.filter(entry => {
        // Check if an entry with same date, type, head of accounts, notes, and amount already exists
        const isDuplicate = existingEntries.some(existing => {
          return (
            existing.date === entry.date &&
            existing.type === entry.type &&
            existing.head_of_accounts === entry.head_of_accounts &&
            existing.notes === entry.notes &&
            Math.abs(existing.amount - entry.amount) < 0.01 // Compare amounts with small tolerance
          );
        });

        if (isDuplicate) {
          duplicates.push(entry);
          return false;
        }
        return true;
      });

      const duplicateCount = duplicates.length;

      // If all entries are duplicates
      if (newEntries.length === 0 && duplicateCount > 0) {
        const importDuplicates = window.confirm(
          `All ${entries.length} entries already exist in the database.\n\nDo you want to import them anyway (duplicates will be created)?`
        );

        if (!importDuplicates) {
          alert('Import cancelled. No entries were imported.');
          setIsProcessing(false);
          return;
        }

        // User wants to import duplicates
        const result = await db.bulkImport(entries);
        setImportResult(result);

        if (result.imported > 0) {
          alert(
            `Import completed!\nSuccessfully imported: ${result.imported} (including duplicates)\nFailed: ${result.failed}`
          );
        }
      }
      // If some entries are duplicates
      else if (duplicateCount > 0) {
        const choice = window.confirm(
          `Found ${entries.length} entries in CSV:\n• ${newEntries.length} new entries\n• ${duplicateCount} duplicates\n\nClick OK to skip duplicates and import only new entries.\nClick Cancel to import ALL entries (including duplicates).`
        );

        const entriesToImport = choice ? newEntries : entries;
        const result = await db.bulkImport(entriesToImport);
        setImportResult(result);

        if (result.imported > 0) {
          alert(
            `Import completed!\nSuccessfully imported: ${result.imported}\n${choice ? `Skipped duplicates: ${duplicateCount}` : 'Including duplicates'}\nFailed: ${result.failed}`
          );
        }
      }
      // No duplicates, import all
      else {
        const confirmed = window.confirm(
          `Found ${entries.length} entries to import to Financial Year ${selectedFY} (${getActualCBType().toUpperCase()}).\n\nBreakdown:\n• Receipts: ${entries.filter(e => e.type === 'receipt').length}\n• Payments: ${entries.filter(e => e.type === 'payment').length}\n\nDo you want to continue?`
        );

        if (!confirmed) {
          setIsProcessing(false);
          return;
        }

        const result = await db.bulkImport(entries);
        setImportResult(result);

        if (result.imported > 0) {
          alert(
            `Import completed!\nSuccessfully imported: ${result.imported}\nFailed: ${result.failed}`
          );
        }
      }
    } catch (error) {
      console.error('Import error:', error);
      alert('Failed to import data. Please check the file format.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setImportResult(null);
    setPreview([]);
    setShowPreview(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">Import Transaction Data</h1>

        {/* FY and CB Type Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-900 mb-2">Import Settings:</h3>
          <div className="flex gap-6">
            <div>
              <span className="text-sm text-blue-800 font-medium">Financial Year: </span>
              <span className="text-sm text-blue-900 font-bold">{selectedFY}</span>
            </div>
            <div>
              <span className="text-sm text-blue-800 font-medium">Cash Book Type: </span>
              <span className="text-sm text-blue-900 font-bold">{getActualCBType().toUpperCase()}</span>
            </div>
          </div>
          <p className="text-xs text-blue-700 mt-2">
            All imported transactions will be saved to the above Financial Year and Cash Book Type.
          </p>
        </div>

        <div className="mb-8">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-yellow-900 mb-2">CSV Format Requirements (CB Report 1 Format):</h3>
            <ul className="text-sm text-yellow-800 space-y-1">
              <li>• Date format: dd-MMM-yy (e.g., 01-Apr-24, 02-Apr-24)</li>
              <li>• Required columns: Sl No, R.Date, R.Chq, R.Amount, R.Heads, R.Notes, P.Date, P.Chq, P.Amount, P.Heads, P.Notes</li>
              <li>• R.* columns for Receipts, P.* columns for Payments</li>
              <li>• Each row can have receipts, payments, or both</li>
              <li>• Empty cells are allowed for optional fields</li>
            </ul>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select CSV File
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
              disabled={isProcessing}
            />
          </div>

          {file && preview.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Selected file:</span> {file.name}
              </p>
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Size:</span>{' '}
                {(file.size / 1024).toFixed(2)} KB
              </p>
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Entries found:</span> {preview.length > 19 ? `${preview.length}+ (showing first 20)` : preview.length}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-4">
                <p className="text-sm text-green-700">
                  <span className="font-semibold">Receipts:</span> {preview.filter(e => e.type === 'receipt').length}
                </p>
                <p className="text-sm text-red-700">
                  <span className="font-semibold">Payments:</span> {preview.filter(e => e.type === 'payment').length}
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-4">
            <button
              onClick={handlePreview}
              disabled={!file || isProcessing || preview.length === 0}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {showPreview ? 'Hide Preview' : 'Preview Data'}
            </button>
            <button
              onClick={handleImport}
              disabled={!file || isProcessing || preview.length === 0}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isProcessing ? 'Importing...' : 'Import Data'}
            </button>
            <button
              onClick={handleReset}
              disabled={isProcessing}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Reset
            </button>
          </div>
        </div>

        {showPreview && preview.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Preview (First 20 entries)
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 border border-gray-300">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                      Date
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                      Type
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                      Cheque No
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 uppercase">
                      Amount
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                      Head of Account
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {preview.map((entry, index) => (
                    <tr key={index} className={`hover:bg-gray-50 ${entry.type === 'receipt' ? 'bg-green-50' : 'bg-red-50'}`}>
                      <td className="px-4 py-2 text-sm text-gray-900">{entry.date}</td>
                      <td className="px-4 py-2 text-sm">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${entry.type === 'receipt' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                          {entry.type === 'receipt' ? 'Receipt' : 'Payment'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-900">{entry.cheque_no}</td>
                      <td className="px-4 py-2 text-sm text-gray-900 text-right">
                        {entry.amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-900">{entry.head_of_accounts}</td>
                      <td className="px-4 py-2 text-sm text-gray-600">{entry.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {importResult && (
          <div className="mt-8">
            <div
              className={`rounded-lg p-6 ${
                importResult.failed === 0
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-yellow-50 border border-yellow-200'
              }`}
            >
              <h2 className="text-xl font-semibold mb-4">Import Results</h2>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm text-gray-600">Successfully Imported:</p>
                  <p className="text-2xl font-bold text-green-600">{importResult.imported}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Failed:</p>
                  <p className="text-2xl font-bold text-red-600">{importResult.failed}</p>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="mt-4">
                  <h3 className="font-semibold text-red-900 mb-2">Errors:</h3>
                  <div className="bg-white rounded border border-red-200 p-4 max-h-60 overflow-y-auto">
                    {importResult.errors.map((err, index) => (
                      <div key={index} className="text-sm text-red-800 mb-2">
                        <span className="font-semibold">Entry {err.index + 1}:</span>{' '}
                        {err.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionImportPage;
