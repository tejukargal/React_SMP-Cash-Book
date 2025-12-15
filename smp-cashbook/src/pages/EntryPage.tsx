import { useState, useEffect } from 'react';
import EntryForm from '../components/EntryForm';
import type { CashEntry, EntryType, EntryFormData, CBType } from '../types';
import { getTodayDate, formatAmount, calculateClosingBalance, toProperCase } from '../utils/helpers';
import { db } from '../services/database';
import { getFinancialYearDisplay } from '../utils/financialYear';

interface EntryPageProps {
  selectedFY: string;
  selectedCBType: CBType;
  onNavigate?: (page: 'transactions') => void;
  onSuccessMessage?: (message: string) => void;
}

export default function EntryPage({ selectedFY, selectedCBType, onNavigate, onSuccessMessage }: EntryPageProps) {
  const [recentEntries, setRecentEntries] = useState<CashEntry[]>([]);
  const [defaultDate, setDefaultDate] = useState<string>(getTodayDate());
  const [editData, setEditData] = useState<{ id: string; formData: EntryFormData; type: EntryType } | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [formResetTrigger, setFormResetTrigger] = useState<number>(0);

  // Load recent entries on mount and when FY or CB Type changes
  useEffect(() => {
    loadRecentEntries();
    loadMostRecentDate();
  }, [selectedFY, selectedCBType]);

  const loadRecentEntries = async () => {
    try {
      // Fetch entries filtered by FY and CB Type
      const allEntries = await db.getAllEntries(selectedFY, selectedCBType);

      // Sort entries oldest to newest
      const sortedEntries = allEntries.sort((a, b) => {
        const [dayA, monthA, yearA] = a.date.split('/').map(Number);
        const [dayB, monthB, yearB] = b.date.split('/').map(Number);
        const dateA = new Date(2000 + yearA, monthA - 1, dayA);
        const dateB = new Date(2000 + yearB, monthB - 1, dayB);
        return dateA.getTime() - dateB.getTime();
      });

      // Force update by creating new array with all sorted entries
      // This is needed for correct closing balance calculation
      setRecentEntries(sortedEntries.map(entry => ({ ...entry })));
    } catch (error) {
      console.error('Error loading recent entries:', error);
    }
  };

  const loadMostRecentDate = async () => {
    const recentDate = await db.getMostRecentDate();
    if (recentDate) {
      setDefaultDate(recentDate);
    }
  };

  const handleSave = async (type: EntryType, formData: EntryFormData, editId?: string) => {
    try {
      if (editId) {
        // Update existing entry
        await db.updateEntry(editId, formData);
        showSuccessMessage('Entry updated successfully!');

        // Reload entries and reset edit mode
        await loadRecentEntries();
        setEditData(null);
      } else {
        // Check for duplicates before creating new entry
        const allEntries = await db.getAllEntries();
        const amount = parseFloat(formData.amount);

        const duplicateEntry = allEntries.find(existing => {
          return (
            existing.date === formData.date &&
            existing.type === type &&
            existing.head_of_accounts === formData.head_of_accounts &&
            Math.abs(existing.amount - amount) < 0.01 &&
            existing.notes === formData.notes &&
            existing.cheque_no === formData.cheque_no
          );
        });

        if (duplicateEntry) {
          const proceed = window.confirm(
            `⚠️ Duplicate Entry Found!\n\nA similar entry already exists:\n` +
            `Date: ${duplicateEntry.date}\n` +
            `Type: ${duplicateEntry.type === 'receipt' ? 'Receipt' : 'Payment'}\n` +
            `Cheque No: ${duplicateEntry.cheque_no || '-'}\n` +
            `Amount: ${formatAmount(duplicateEntry.amount)}\n` +
            `Head of Account: ${duplicateEntry.head_of_accounts}\n` +
            `Notes: ${duplicateEntry.notes || '-'}\n\n` +
            `Do you want to create this entry anyway?`
          );

          if (!proceed) {
            return; // Cancel the save operation
          }
        }

        // Create new entry
        await db.createEntry(type, formData);

        // Update default date for next entry
        setDefaultDate(formData.date);

        // Clear search query to show all entries
        setSearchQuery('');

        // Reload entries immediately
        await loadRecentEntries();

        // Trigger form reset (clear all fields except date)
        setFormResetTrigger(prev => prev + 1);

        // Show success message after reload completes
        showSuccessMessage(`${type === 'receipt' ? 'Receipt' : 'Payment'} saved successfully!`);
      }
    } catch (error) {
      console.error('Error saving entry:', error);
      alert('Failed to save entry. Please try again.');
    }
  };

  const handleEdit = (entry: CashEntry) => {
    const formData: EntryFormData = {
      date: entry.date,
      cheque_no: entry.cheque_no || '',
      amount: entry.amount.toString(),
      head_of_accounts: entry.head_of_accounts,
      notes: entry.notes || '',
      cb_type: entry.cb_type,
    };

    setEditData({ id: entry.id, formData, type: entry.type });

    // Scroll to top to show form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditData(null);
  };

  const handleDelete = async (id: string, head: string) => {
    if (confirm(`Are you sure you want to delete the entry for "${head}"?`)) {
      try {
        await db.deleteEntry(id);
        showSuccessMessage('Entry deleted successfully!');
        await loadRecentEntries();
      } catch (error) {
        console.error('Error deleting entry:', error);
        alert('Failed to delete entry. Please try again.');
      }
    }
  };

  const showSuccessMessage = (message: string) => {
    if (onSuccessMessage) {
      onSuccessMessage(message);
    }
  };

  // Filter entries based on search and limit to recent 20
  const filteredEntries = recentEntries
    .filter((entry) => {
      if (!searchQuery) return true;
      return (
        entry.head_of_accounts.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.notes?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.cheque_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.date.includes(searchQuery)
      );
    });

  // For display, show only the last 5 entries (most recent) in reverse order (newest to oldest)
  const displayEntries = searchQuery ? filteredEntries : filteredEntries.slice(-5).reverse();

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Entry Forms Section - Receipt and Payment Side by Side */}
      <div className="grid grid-cols-2 gap-2 m-2">
        {/* Receipt Form */}
        <div className="bg-white shadow-sm rounded-lg px-3 py-2">
          <EntryForm
            selectedType="receipt"
            initialDate={defaultDate}
            selectedCBType={selectedCBType}
            editData={editData?.type === 'receipt' ? editData : null}
            onSave={handleSave}
            onCancel={handleCancelEdit}
            resetTrigger={formResetTrigger}
            autoFocus={true}
          />
        </div>

        {/* Payment Form */}
        <div className="bg-white shadow-sm rounded-lg px-3 py-2">
          <EntryForm
            selectedType="payment"
            initialDate={defaultDate}
            selectedCBType={selectedCBType}
            editData={editData?.type === 'payment' ? editData : null}
            onSave={handleSave}
            onCancel={handleCancelEdit}
            resetTrigger={formResetTrigger}
            autoFocus={false}
          />
        </div>
      </div>

      {/* Recent 5 Transactions */}
      <div className="flex-1 bg-white shadow-sm mx-2 mb-2 rounded-lg overflow-hidden flex flex-col">
        <div className="bg-gray-100 border-b border-gray-300 px-3 py-1.5 flex justify-between items-center">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Recent Transactions (Last 5)</h2>
            <p className="text-xs text-gray-600">FY: {getFinancialYearDisplay(selectedFY)}</p>
          </div>
          {/* Search */}
          <div className="flex-1 max-w-sm ml-4">
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(toProperCase(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          {/* View Full Transactions Link */}
          {onNavigate && (
            <button
              onClick={() => onNavigate('transactions')}
              className="ml-2 px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition-colors"
            >
              View All Transactions
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {displayEntries.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <p className="text-sm font-medium">{searchQuery ? 'No matching entries' : 'No entries yet'}</p>
                <p className="text-xs mt-1">
                  {searchQuery ? 'Try a different search term' : 'Click Receipt or Payment above to add your first entry'}
                </p>
              </div>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead className="bg-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-3 py-1.5 text-sm font-semibold text-gray-700 border-b border-gray-300">
                    Date
                  </th>
                  <th className="text-left px-3 py-1.5 text-sm font-semibold text-gray-700 border-b border-gray-300">
                    Type
                  </th>
                  <th className="text-left px-3 py-1.5 text-sm font-semibold text-gray-700 border-b border-gray-300">
                    Cheque No
                  </th>
                  <th className="text-right px-3 py-1.5 text-sm font-semibold text-gray-700 border-b border-gray-300">
                    Amount
                  </th>
                  <th className="text-left px-3 py-1.5 text-sm font-semibold text-gray-700 border-b border-gray-300">
                    Head of Accounts
                  </th>
                  <th className="text-left px-3 py-1.5 text-sm font-semibold text-gray-700 border-b border-gray-300">
                    Notes
                  </th>
                  <th className="text-right px-3 py-1.5 text-sm font-semibold text-gray-700 border-b border-gray-300">
                    Closing Balance
                  </th>
                  <th className="text-center px-3 py-1.5 text-sm font-semibold text-gray-700 border-b border-gray-300 w-24">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayEntries.map((entry) => {
                  // Find the index in the full filteredEntries array for correct closing balance
                  const fullIndex = filteredEntries.findIndex(e => e.id === entry.id);
                  const closingBalance = calculateClosingBalance(filteredEntries, fullIndex);
                  const rowBgColor =
                    entry.type === 'receipt' ? 'bg-green-50' : 'bg-red-50';

                  return (
                    <tr
                      key={entry.id}
                      className={`${rowBgColor} hover:opacity-80 transition-opacity duration-150 border-b border-gray-200`}
                      style={{ height: '30px' }}
                    >
                      <td className="px-3 py-1 text-sm text-gray-800">{entry.date}</td>
                      <td className="px-3 py-1 text-sm">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            entry.type === 'receipt'
                              ? 'bg-green-200 text-green-800'
                              : 'bg-red-200 text-red-800'
                          }`}
                        >
                          {entry.type === 'receipt' ? 'R' : 'P'}
                        </span>
                      </td>
                      <td className="px-3 py-1 text-sm text-gray-700">
                        {entry.cheque_no || '-'}
                      </td>
                      <td className="px-3 py-1 text-sm text-gray-800 text-right font-medium">
                        {formatAmount(entry.amount)}
                      </td>
                      <td className="px-3 py-1 text-sm text-gray-800">
                        {entry.head_of_accounts}
                      </td>
                      <td className="px-3 py-1 text-sm text-gray-600 truncate max-w-xs">
                        {entry.notes || '-'}
                      </td>
                      <td
                        className={`px-3 py-1 text-sm text-right font-semibold ${
                          closingBalance !== null
                            ? closingBalance >= 0
                              ? 'text-green-700'
                              : 'text-red-700'
                            : 'text-gray-400'
                        }`}
                      >
                        {closingBalance !== null ? formatAmount(closingBalance) : '-'}
                      </td>
                      <td className="px-3 py-1 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleEdit(entry)}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium transition-colors duration-150"
                            title="Edit"
                          >
                            Edit
                          </button>
                          <span className="text-gray-300 text-xs">|</span>
                          <button
                            onClick={() => handleDelete(entry.id, entry.head_of_accounts)}
                            className="text-red-600 hover:text-red-800 text-xs font-medium transition-colors duration-150"
                            title="Delete"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
