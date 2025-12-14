import React, { useState, useRef } from 'react';
import { convertCSVToReceipts } from '../utils/csvParser';
import { db } from '../services/database';

interface ImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors: Array<{ index: number; entry: any; error: string }>;
}

const FeeImportPage: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    const receipts = convertCSVToReceipts(text);
    setPreview(receipts.slice(0, 10)); // Show first 10 entries
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
      const receipts = convertCSVToReceipts(text);

      if (receipts.length === 0) {
        alert('No valid entries found in the CSV file');
        setIsProcessing(false);
        return;
      }

      // Fetch existing entries to check for duplicates
      const existingEntries = await db.getAllEntries();

      // Separate duplicates and new entries
      const duplicates: any[] = [];
      const newReceipts = receipts.filter(receipt => {
        // Check if an entry with same date, head of accounts, notes, and amount already exists
        const isDuplicate = existingEntries.some(existing => {
          return (
            existing.date === receipt.date &&
            existing.head_of_accounts === receipt.head_of_accounts &&
            existing.notes === receipt.notes &&
            Math.abs(existing.amount - receipt.amount) < 0.01 // Compare amounts with small tolerance
          );
        });

        if (isDuplicate) {
          duplicates.push(receipt);
          return false;
        }
        return true;
      });

      const duplicateCount = duplicates.length;

      // If all entries are duplicates
      if (newReceipts.length === 0 && duplicateCount > 0) {
        const importDuplicates = window.confirm(
          `All ${receipts.length} entries already exist in the database.\n\nDo you want to import them anyway (duplicates will be created)?`
        );

        if (!importDuplicates) {
          alert('Import cancelled. No entries were imported.');
          setIsProcessing(false);
          return;
        }

        // User wants to import duplicates
        const result = await db.bulkImport(receipts);
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
          `Found ${receipts.length} entries in CSV:\n• ${newReceipts.length} new entries\n• ${duplicateCount} duplicates\n\nClick OK to skip duplicates and import only new entries.\nClick Cancel to import ALL entries (including duplicates).`
        );

        const entriesToImport = choice ? newReceipts : receipts;
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
          `Found ${receipts.length} new entries to import.\n\nDo you want to continue?`
        );

        if (!confirmed) {
          setIsProcessing(false);
          return;
        }

        const result = await db.bulkImport(receipts);
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
        <h1 className="text-3xl font-bold text-gray-800 mb-6">Import Fee Data</h1>

        <div className="mb-8">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-blue-900 mb-2">CSV Format Requirements:</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Date format: dd-mmm-yy (e.g., 12-May-25)</li>
              <li>• Required columns: Date, Rpt, Student Name, Reg No, and fee heads</li>
              <li>
                • Fee heads: Adm, Tution, Lib, RR, Sports, Lab, DVP, Mag, ID, Ass, SWF, TWF, NSS,
                Fine
              </li>
              <li>• Each non-zero fee amount will create a separate receipt entry</li>
              <li>• Receipt number from 'Rpt' column will be used as cheque number</li>
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

          {file && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Selected file:</span> {file.name}
              </p>
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Size:</span>{' '}
                {(file.size / 1024).toFixed(2)} KB
              </p>
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Entries to import:</span> {preview.length > 0 ? `~${preview.length * 10} (estimated)` : 'Calculating...'}
              </p>
            </div>
          )}

          <div className="flex gap-4">
            <button
              onClick={handlePreview}
              disabled={!file || isProcessing}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {showPreview ? 'Hide Preview' : 'Preview Data'}
            </button>
            <button
              onClick={handleImport}
              disabled={!file || isProcessing}
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
              Preview (First 10 entries)
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 border border-gray-300">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                      Date
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                      Receipt No
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                      Head of Account
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 uppercase">
                      Amount
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {preview.map((entry, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-900">{entry.date}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">{entry.cheque_no}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">
                        {entry.head_of_accounts}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-900 text-right">
                        {entry.amount.toFixed(2)}
                      </td>
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

export default FeeImportPage;
