import { useState, useEffect, type JSX } from 'react';
import EntryForm from '../components/EntryForm';
import type { CashEntry, EntryType, EntryFormData, CBType } from '../types';
import { getTodayDate, formatAmount, toProperCase } from '../utils/helpers';
import { db } from '../services/database';
import { getFinancialYearDisplay } from '../utils/financialYear';
import { useAllEntries, useRecentDate, useCreateEntry, useUpdateEntry, useDeleteEntry } from '../hooks/useCashEntries';

interface EntryPageProps {
  selectedFY: string;
  selectedCBType: CBType;
  onNavigate?: (page: 'transactions') => void;
  onSuccessMessage?: (message: string) => void;
}

// Fee order for sorting
const FEE_ORDER = [
  'Adm Fee',
  'Tution Fee',
  'RR Fee',
  'Ass Fee',
  'Sports Fee',
  'Mag Fee',
  'ID Fee',
  'Lib Fee',
  'Lab Fee',
  'DVP Fee',
  'SWF Fee',
  'TWF Fee',
  'Nss Fee',
  'Fine Fee',
];

// Helper function to get fee order index
const getFeeOrderIndex = (headOfAccount: string): number => {
  const index = FEE_ORDER.indexOf(headOfAccount);
  return index === -1 ? 999 : index; // Non-fee items go to end
};

