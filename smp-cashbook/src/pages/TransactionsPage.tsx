import { useState, useEffect } from 'react';
import EntryForm from '../components/EntryForm';
import type { CashEntry, EntryType, EntryFormData, CBType } from '../types';
import { formatAmount, calculateClosingBalance, getTodayDate, toProperCase } from '../utils/helpers';
import { db } from '../services/database';
import { getFinancialYearDisplay } from '../utils/financialYear';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface TransactionsPageProps {
  selectedFY: string;
  selectedCBType: CBType;
  onNavigate?: (page: 'entry') => void;
}

export default function TransactionsPage({ selectedFY, selectedCBType, onNavigate }: TransactionsPageProps) {
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [editData, setEditData] = useState<{ id: string; type: EntryType; formData: EntryFormData } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'receipt' | 'payment'>('all');
  const [splitView, setSplitView] = useState<boolean>(false);
  const [cbReport2View, setCbReport2View] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [entriesPerPage] = useState<number>(100);

  // Load all entries on mount and when FY or CB Type changes
  useEffect(() => {
    loadEntries();
  }, [selectedFY, selectedCBType]);

  const loadEntries = async () => {
    const allEntries = await db.getAllEntries(selectedFY, selectedCBType);
    setEntries(allEntries);
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

    // Export ALL filtered entries, not just current page
    allFilteredEntries.forEach((entry) => {
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

    if (cbReport2View) {
      // CB Report 2 format - Traditional Cash Book
      // Group ALL filtered entries by date for export
      const groupedByDateForExport = allFilteredEntries.reduce((acc, entry) => {
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

      const tableData: any[] = [];
      let runningBalance = 0;

      const sortedDates = Object.keys(groupedByDateForExport).sort((a, b) => {
        const [dayA, monthA, yearA] = a.split('/').map(Number);
        const [dayB, monthB, yearB] = b.split('/').map(Number);
        const dateA = new Date(2000 + yearA, monthA - 1, dayA);
        const dateB = new Date(2000 + yearB, monthB - 1, dayB);
        return dateA.getTime() - dateB.getTime();
      });

      sortedDates.forEach((date, groupIndex) => {
        const group = groupedByDateForExport[date];
        const dateReceipts = group.receipts.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0);
        const datePayments = group.payments.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0);

        // By Opening Balance row (skip for first date)
        if (groupIndex > 0) {
          tableData.push([
            '',
            '',
            'By Opening Bal',
            formatAmount(runningBalance),
            '',
            '',
            '',
            '',
          ]);
        }

        // Transaction rows
        const maxRows = Math.max(group.receipts.length, group.payments.length);
        for (let i = 0; i < maxRows; i++) {
          const receipt = group.receipts[i];
          const payment = group.payments[i];

          tableData.push([
            receipt?.date || '',
            receipt?.head_of_accounts || '',
            receipt?.notes || '',
            receipt ? formatAmount(receipt.amount) : '',
            payment?.date || '',
            payment?.head_of_accounts || '',
            payment?.notes || '',
            payment ? formatAmount(payment.amount) : '',
          ]);
        }

        // Total row
        const previousBalance = runningBalance;
        const totalReceipts = dateReceipts + (groupIndex > 0 ? previousBalance : 0);
        tableData.push([
          '',
          '',
          'Total',
          formatAmount(totalReceipts),
          date,
          '',
          'Total',
          formatAmount(datePayments),
        ]);

        runningBalance += dateReceipts - datePayments;

        // Closing balance rows
        tableData.push([
          '',
          '',
          '',
          '',
          '',
          '',
          'Closing Bal',
          formatAmount(runningBalance),
        ]);

        tableData.push([
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          formatAmount(datePayments + runningBalance),
        ]);

        // Empty row
        tableData.push(['', '', '', '', '', '', '', '']);
      });

      autoTable(doc, {
        head: [[
          'R.Date',
          'R.Heads',
          'R.Notes',
          'R.Amount',
          'P.Date',
          'P.Heads',
          'P.Notes',
          'P.Amount',
        ]],
        body: tableData,
        startY: 22,
        styles: {
          fontSize: 8,
          cellPadding: 2.5,
          lineColor: [0, 0, 0],
          lineWidth: 0.1,
          minCellHeight: 8,
        },
        headStyles: {
          fillColor: [100, 100, 100],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 9,
        },
        columnStyles: {
          0: { cellWidth: 20 }, // R.Date
          1: { cellWidth: 46 }, // R.Heads
          2: { cellWidth: 46 }, // R.Notes
          3: { cellWidth: 24, halign: 'right' }, // R.Amount
          4: { cellWidth: 20 }, // P.Date
          5: { cellWidth: 46 }, // P.Heads
          6: { cellWidth: 46 }, // P.Notes
          7: { cellWidth: 24, halign: 'right' }, // P.Amount
        },
        didParseCell: (data) => {
          // Remove all default background colors
          if (data.section === 'body') {
            data.cell.styles.fillColor = [255, 255, 255]; // White background
          }

          // Check if any cell in this row contains "Total"
          const rowData = tableData[data.row.index];
          const isTotalRow = rowData && (rowData[2] === 'Total' || rowData[6] === 'Total');

          // Highlight entire Total row with gray background
          if (isTotalRow) {
            data.cell.styles.fillColor = [229, 231, 235]; // Gray
            data.cell.styles.fontStyle = 'bold';
          }

          // Check for special cells
          const cellText = data.cell.text[0];

          // Make "By Opening Bal" bold
          if (cellText === 'By Opening Bal') {
            data.cell.styles.fontStyle = 'bold';
          }

          // Closing Bal styling
          if (cellText === 'Closing Bal') {
            data.cell.styles.fontStyle = 'bold';
          }
        },
      });
    } else {
      // Regular format - Export ALL filtered entries
      const tableData: any[] = [];
      allFilteredEntries.forEach((entry) => {
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
    }

    doc.save(`All_Transactions_${selectedFY}.pdf`);
  };

  // Filter entries based on search and type filter
  const allFilteredEntries = entries
    .filter((entry) => {
      const matchesSearch = searchQuery
        ? entry.head_of_accounts.toLowerCase().includes(searchQuery.toLowerCase()) ||
          entry.notes?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          entry.cheque_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          entry.date.includes(searchQuery)
        : true;

      const matchesType = filterType === 'all' ? true : entry.type === filterType;

      return matchesSearch && matchesType;
    })
    .sort((a, b) => {
      // Sort dates in ascending order (oldest first)
      const [dayA, monthA, yearA] = a.date.split('/').map(Number);
      const [dayB, monthB, yearB] = b.date.split('/').map(Number);
      const dateA = new Date(2000 + yearA, monthA - 1, dayA);
      const dateB = new Date(2000 + yearB, monthB - 1, dayB);
      return dateA.getTime() - dateB.getTime();
    });

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterType, selectedFY, selectedCBType]);

  // Calculate pagination
  const totalPages = Math.ceil(allFilteredEntries.length / entriesPerPage);
  const startIndex = (currentPage - 1) * entriesPerPage;
  const endIndex = startIndex + entriesPerPage;
  const filteredEntries = allFilteredEntries.slice(startIndex, endIndex);

  // Calculate totals for ALL filtered entries (not just current page)
  const totalReceipts = allFilteredEntries
    .filter((e) => e.type === 'receipt')
    .reduce((sum, e) => sum + (typeof e.amount === 'string' ? parseFloat(e.amount) : e.amount), 0);

  const totalPayments = allFilteredEntries
    .filter((e) => e.type === 'payment')
    .reduce((sum, e) => sum + (typeof e.amount === 'string' ? parseFloat(e.amount) : e.amount), 0);

  const netBalance = totalReceipts - totalPayments;

  // Calculate opening balance for current page (balance of all entries before this page)
  const openingBalanceForPage = allFilteredEntries
    .slice(0, startIndex)
    .reduce((balance, entry) => {
      const amount = typeof entry.amount === 'string' ? parseFloat(entry.amount) : entry.amount;
      return entry.type === 'receipt' ? balance + amount : balance - amount;
    }, 0);

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
    // Sort dates in ascending order (oldest first)
    const [dayA, monthA, yearA] = a.split('/').map(Number);
    const [dayB, monthB, yearB] = b.split('/').map(Number);
    const dateA = new Date(2000 + yearA, monthA - 1, dayA);
    const dateB = new Date(2000 + yearB, monthB - 1, dayB);
    return dateA.getTime() - dateB.getTime();
  });

  return (
    <div className="h-full bg-gray-50 flex flex-col">
      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-2 py-1.5 m-2 rounded relative animate-fade-in text-xs">
          <span className="block sm:inline">{successMessage}</span>
        </div>
      )}

      {/* Add New Transaction Button & View Toggle Buttons */}
      {onNavigate && !editData && (
        <div className="mx-2 mt-2 flex gap-2">
          <button
            onClick={() => onNavigate('entry')}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + Add New Transaction
          </button>
          <button
            onClick={() => {
              setSplitView(!splitView);
              if (!splitView) setCbReport2View(false);
            }}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              splitView
                ? 'bg-purple-600 text-white hover:bg-purple-700'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {splitView ? '📊 Split View (On)' : '📊 Split View'}
          </button>
          <button
            onClick={() => {
              setCbReport2View(!cbReport2View);
              if (!cbReport2View) setSplitView(false);
            }}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              cbReport2View
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {cbReport2View ? '📖 CB Report 2 (On)' : '📖 CB Report 2'}
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
            selectedCBType={selectedCBType}
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
              onChange={(e) => setSearchQuery(toProperCase(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
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
              All Transactions ({allFilteredEntries.length} total{allFilteredEntries.length > entriesPerPage ? `, showing ${startIndex + 1}-${Math.min(endIndex, allFilteredEntries.length)}` : ''})
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
          ) : cbReport2View ? (
            // CB Report 2 View - Traditional Cash Book Format
            <table className="w-full border-collapse">
              <thead className="bg-gray-200 sticky top-0 z-10">
                <tr>
                  {/* Receipt Columns */}
                  <th className="px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-300 bg-green-100">
                    R.Date
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-300 bg-green-100">
                    R.Heads
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-300 bg-green-100">
                    R.Notes
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-300 bg-green-100">
                    R.Amount
                  </th>
                  {/* Payment Columns */}
                  <th className="px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-300 bg-red-100">
                    P.Date
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-300 bg-red-100">
                    P.Heads
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-300 bg-red-100">
                    P.Notes
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-300 bg-red-100">
                    P.Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const rows: React.ReactElement[] = [];
                  // Start with opening balance from previous pages
                  let runningBalance = openingBalanceForPage;

                  sortedDates.forEach((date, groupIndex) => {
                    const { receipts, payments } = groupedByDate[date];
                    const dateReceipts = receipts.reduce((sum, e) => sum + (typeof e.amount === 'string' ? parseFloat(e.amount) : e.amount), 0);
                    const datePayments = payments.reduce((sum, e) => sum + (typeof e.amount === 'string' ? parseFloat(e.amount) : e.amount), 0);

                    // Show "By Opening Bal" row if this is not the first date (or if we're on page > 1 and this is the first date on the page)
                    if (groupIndex > 0 || (currentPage > 1 && groupIndex === 0)) {
                      rows.push(
                        <tr key={`by-opening-${groupIndex}`} className="bg-white">
                          <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-green-50"></td>
                          <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-green-50"></td>
                          <td className="px-3 py-1.5 text-xs text-blue-600 font-medium border border-gray-300 bg-green-50">
                            By Opening Bal
                          </td>
                          <td className="px-3 py-1.5 text-xs text-blue-600 text-right font-medium border border-gray-300 bg-green-50">
                            {formatAmount(runningBalance)}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-red-50"></td>
                          <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-red-50"></td>
                          <td className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 bg-red-50"></td>
                          <td className="px-3 py-1.5 text-xs text-gray-800 text-right font-medium border border-gray-300 bg-red-50"></td>
                        </tr>
                      );
                    }

                    // Transaction rows
                    const maxRows = Math.max(receipts.length, payments.length);
                    for (let i = 0; i < maxRows; i++) {
                      const receipt = receipts[i];
                      const payment = payments[i];

                      rows.push(
                        <tr key={`${groupIndex}-${i}`} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-green-50">
                            {receipt?.date || ''}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-green-50">
                            {receipt?.head_of_accounts || ''}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 bg-green-50">
                            {receipt?.notes || ''}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-gray-800 text-right font-medium border border-gray-300 bg-green-50">
                            {receipt ? formatAmount(receipt.amount) : ''}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-red-50">
                            {payment?.date || ''}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-red-50">
                            {payment?.head_of_accounts || ''}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 bg-red-50">
                            {payment?.notes || ''}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-gray-800 text-right font-medium border border-gray-300 bg-red-50">
                            {payment ? formatAmount(payment.amount) : ''}
                          </td>
                        </tr>
                      );
                    }

                    // Calculate total including opening balance for receipts
                    const previousBalance = runningBalance;
                    const totalReceipts = dateReceipts + (groupIndex > 0 ? previousBalance : 0);

                    // Total row (shaded)
                    runningBalance += dateReceipts - datePayments;
                    rows.push(
                      <tr key={`total-${groupIndex}`} className="bg-gray-200">
                        <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300"></td>
                        <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300"></td>
                        <td className="px-3 py-1.5 text-xs text-gray-800 font-semibold border border-gray-300">
                          Total
                        </td>
                        <td className="px-3 py-1.5 text-xs text-gray-800 text-right font-bold border border-gray-300">
                          {formatAmount(totalReceipts)}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300">
                          {date}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300"></td>
                        <td className="px-3 py-1.5 text-xs text-gray-800 font-semibold border border-gray-300">
                          Total
                        </td>
                        <td className="px-3 py-1.5 text-xs text-gray-800 text-right font-bold border border-gray-300">
                          {formatAmount(datePayments)}
                        </td>
                      </tr>
                    );

                    // Closing balance rows
                    rows.push(
                      <tr key={`closing-1-${groupIndex}`} className="bg-white">
                        <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-green-50"></td>
                        <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-green-50"></td>
                        <td className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 bg-green-50"></td>
                        <td className="px-3 py-1.5 text-xs text-gray-800 text-right font-medium border border-gray-300 bg-green-50"></td>
                        <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-red-50"></td>
                        <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-red-50"></td>
                        <td className="px-3 py-1.5 text-xs text-gray-800 font-medium border border-gray-300 bg-red-50">
                          Closing Bal
                        </td>
                        <td className="px-3 py-1.5 text-xs text-red-600 text-right font-bold border border-gray-300 bg-red-50">
                          {formatAmount(runningBalance)}
                        </td>
                      </tr>
                    );

                    rows.push(
                      <tr key={`closing-2-${groupIndex}`} className="bg-white">
                        <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-green-50"></td>
                        <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-green-50"></td>
                        <td className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 bg-green-50"></td>
                        <td className="px-3 py-1.5 text-xs text-gray-800 text-right font-medium border border-gray-300 bg-green-50"></td>
                        <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-red-50"></td>
                        <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-red-50"></td>
                        <td className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 bg-red-50"></td>
                        <td className="px-3 py-1.5 text-xs text-red-600 text-right font-bold border border-gray-300 bg-red-50">
                          {formatAmount(datePayments + runningBalance)}
                        </td>
                      </tr>
                    );

                    // Empty row for spacing
                    rows.push(
                      <tr key={`space-${groupIndex}`} className="bg-white">
                        <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-green-50"></td>
                        <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-green-50"></td>
                        <td className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 bg-green-50"></td>
                        <td className="px-3 py-1.5 text-xs text-gray-800 text-right font-medium border border-gray-300 bg-green-50"></td>
                        <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-red-50"></td>
                        <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-red-50"></td>
                        <td className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 bg-red-50"></td>
                        <td className="px-3 py-1.5 text-xs text-gray-800 text-right font-medium border border-gray-300 bg-red-50"></td>
                      </tr>
                    );
                  });

                  return rows;
                })()}
              </tbody>
            </table>
          ) : splitView ? (
            // Split View - Receipts and Payments side by side
            <div className="p-2">
              {(() => {
                // Start with opening balance from previous pages
                let cumulativeClosingBalance = openingBalanceForPage;
                return sortedDates.map((date) => {
                  const { receipts, payments } = groupedByDate[date];
                  const dateReceipts = receipts.reduce((sum, e) => sum + (typeof e.amount === 'string' ? parseFloat(e.amount) : e.amount), 0);
                  const datePayments = payments.reduce((sum, e) => sum + (typeof e.amount === 'string' ? parseFloat(e.amount) : e.amount), 0);

                  // Calculate closing balance for this date
                  cumulativeClosingBalance += dateReceipts - datePayments;
                  const closingBalance = cumulativeClosingBalance;

                  return (
                    <div key={date} className="mb-4 border border-gray-300 rounded-lg overflow-hidden">
                      {/* Date Header */}
                      <div className="bg-blue-100 border-b border-gray-300 px-3 py-2">
                        <div className="flex justify-between items-center">
                          <h3 className="text-sm font-bold text-gray-800">{date}</h3>
                          <div className="flex gap-4 text-xs">
                            <span className="text-green-700 font-semibold">R: {formatAmount(dateReceipts)}</span>
                            <span className="text-red-700 font-semibold">P: {formatAmount(datePayments)}</span>
                            <span className={`font-bold ${closingBalance >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                              CB: {formatAmount(closingBalance)}
                            </span>
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
                });
              })()}
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
                    Closing Balance
                  </th>
                  <th className="text-center px-3 py-1.5 text-sm font-semibold text-gray-700 border-b border-gray-300 w-24">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry, index) => {
                  // Calculate actual index in the full array for correct closing balance
                  const actualIndex = startIndex + index;
                  const closingBalance = calculateClosingBalance(allFilteredEntries, actualIndex);
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

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="bg-gray-50 border-t border-gray-300 px-3 py-2 flex justify-center items-center gap-4">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-xs text-gray-700">
              Page <span className="font-bold">{currentPage}</span> of <span className="font-bold">{totalPages}</span>
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        )}

        {/* Summary Footer */}
        {allFilteredEntries.length > 0 && (
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
