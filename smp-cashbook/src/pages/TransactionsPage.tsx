import { useState, useEffect } from 'react';
import EntryForm from '../components/EntryForm';
import type { CashEntry, EntryType, EntryFormData } from '../types';
import { formatAmount, calculateRunningBalance, getTodayDate } from '../utils/helpers';
import { db } from '../services/database';
import { getFinancialYearDisplay } from '../utils/financialYear';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface TransactionsPageProps {
  selectedFY: string;
  onNavigate?: (page: 'entry') => void;
}

export default function TransactionsPage({ selectedFY, onNavigate }: TransactionsPageProps) {
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [editData, setEditData] = useState<{ id: string; type: EntryType; formData: EntryFormData } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'receipt' | 'payment'>('all');
  const [splitView, setSplitView] = useState<boolean>(false);

  // Load all entries on mount and when FY changes
  useEffect(() => {
    loadEntries();
  }, [selectedFY]);

  const loadEntries = async () => {
    const allEntries = await db.getAllEntries(selectedFY);
    setEntries(allEntries);
  };

  const handleEdit = (entry: CashEntry) => {
    const formData: EntryFormData = {
      date: entry.date,
      cheque_no: entry.cheque_no || '',
      amount: entry.amount.toString(),
      head_of_accounts: entry.head_of_accounts,
      notes: entry.notes || '',
    };

    setEditData({ id: entry.id, type: entry.type, formData });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async (_type: EntryType, formData: EntryFormData, editId?: string) => {
    try {
      if (editId) {
        await db.updateEntry(editId, formData);
        showSuccessMessage('Entry updated successfully!');
      }

      await loadEntries();
      handleCancel();
    } catch (error) {
      console.error('Error saving entry:', error);
      alert('Failed to save entry. Please try again.');
    }
  };

  const handleDelete = async (id: string, head: string) => {
    if (confirm(`Are you sure you want to delete the entry for "${head}"?`)) {
      try {
        await db.deleteEntry(id);
        showSuccessMessage('Entry deleted successfully!');
        await loadEntries();
      } catch (error) {
        console.error('Error deleting entry:', error);
        alert('Failed to delete entry. Please try again.');
      }
    }
  };

  const handleCancel = () => {
    setEditData(null);
  };

  const showSuccessMessage = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  // Export to CSV
  const exportToCSV = () => {
    let csvContent = 'Date,Type,Cheque No,Amount,Head of Accounts,Notes\n';

    filteredEntries.forEach((entry) => {
      csvContent += `${entry.date},${entry.type === 'receipt' ? 'Receipt' : 'Payment'},${entry.cheque_no || ''},${entry.amount},"${entry.head_of_accounts}","${entry.notes || ''}"\n`;
    });

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `All_Transactions_${selectedFY}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to PDF
  const exportToPDF = () => {
    const doc = new jsPDF('landscape', 'mm', 'a4');

    // Compact header
    doc.setFontSize(14);
    doc.text('All Transactions', 148, 12, { align: 'center' });
    doc.setFontSize(8);
    doc.text(`Sanjay Memorial Polytechnic, Sagar | FY: ${getFinancialYearDisplay(selectedFY)}`, 148, 17, { align: 'center' });

    // Prepare table data
    const tableData: any[] = [];
    filteredEntries.forEach((entry) => {
      tableData.push([
        entry.date,
        entry.type === 'receipt' ? 'R' : 'P',
        entry.cheque_no || '',
        formatAmount(entry.amount),
        entry.head_of_accounts,
        entry.notes || '',
      ]);
    });

    autoTable(doc, {
      head: [['Date', 'Type', 'Cheque No', 'Amount', 'Head of Accounts', 'Notes']],
      body: tableData,
      startY: 22,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [66, 139, 202] },
    });

    // Add totals
    const finalY = (doc as any).lastAutoTable.finalY;
    doc.setFontSize(10);
    doc.text(`Total Receipts: ${formatAmount(totalReceipts)}`, 14, finalY + 10);
    doc.text(`Total Payments: ${formatAmount(totalPayments)}`, 14, finalY + 17);
    doc.text(`Net Balance: ${formatAmount(netBalance)}`, 14, finalY + 24);

    doc.save(`All_Transactions_${selectedFY}.pdf`);
  };

  // Filter entries based on search and type filter
  const filteredEntries = entries.filter((entry) => {
    const matchesSearch = searchQuery
      ? entry.head_of_accounts.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.notes?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.cheque_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.date.includes(searchQuery)
      : true;

    const matchesType = filterType === 'all' ? true : entry.type === filterType;

    return matchesSearch && matchesType;
  });

  // Calculate totals for filtered entries
  const totalReceipts = filteredEntries
    .filter((e) => e.type === 'receipt')
    .reduce((sum, e) => sum + (typeof e.amount === 'string' ? parseFloat(e.amount) : e.amount), 0);

  const totalPayments = filteredEntries
    .filter((e) => e.type === 'payment')
    .reduce((sum, e) => sum + (typeof e.amount === 'string' ? parseFloat(e.amount) : e.amount), 0);

  const netBalance = totalReceipts - totalPayments;

  // Group entries by date for split view
  const groupedByDate = filteredEntries.reduce((acc, entry) => {
    if (!acc[entry.date]) {
      acc[entry.date] = { receipts: [], payments: [] };
    }
    if (entry.type === 'receipt') {
      acc[entry.date].receipts.push(entry);
    } else {
      acc[entry.date].payments.push(entry);
    }
    return acc;
  }, {} as Record<string, { receipts: CashEntry[]; payments: CashEntry[] }>);

  const sortedDates = Object.keys(groupedByDate).sort((a, b) => {
    // Sort dates in descending order (most recent first)
    const [dayA, monthA, yearA] = a.split('/').map(Number);
    const [dayB, monthB, yearB] = b.split('/').map(Number);
    const dateA = new Date(2000 + yearA, monthA - 1, dayA);
    const dateB = new Date(2000 + yearB, monthB - 1, dayB);
    return dateB.getTime() - dateA.getTime();
  });

  return (
    <div className="h-full bg-gray-50 flex flex-col">
      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-2 py-1.5 m-2 rounded relative animate-fade-in text-xs">
          <span className="block sm:inline">{successMessage}</span>
        </div>
      )}

      {/* Add New Transaction Button & Split View Button */}
      {onNavigate && !editData && (
        <div className="mx-2 mt-2 flex gap-2">
          <button
            onClick={() => onNavigate('entry')}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + Add New Transaction
          </button>
          <button
            onClick={() => setSplitView(!splitView)}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              splitView
                ? 'bg-purple-600 text-white hover:bg-purple-700'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {splitView ? '📊 Split View (On)' : '📊 Split View'}
          </button>
        </div>
      )}

      {/* Edit Form (if editing) */}
      {editData && (
        <div className="bg-white shadow-md m-2 rounded-lg p-2 border-l-4 border-blue-500">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            Edit <span className="text-blue-600 capitalize">{editData.type}</span>
          </h3>
          <EntryForm
            selectedType={editData.type}
            initialDate={getTodayDate()}
            editData={{ id: editData.id, formData: editData.formData }}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </div>
      )}

      {/* Filters and Search */}
      <div className="bg-white shadow-sm mx-2 rounded-lg p-2">
        <div className="flex gap-2 items-center">
          {/* Search */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by head of accounts, notes, cheque no, or date..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          {/* Type Filter */}
          <div className="flex gap-1">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                filterType === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterType('receipt')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                filterType === 'receipt'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Receipts
            </button>
            <button
              onClick={() => setFilterType('payment')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                filterType === 'payment'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Payments
            </button>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="flex-1 bg-white shadow-sm mx-2 mb-2 mt-2 rounded-lg flex flex-col min-h-0">
        <div className="bg-gray-100 border-b border-gray-300 px-3 py-1.5 flex justify-between items-center">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">
              All Transactions ({filteredEntries.length})
            </h2>
            <p className="text-xs text-gray-600">FY: {getFinancialYearDisplay(selectedFY)}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportToCSV}
              className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 transition-colors"
            >
              Export CSV
            </button>
            <button
              onClick={exportToPDF}
              className="px-3 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 transition-colors"
            >
              Export PDF
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {filteredEntries.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <p className="text-sm font-medium">No entries found</p>
                <p className="text-xs mt-1">
                  {searchQuery || filterType !== 'all'
                    ? 'Try adjusting your filters'
                    : 'Go to New Entry to add transactions'}
                </p>
              </div>
            </div>
          ) : splitView ? (
            // Split View - Receipts and Payments side by side
            <div className="p-2">
              {sortedDates.map((date) => {
                const { receipts, payments } = groupedByDate[date];
                const dateReceipts = receipts.reduce((sum, e) => sum + (typeof e.amount === 'string' ? parseFloat(e.amount) : e.amount), 0);
                const datePayments = payments.reduce((sum, e) => sum + (typeof e.amount === 'string' ? parseFloat(e.amount) : e.amount), 0);

                return (
                  <div key={date} className="mb-4 border border-gray-300 rounded-lg overflow-hidden">
                    {/* Date Header */}
                    <div className="bg-blue-100 border-b border-gray-300 px-3 py-2">
                      <div className="flex justify-between items-center">
                        <h3 className="text-sm font-bold text-gray-800">{date}</h3>
                        <div className="flex gap-4 text-xs">
                          <span className="text-green-700 font-semibold">R: {formatAmount(dateReceipts)}</span>
                          <span className="text-red-700 font-semibold">P: {formatAmount(datePayments)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Side by Side Tables */}
                    <div className="grid grid-cols-2 gap-0 divide-x divide-gray-300">
                      {/* Receipts Column */}
                      <div className="bg-green-50">
                        <div className="bg-green-200 px-2 py-1 border-b border-green-300">
                          <h4 className="text-xs font-semibold text-green-900">Receipts ({receipts.length})</h4>
                        </div>
                        {receipts.length === 0 ? (
                          <div className="px-2 py-4 text-center text-xs text-gray-500">No receipts</div>
                        ) : (
                          <div className="divide-y divide-green-200">
                            {receipts.map((entry) => (
                              <div key={entry.id} className="px-2 py-1.5 hover:bg-green-100">
                                <div className="flex justify-between items-center mb-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold underline text-gray-800">{entry.head_of_accounts}</span>
                                    <button
                                      onClick={() => handleEdit(entry)}
                                      className="text-blue-600 hover:text-blue-800 text-xs"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleDelete(entry.id, entry.head_of_accounts)}
                                      className="text-red-600 hover:text-red-800 text-xs"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                  <span className="text-xs font-bold text-green-700">{formatAmount(entry.amount)}</span>
                                </div>
                                {entry.cheque_no && (
                                  <div className="text-xs text-gray-600">Ch: {entry.cheque_no}</div>
                                )}
                                {entry.notes && (
                                  <div className="text-xs text-gray-600 truncate">{entry.notes}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Payments Column */}
                      <div className="bg-red-50">
                        <div className="bg-red-200 px-2 py-1 border-b border-red-300">
                          <h4 className="text-xs font-semibold text-red-900">Payments ({payments.length})</h4>
                        </div>
                        {payments.length === 0 ? (
                          <div className="px-2 py-4 text-center text-xs text-gray-500">No payments</div>
                        ) : (
                          <div className="divide-y divide-red-200">
                            {payments.map((entry) => (
                              <div key={entry.id} className="px-2 py-1.5 hover:bg-red-100">
                                <div className="flex justify-between items-center mb-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold underline text-gray-800">{entry.head_of_accounts}</span>
                                    <button
                                      onClick={() => handleEdit(entry)}
                                      className="text-blue-600 hover:text-blue-800 text-xs"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleDelete(entry.id, entry.head_of_accounts)}
                                      className="text-red-600 hover:text-red-800 text-xs"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                  <span className="text-xs font-bold text-red-700">{formatAmount(entry.amount)}</span>
                                </div>
                                {entry.cheque_no && (
                                  <div className="text-xs text-gray-600">Ch: {entry.cheque_no}</div>
                                )}
                                {entry.notes && (
                                  <div className="text-xs text-gray-600 truncate">{entry.notes}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // Regular Table View
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
                    Balance
                  </th>
                  <th className="text-center px-3 py-1.5 text-sm font-semibold text-gray-700 border-b border-gray-300 w-24">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry, index) => {
                  const balance = calculateRunningBalance(filteredEntries, index);
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
                          balance >= 0 ? 'text-green-700' : 'text-red-700'
                        }`}
                      >
                        {formatAmount(balance)}
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

        {/* Summary Footer */}
        {filteredEntries.length > 0 && (
          <div className="bg-gray-100 border-t-2 border-gray-300 px-3 py-1.5 sticky bottom-0">
            <div className="flex justify-end items-center gap-4">
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium text-gray-700">Total Receipts:</span>
                <span className="text-xs font-bold text-green-700">
                  {formatAmount(totalReceipts)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium text-gray-700">Total Payments:</span>
                <span className="text-xs font-bold text-red-700">
                  {formatAmount(totalPayments)}
                </span>
              </div>
              <div className="flex items-center gap-1 pl-2 border-l-2 border-gray-400">
                <span className="text-xs font-medium text-gray-700">Net Balance:</span>
                <span
                  className={`text-sm font-bold ${
                    netBalance >= 0 ? 'text-green-700' : 'text-red-700'
                  }`}
                >
                  {formatAmount(netBalance)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