export default function EntryPage({ selectedFY, selectedCBType, onNavigate, onSuccessMessage }: EntryPageProps) {
  const [defaultDate, setDefaultDate] = useState<string>(getTodayDate());
  const [editData, setEditData] = useState<{ id: string; formData: EntryFormData; type: EntryType } | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [formResetTrigger, setFormResetTrigger] = useState<number>(0);
  const [showForms, setShowForms] = useState<boolean>(false);

  // React Query hooks - optimized fetching with caching
  const { data: recentEntriesData = [] } = useAllEntries(selectedFY, selectedCBType);
  const { data: recentDate } = useRecentDate();

  // Mutations with optimistic updates
  const createEntryMutation = useCreateEntry();
  const updateEntryMutation = useUpdateEntry();
  const deleteEntryMutation = useDeleteEntry();

  // Update default date when recent date is fetched
  useEffect(() => {
    if (recentDate) {
      setDefaultDate(recentDate);
    }
  }, [recentDate]);

  // Sort entries newest to oldest (for Entry page display)
  const recentEntries = [...recentEntriesData].sort((a, b) => {
    const [dayA, monthA, yearA] = a.date.split('/').map(Number);
    const [dayB, monthB, yearB] = b.date.split('/').map(Number);
    const dateA = new Date(2000 + yearA, monthA - 1, dayA);
    const dateB = new Date(2000 + yearB, monthB - 1, dayB);
    // Sort descending (newest first)
    const dateCompare = dateB.getTime() - dateA.getTime();
    if (dateCompare !== 0) return dateCompare;

    // If same date, sort by fee order first (for fee entries)
    const feeOrderA = getFeeOrderIndex(a.head_of_accounts);
    const feeOrderB = getFeeOrderIndex(b.head_of_accounts);
    if (feeOrderA !== feeOrderB) return feeOrderA - feeOrderB;

    // If same fee order (or both non-fee), sort by created_at
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const handleSave = async (type: EntryType, formData: EntryFormData, editId?: string) => {
    try {
      if (editId) {
        // Update existing entry with optimistic update
        await updateEntryMutation.mutateAsync({ id: editId, formData });
        showSuccessMessage('Entry updated successfully!');
        setEditData(null);
      } else {
        // Check for duplicates using backend endpoint (optimized)
        const isDuplicate = await db.checkDuplicate(
          formData.date,
          type,
          formData.amount,
          formData.head_of_accounts,
          formData.cheque_no,
          formData.notes
        );

        if (isDuplicate) {
          const proceed = window.confirm(
            `⚠️ Duplicate Entry Found!\n\nA similar entry was recently created with:\n` +
            `Date: ${formData.date}\n` +
            `Type: ${type === 'receipt' ? 'Receipt' : 'Payment'}\n` +
            `Cheque No: ${formData.cheque_no || '-'}\n` +
            `Amount: ${formatAmount(parseFloat(formData.amount))}\n` +
            `Head of Account: ${formData.head_of_accounts}\n` +
            `Notes: ${formData.notes || '-'}\n\n` +
            `Do you want to create this entry anyway?`
          );

          if (!proceed) {
            return; // Cancel the save operation
          }
        }

        // Create new entry with optimistic update
        await createEntryMutation.mutateAsync({ type, formData });

        // Update default date for next entry
        setDefaultDate(formData.date);

        // Clear search query to show all entries
        setSearchQuery('');

        // Trigger form reset (clear all fields except date)
        setFormResetTrigger(prev => prev + 1);

        // Show success message (React Query auto-updates the UI)
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
    setShowForms(true); // Show forms when editing

    // Scroll to top to show form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditData(null);
    setShowForms(false); // Collapse forms when cancel is clicked
  };

  const handleDelete = async (id: string, head: string) => {
    if (confirm(`Are you sure you want to delete the entry for "${head}"?`)) {
      try {
        // Delete with optimistic update
        await deleteEntryMutation.mutateAsync(id);
        showSuccessMessage('Entry deleted successfully!');
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

  // Create chronologically sorted array from ALL entries (oldest to newest) - for accurate balance calculation
  const allChronologicalEntries = [...recentEntriesData].sort((a, b) => {
    const [dayA, monthA, yearA] = a.date.split('/').map(Number);
    const [dayB, monthB, yearB] = b.date.split('/').map(Number);
    const dateA = new Date(2000 + yearA, monthA - 1, dayA);
    const dateB = new Date(2000 + yearB, monthB - 1, dayB);
    const dateCompare = dateA.getTime() - dateB.getTime();
    if (dateCompare !== 0) return dateCompare;

    // If same date, sort by fee order
    const feeOrderA = getFeeOrderIndex(a.head_of_accounts);
    const feeOrderB = getFeeOrderIndex(b.head_of_accounts);
    if (feeOrderA !== feeOrderB) return feeOrderA - feeOrderB;

    // If same fee order, sort by created_at
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  // Filter entries based on search
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

  // For display logic
  let displayEntries: CashEntry[];

  if (searchQuery) {
    // When searching, show all matching entries
    displayEntries = filteredEntries;
  } else if (showForms) {
    // When forms are shown, show only entries from the current date (defaultDate)
    displayEntries = filteredEntries.filter(entry => entry.date === defaultDate);
  } else {
    // When forms are collapsed (full screen), show entries from most recent date + 2 previous dates
    // Find the most recently created/updated entry
    const mostRecentEntry = [...recentEntriesData].sort((a, b) => {
      const timeA = Math.max(
        new Date(a.created_at).getTime(),
        a.updated_at ? new Date(a.updated_at).getTime() : 0
      );
      const timeB = Math.max(
        new Date(b.created_at).getTime(),
        b.updated_at ? new Date(b.updated_at).getTime() : 0
      );
      return timeB - timeA;
    })[0];

    if (mostRecentEntry) {
      const recentDate = mostRecentEntry.date;

      // Get all unique dates and sort them chronologically (oldest first)
      const allDates = [...new Set(recentEntriesData.map(e => e.date))].sort((a, b) => {
        const [dayA, monthA, yearA] = a.split('/').map(Number);
        const [dayB, monthB, yearB] = b.split('/').map(Number);
        const dateA = new Date(2000 + yearA, monthA - 1, dayA);
        const dateB = new Date(2000 + yearB, monthB - 1, dayB);
        return dateA.getTime() - dateB.getTime();
      });

      // Find the index of the recent date
      const recentDateIndex = allDates.indexOf(recentDate);

      // Get the recent date + 2 previous dates (3 dates total)
      const startIndex = Math.max(0, recentDateIndex - 2);
      const datesToShow = allDates.slice(startIndex, recentDateIndex + 1);

      // Filter entries to show only those dates
      displayEntries = filteredEntries.filter(entry => datesToShow.includes(entry.date));
    } else {
      displayEntries = [];
    }
  }

  // Group entries by date for CB Report 2 format
  const groupEntriesByDate = () => {
    const grouped: { [date: string]: { date: string; receipts: CashEntry[]; payments: CashEntry[] } } = {};

    displayEntries.forEach((entry) => {
      if (!grouped[entry.date]) {
        grouped[entry.date] = {
          date: entry.date,
          receipts: [],
          payments: [],
        };
      }

      if (entry.type === 'receipt') {
        grouped[entry.date].receipts.push(entry);
      } else {
        grouped[entry.date].payments.push(entry);
      }
    });

    // Sort receipts and payments within each date by fee order
    Object.values(grouped).forEach((group) => {
      group.receipts.sort((a, b) => {
        const feeOrderA = getFeeOrderIndex(a.head_of_accounts);
        const feeOrderB = getFeeOrderIndex(b.head_of_accounts);
        if (feeOrderA !== feeOrderB) return feeOrderA - feeOrderB;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
      group.payments.sort((a, b) => {
        const feeOrderA = getFeeOrderIndex(a.head_of_accounts);
        const feeOrderB = getFeeOrderIndex(b.head_of_accounts);
        if (feeOrderA !== feeOrderB) return feeOrderA - feeOrderB;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
    });

    // Convert to array and sort by date (oldest first for balance calculation)
    return Object.values(grouped).sort((a, b) => {
      const [dayA, monthA, yearA] = a.date.split('/').map(Number);
      const [dayB, monthB, yearB] = b.date.split('/').map(Number);
      const dateA = new Date(2000 + yearA, monthA - 1, dayA);
      const dateB = new Date(2000 + yearB, monthB - 1, dayB);
      return dateA.getTime() - dateB.getTime();
    });
  };

  const groupedByDate = groupEntriesByDate();

  // Calculate opening balance from ALL entries before the first displayed date
  const calculateOpeningBalanceForFiltered = (): number => {
    if (groupedByDate.length === 0) return 0;

    const firstDisplayedDate = groupedByDate[0].date;
    const [dayFirst, monthFirst, yearFirst] = firstDisplayedDate.split('/').map(Number);
    const firstDate = new Date(2000 + yearFirst, monthFirst - 1, dayFirst);

    // Sum ALL entries (not just filtered) before the first displayed date
    let openingBalance = 0;
    allChronologicalEntries.forEach((entry) => {
      const [day, month, year] = entry.date.split('/').map(Number);
      const entryDate = new Date(2000 + year, month - 1, day);

      if (entryDate < firstDate) {
        if (entry.type === 'receipt') {
          openingBalance += parseFloat(entry.amount.toString());
        } else {
          openingBalance -= parseFloat(entry.amount.toString());
        }
      }
    });

    return openingBalance;
  };

  const initialOpeningBalance = calculateOpeningBalanceForFiltered();

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Add Entries Button or Entry Forms Section */}
      {!showForms ? (
        /* Add Entries Button - Collapsed State */
        <div className="m-2">
          <button
            onClick={() => setShowForms(true)}
            className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold rounded-lg shadow-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            + Add Entries
          </button>
        </div>
      ) : (
        /* Entry Forms Section - Receipt and Payment Side by Side */
        <div className="grid grid-cols-2 gap-2 m-2">
          {/* Receipt Form */}
          <div className="bg-white shadow-sm rounded-lg px-3 py-2">
            <EntryForm
              selectedType="receipt"
              initialDate={defaultDate}
              selectedCBType={selectedCBType}
              selectedFY={selectedFY}
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
              selectedFY={selectedFY}
              editData={editData?.type === 'payment' ? editData : null}
              onSave={handleSave}
              onCancel={handleCancelEdit}
              resetTrigger={formResetTrigger}
              autoFocus={false}
            />
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      <div className="flex-1 bg-white shadow-sm mx-2 mb-2 rounded-lg overflow-hidden flex flex-col">
        <div className="bg-gray-100 border-b border-gray-300 px-3 py-1.5 flex justify-between items-center">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">
              Recent Transactions {showForms ? `(Date: ${defaultDate})` : '(Recent 3 Dates)'}
              <span className="ml-2 text-xs font-normal text-blue-600">CB Report 2 Format</span>
            </h2>
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
                <p className="text-sm font-medium">{searchQuery ? 'No matching entries' : showForms ? `No entries for ${defaultDate}` : 'No entries yet'}</p>
                <p className="text-xs mt-1">
                  {searchQuery ? 'Try a different search term' : 'Click "+ Add Entries" above to add your first entry'}
                </p>
              </div>
            </div>
          ) : (
            /* CB Report 2 Format - always use this format */
            <table className="w-full border-collapse table-fixed">
              <colgroup>
                {/* Receipt Columns */}
                <col style={{ width: '6%' }} /> {/* R.Date */}
                <col style={{ width: '12%' }} /> {/* R.Heads */}
                <col style={{ width: '20%' }} /> {/* R.Notes */}
                <col style={{ width: '8.5%' }} /> {/* R.Amount */}
                {/* Payment Columns */}
                <col style={{ width: '6%' }} /> {/* P.Date */}
                <col style={{ width: '12%' }} /> {/* P.Heads */}
                <col style={{ width: '20%' }} /> {/* P.Notes */}
                <col style={{ width: '8.5%' }} /> {/* P.Amount */}
                {/* Actions Column */}
                <col style={{ width: '7%' }} /> {/* Actions */}
              </colgroup>
              <thead className="bg-gray-200 sticky top-0 z-10">
                <tr>
                  {/* Receipt Columns */}
                  <th className="px-2 py-2 text-xs font-semibold text-gray-700 border border-gray-300 bg-green-100">
                    R.Date
                  </th>
                  <th className="px-2 py-2 text-xs font-semibold text-gray-700 border border-gray-300 bg-green-100">
                    R.Heads
                  </th>
                  <th className="px-2 py-2 text-xs font-semibold text-gray-700 border border-gray-300 bg-green-100">
                    R.Notes
                  </th>
                  <th className="px-2 py-2 text-xs font-semibold text-gray-700 border border-gray-300 bg-green-100">
                    R.Amount
                  </th>
                  {/* Payment Columns */}
                  <th className="px-2 py-2 text-xs font-semibold text-gray-700 border border-gray-300 bg-red-100">
                    P.Date
                  </th>
                  <th className="px-2 py-2 text-xs font-semibold text-gray-700 border border-gray-300 bg-red-100">
                    P.Heads
                  </th>
                  <th className="px-2 py-2 text-xs font-semibold text-gray-700 border border-gray-300 bg-red-100">
                    P.Notes
                  </th>
                  <th className="px-2 py-2 text-xs font-semibold text-gray-700 border border-gray-300 bg-red-100">
                    P.Amount
                  </th>
                  <th className="px-0.5 py-2 text-xs font-semibold text-gray-700 border border-gray-300 bg-blue-100">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Start with opening balance from all previous transactions (for filtered search)
                  let runningBalance = initialOpeningBalance;
                  const rows: JSX.Element[] = [];

                  groupedByDate.forEach((group, groupIndex) => {
                    const dateReceipts = group.receipts.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0);
                    const datePayments = group.payments.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0);

                    // Show "By Opening Bal" row (if not first date, or if first date has non-zero opening balance)
                    if (groupIndex > 0 || (groupIndex === 0 && runningBalance !== 0)) {
                      rows.push(
                        <tr key={`by-opening-${groupIndex}`} className="bg-white">
                          <td className="px-2 py-1.5 text-xs text-gray-800 border border-gray-300 bg-green-50"></td>
                          <td className="px-2 py-1.5 text-xs text-gray-800 border border-gray-300 bg-green-50"></td>
                          <td className="px-2 py-1.5 text-xs text-blue-600 font-medium border border-gray-300 bg-green-50">
                            By Opening Bal
                          </td>
                          <td className="px-2 py-1.5 text-xs text-blue-600 text-right font-medium border border-gray-300 bg-green-50">
                            {formatAmount(runningBalance)}
                          </td>
                          <td className="px-2 py-1.5 text-xs text-gray-800 border border-gray-300 bg-red-50"></td>
                          <td className="px-2 py-1.5 text-xs text-gray-800 border border-gray-300 bg-red-50"></td>
                          <td className="px-2 py-1.5 text-xs text-gray-600 border border-gray-300 bg-red-50"></td>
                          <td className="px-2 py-1.5 text-xs text-gray-800 text-right font-medium border border-gray-300 bg-red-50"></td>
                          <td className="px-0.5 py-1.5 text-xs border border-gray-300 bg-gray-50"></td>
                        </tr>
                      );
                    }

                    // Transaction rows
                    const maxRows = Math.max(group.receipts.length, group.payments.length);
                    for (let i = 0; i < maxRows; i++) {
                      const receipt = group.receipts[i];
                      const payment = group.payments[i];

                      rows.push(
                        <tr key={`${groupIndex}-${i}`} className="hover:bg-gray-50">
                          <td className="px-2 py-1.5 text-xs text-gray-800 border border-gray-300 bg-green-50">
                            {receipt?.date || ''}
                          </td>
                          <td className="px-2 py-1.5 text-xs text-gray-800 border border-gray-300 bg-green-50 truncate" title={receipt?.head_of_accounts || ''}>
                            {receipt?.head_of_accounts || ''}
                          </td>
                          <td className="px-2 py-1.5 text-xs text-gray-600 border border-gray-300 bg-green-50 truncate" title={receipt?.notes || ''}>
                            {receipt?.notes || ''}
                          </td>
                          <td className="px-2 py-1.5 text-xs text-gray-800 text-right font-medium border border-gray-300 bg-green-50">
                            {receipt ? formatAmount(receipt.amount) : ''}
                          </td>
                          <td className="px-2 py-1.5 text-xs text-gray-800 border border-gray-300 bg-red-50">
                            {payment?.date || ''}
                          </td>
                          <td className="px-2 py-1.5 text-xs text-gray-800 border border-gray-300 bg-red-50 truncate" title={payment?.head_of_accounts || ''}>
                            {payment?.head_of_accounts || ''}
                          </td>
                          <td className="px-2 py-1.5 text-xs text-gray-600 border border-gray-300 bg-red-50 truncate" title={payment?.notes || ''}>
                            {payment?.notes || ''}
                          </td>
                          <td className="px-2 py-1.5 text-xs text-gray-800 text-right font-medium border border-gray-300 bg-red-50">
                            {payment ? formatAmount(payment.amount) : ''}
                          </td>
                          <td className="px-0.5 py-1.5 text-xs border border-gray-300 bg-white">
                            <div className="flex items-center justify-center gap-0.5">
                              {receipt && (
                                <>
                                  <button
                                    onClick={() => handleEdit(receipt)}
                                    className="text-blue-600 hover:text-blue-800 font-medium"
                                    title="Edit Receipt"
                                  >
                                    E
                                  </button>
                                  <span className="text-gray-300">|</span>
                                  <button
                                    onClick={() => handleDelete(receipt.id, receipt.head_of_accounts)}
                                    className="text-red-600 hover:text-red-800 font-medium"
                                    title="Delete Receipt"
                                  >
                                    D
                                  </button>
                                </>
                              )}
                              {payment && (
                                <>
                                  {receipt && <span className="text-gray-400">•</span>}
                                  <button
                                    onClick={() => handleEdit(payment)}
                                    className="text-blue-600 hover:text-blue-800 font-medium"
                                    title="Edit Payment"
                                  >
                                    E
                                  </button>
                                  <span className="text-gray-300">|</span>
                                  <button
                                    onClick={() => handleDelete(payment.id, payment.head_of_accounts)}
                                    className="text-red-600 hover:text-red-800 font-medium"
                                    title="Delete Payment"
                                  >
                                    D
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    // Calculate total including opening balance for receipts
                    const previousBalance = runningBalance;
                    const totalReceipts = dateReceipts + (groupIndex > 0 ? previousBalance : 0);

                    // Total row
                    runningBalance += dateReceipts - datePayments;
                    rows.push(
                      <tr key={`total-${groupIndex}`} className="bg-gray-200">
                        <td className="px-2 py-1.5 text-xs text-gray-800 border border-gray-300"></td>
                        <td className="px-2 py-1.5 text-xs text-gray-800 border border-gray-300"></td>
                        <td className="px-2 py-1.5 text-xs text-gray-800 font-semibold border border-gray-300">
                          Total
                        </td>
                        <td className="px-2 py-1.5 text-xs text-gray-800 text-right font-bold border border-gray-300">
                          {formatAmount(totalReceipts)}
                        </td>
                        <td className="px-2 py-1.5 text-xs text-gray-800 border border-gray-300">
                          {group.date}
                        </td>
                        <td className="px-2 py-1.5 text-xs text-gray-800 border border-gray-300"></td>
                        <td className="px-2 py-1.5 text-xs text-gray-800 font-semibold border border-gray-300">
                          Total
                        </td>
                        <td className="px-2 py-1.5 text-xs text-gray-800 text-right font-bold border border-gray-300">
                          {formatAmount(datePayments)}
                        </td>
                        <td className="px-0.5 py-1.5 text-xs border border-gray-300 bg-gray-200"></td>
                      </tr>
                    );

                    // Closing balance rows
                    rows.push(
                      <tr key={`closing-1-${groupIndex}`} className="bg-white">
                        <td className="px-2 py-1.5 text-xs text-gray-800 border border-gray-300 bg-green-50"></td>
                        <td className="px-2 py-1.5 text-xs text-gray-800 border border-gray-300 bg-green-50"></td>
                        <td className="px-2 py-1.5 text-xs text-gray-600 border border-gray-300 bg-green-50"></td>
                        <td className="px-2 py-1.5 text-xs text-gray-800 text-right font-medium border border-gray-300 bg-green-50"></td>
                        <td className="px-2 py-1.5 text-xs text-gray-800 border border-gray-300 bg-red-50"></td>
                        <td className="px-2 py-1.5 text-xs text-gray-800 border border-gray-300 bg-red-50"></td>
                        <td className="px-2 py-1.5 text-xs text-gray-800 font-medium border border-gray-300 bg-red-50">
                          Closing Bal
                        </td>
                        <td className="px-2 py-1.5 text-xs text-red-600 text-right font-bold border border-gray-300 bg-red-50">
                          {formatAmount(runningBalance)}
                        </td>
                        <td className="px-0.5 py-1.5 text-xs border border-gray-300 bg-white"></td>
                      </tr>
                    );

                    rows.push(
                      <tr key={`closing-2-${groupIndex}`} className="bg-white">
                        <td className="px-2 py-1.5 text-xs text-gray-800 border border-gray-300 bg-green-50"></td>
                        <td className="px-2 py-1.5 text-xs text-gray-800 border border-gray-300 bg-green-50"></td>
                        <td className="px-2 py-1.5 text-xs text-gray-600 border border-gray-300 bg-green-50"></td>
                        <td className="px-2 py-1.5 text-xs text-gray-800 text-right font-medium border border-gray-300 bg-green-50"></td>
                        <td className="px-2 py-1.5 text-xs text-gray-800 border border-gray-300 bg-red-50"></td>
                        <td className="px-2 py-1.5 text-xs text-gray-800 border border-gray-300 bg-red-50"></td>
                        <td className="px-2 py-1.5 text-xs text-gray-600 border border-gray-300 bg-red-50"></td>
                        <td className="px-2 py-1.5 text-xs text-red-600 text-right font-bold border border-gray-300 bg-red-50">
                          {formatAmount(datePayments + runningBalance)}
                        </td>
                        <td className="px-0.5 py-1.5 text-xs border border-gray-300 bg-white"></td>
                      </tr>
                    );

                    // Empty row for spacing
                    rows.push(
                      <tr key={`space-${groupIndex}`} className="bg-white">
                        <td className="px-2 py-1.5 text-xs text-gray-800 border border-gray-300 bg-green-50"></td>
                        <td className="px-2 py-1.5 text-xs text-gray-800 border border-gray-300 bg-green-50"></td>
                        <td className="px-2 py-1.5 text-xs text-gray-600 border border-gray-300 bg-green-50"></td>
                        <td className="px-2 py-1.5 text-xs text-gray-800 text-right font-medium border border-gray-300 bg-green-50"></td>
                        <td className="px-2 py-1.5 text-xs text-gray-800 border border-gray-300 bg-red-50"></td>
                        <td className="px-2 py-1.5 text-xs text-gray-800 border border-gray-300 bg-red-50"></td>
                        <td className="px-2 py-1.5 text-xs text-gray-600 border border-gray-300 bg-red-50"></td>
                        <td className="px-2 py-1.5 text-xs text-gray-800 text-right font-medium border border-gray-300 bg-red-50"></td>
                        <td className="px-0.5 py-1.5 text-xs border border-gray-300 bg-white"></td>
                      </tr>
                    );
                  });

                  return rows;
                })()}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
