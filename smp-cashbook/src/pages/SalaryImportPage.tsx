import React, { useState, useRef } from 'react';
import { parseSalaryCSVWithSummary, type MonthlySummary } from '../utils/salaryCSVParser';
import { db } from '../services/database';
import type { CBType } from '../types';

interface ImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors: Array<{ index: number; entry: any; error: string }>;
}

interface SalaryImportPageProps {
  selectedCBType: CBType;
}

const SalaryImportPage: React.FC<SalaryImportPageProps> = ({ selectedCBType }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [summary, setSummary] = useState<MonthlySummary[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get the actual cb_type for entries ('both' defaults to 'aided')
  const getActualCBType = (): 'aided' | 'unaided' => {
    return selectedCBType === 'unaided' ? 'unaided' : 'aided';
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
    const result = parseSalaryCSVWithSummary(text, getActualCBType());
    setPreview(result.entries.slice(0, 20)); // Show first 20 entries
    setSummary(result.summary); // Set the monthly summary
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
      const result = parseSalaryCSVWithSummary(text, getActualCBType());
      const entries = result.entries;

      console.log('🔍 SalaryImportPage - Importing with cb_type:', getActualCBType());
      console.log('🔍 SalaryImportPage - First entry cb_type:', entries[0]?.cb_type);

      if (entries.length === 0) {
        alert('No valid entries found in the CSV file');
        setIsProcessing(false);
        return;
      }

      // Fetch existing entries to check for duplicates
      const existingEntries = await db.getAllEntries();

      // Separate duplicates and new entries
      const duplicates: any[] = [];
      const newEntries = entries.filter(entry => {
        // Check if an entry with same date, type, head of accounts, and amount already exists
        const isDuplicate = existingEntries.some(existing => {
          return (
            existing.date === entry.date &&
            existing.type === entry.type &&
            existing.head_of_accounts === entry.head_of_accounts &&
            Math.abs(existing.amount - entry.amount) < 0.01
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
        const mappedEntries = entries.map(e => ({
          date: e.date,
          type: e.type,
          cheque_no: e.cheque_no || '',
          amount: e.amount,
          head_of_accounts: e.head_of_accounts,
          notes: e.notes || '',
        }));
        const result = await db.bulkImport(mappedEntries);
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
        const mappedEntries = entriesToImport.map(e => ({
          date: e.date,
          type: e.type,
          cheque_no: e.cheque_no || '',
          amount: e.amount,
          head_of_accounts: e.head_of_accounts,
          notes: e.notes || '',
        }));
        const result = await db.bulkImport(mappedEntries);
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
          `Found ${entries.length} new entries to import.\n\nDo you want to continue?`
        );

        if (!confirmed) {
          setIsProcessing(false);
          return;
        }

        const mappedEntries = entries.map(e => ({
          date: e.date,
          type: e.type,
          cheque_no: e.cheque_no || '',
          amount: e.amount,
          head_of_accounts: e.head_of_accounts,
          notes: e.notes || '',
        }));
        const result = await db.bulkImport(mappedEntries);
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
    setSummary([]);
    setShowPreview(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Import Salary Data</h2>

        <div className="mb-6">
          <p className="text-sm text-gray-600 mb-4">
            Upload a CSV file containing staff salary data. The system will automatically create
            receipt and payment entries based on the salary information.
          </p>

          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
            <h3 className="font-semibold text-blue-800 mb-2">Expected CSV Format:</h3>
            <p className="text-sm text-blue-700 mb-2">
              The CSV file should contain the following headers:
            </p>
            <ul className="text-xs text-blue-600 list-disc list-inside space-y-1">
              <li>Date, Month, Year</li>
              <li>Gross_Salary, Total_Deductions</li>
              <li>IT_Deduction, PT_Deduction, GSLIC_Deduction, LIC_Deduction, FBF_Deduction</li>
            </ul>
            <p className="text-xs text-blue-700 mt-3">
              The system will create aggregated entries for each month including:
            </p>
            <ul className="text-xs text-blue-600 list-disc list-inside space-y-1 mt-1">
              <li><strong>Receipts:</strong> Govt Salary Grants, I Tax, P Tax, Lic, Gslic, Fbf</li>
              <li><strong>Payments:</strong> Govt Salary Account, Receivable Account</li>
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select CSV File
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>

          {file && summary.length > 0 && (
            <div className="space-y-2">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-3">Monthly Summary</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-blue-300">
                        <th className="text-left py-2 px-3 text-blue-800">Month</th>
                        <th className="text-right py-2 px-3 text-blue-800">Staff Count</th>
                        <th className="text-right py-2 px-3 text-blue-800">Gross Salary</th>
                        <th className="text-right py-2 px-3 text-blue-800">I Tax</th>
                        <th className="text-right py-2 px-3 text-blue-800">P Tax</th>
                        <th className="text-right py-2 px-3 text-blue-800">LIC</th>
                        <th className="text-right py-2 px-3 text-blue-800">GSLIC</th>
                        <th className="text-right py-2 px-3 text-blue-800">FBF</th>
                        <th className="text-right py-2 px-3 text-blue-800 font-semibold">Total Deductions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.map((monthData, index) => (
                        <tr key={index} className="border-b border-blue-100">
                          <td className="py-2 px-3 font-medium text-blue-900">
                            {monthData.month} {monthData.year}
                          </td>
                          <td className="py-2 px-3 text-right font-semibold text-green-700">
                            {monthData.employeeCount} staff
                          </td>
                          <td className="py-2 px-3 text-right">
                            ₹{monthData.totalGrossSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2 px-3 text-right">
                            ₹{monthData.totalITDeduction.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2 px-3 text-right">
                            ₹{monthData.totalPTDeduction.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2 px-3 text-right">
                            ₹{monthData.totalLICDeduction.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2 px-3 text-right">
                            ₹{monthData.totalGSLICDeduction.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2 px-3 text-right">
                            ₹{monthData.totalFBFDeduction.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2 px-3 text-right font-semibold">
                            ₹{monthData.totalDeductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {file && preview.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={handlePreview}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
              >
                {showPreview ? 'Hide Preview' : 'Show Preview'}
              </button>

              {showPreview && (
                <div className="mt-4 border rounded-lg overflow-hidden">
                  <div className="bg-gray-100 px-4 py-2 border-b">
                    <h3 className="font-semibold text-gray-800">
                      Preview (First 20 entries)
                    </h3>
                  </div>
                  <div className="overflow-x-auto max-h-96">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Date
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Type
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Cheque No
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Amount
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Head of Accounts
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Notes
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {preview.map((entry, index) => (
                          <tr key={index} className={entry.type === 'receipt' ? 'bg-green-50' : 'bg-red-50'}>
                            <td className="px-3 py-2 text-xs text-gray-900">{entry.date}</td>
                            <td className="px-3 py-2 text-xs">
                              <span className={`px-2 py-1 rounded ${entry.type === 'receipt' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                                {entry.type === 'receipt' ? 'R' : 'P'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-900">{entry.cheque_no}</td>
                            <td className="px-3 py-2 text-xs text-gray-900 font-medium">
                              ₹{entry.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-900">{entry.head_of_accounts}</td>
                            <td className="px-3 py-2 text-xs text-gray-600">{entry.notes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleImport}
              disabled={!file || isProcessing}
              className={`px-6 py-2 rounded font-medium ${
                !file || isProcessing
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {isProcessing ? 'Importing...' : 'Import Salary Data'}
            </button>

            <button
              onClick={handleReset}
              disabled={isProcessing}
              className="px-6 py-2 bg-gray-500 text-white rounded font-medium hover:bg-gray-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Reset
            </button>
          </div>

          {importResult && (
            <div className={`mt-4 p-4 rounded-lg ${importResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <h3 className={`font-semibold ${importResult.success ? 'text-green-800' : 'text-red-800'}`}>
                Import Summary
              </h3>
              <p className="text-sm mt-2">
                <span className="font-medium">Successfully imported:</span> {importResult.imported}
              </p>
              <p className="text-sm">
                <span className="font-medium">Failed:</span> {importResult.failed}
              </p>

              {importResult.errors && importResult.errors.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-red-800 mb-2">Errors:</p>
                  <div className="max-h-40 overflow-y-auto bg-white rounded p-2 text-xs">
                    {importResult.errors.map((error, index) => (
                      <div key={index} className="mb-2 text-red-700">
                        Row {error.index + 1}: {error.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SalaryImportPage;
