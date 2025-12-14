import { useState, useEffect } from 'react';
import EntryForm from '../components/EntryForm';
import type { CashEntry, EntryType, EntryFormData } from '../types';
import { formatAmount, calculateRunningBalance, getTodayDate } from '../utils/helpers';
import { db } from '../services/database';
import { getFinancialYearDisplay } from '../utils/financialYear';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface LedgersPageProps {
  selectedFY: string;
}

interface LedgerSummary {
  name: string;
  type: EntryType;
  total: number;
  count: number;
}

export default function LedgersPage({ selectedFY }: LedgersPageProps) {
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [ledgers, setLedgers] = useState<LedgerSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLedger, setSelectedLedger] = useState<LedgerSummary | null>(null);
  const [ledgerTransactions, setLedgerTransactions] = useState<CashEntry[]>([]);
  const [editData, setEditData] = useState<{ id: string; type: EntryType; formData: EntryFormData } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [sideBySideView, setSideBySideView] = useState<string | null>(null); // Stores ledger name for side-by-side view

  // Load all entries and compute ledgers
  useEffect(() => {
    loadEntries();
  }, [selectedFY]);

  const loadEntries = async () => {
    const allEntries = await db.getAllEntries(selectedFY);
    setEntries(allEntries);
    computeLedgers(allEntries);
  };

  const computeLedgers = (allEntries: CashEntry[]) => {
    const ledgerMap = new Map<string, LedgerSummary>();

    allEntries.forEach((entry) => {
      const key = `${entry.type}-${entry.head_of_accounts}`;
      // Ensure amount is a number
      const amount = typeof entry.amount === 'string' ? parseFloat(entry.amount) : entry.amount;

      if (ledgerMap.has(key)) {
        const ledger = ledgerMap.get(key)!;
        ledger.total += amount;
        ledger.count += 1;
      } else {
        ledgerMap.set(key, {
          name: entry.head_of_accounts,
          type: entry.type,
          total: amount,
          count: 1,
        });
      }
    });

    // Convert to array and sort alphabetically
    const ledgerArray = Array.from(ledgerMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    setLedgers(ledgerArray);
  };

  const handleLedgerClick = (ledger: LedgerSummary) => {
    setSelectedLedger(ledger);
    setEditData(null);

    // Filter transactions for this ledger
    const transactions = entries.filter(
      (entry) => entry.head_of_accounts === ledger.name && entry.type === ledger.type
    );

    // Sort by date (most recent first)
    const sortedTransactions = transactions.sort((a, b) => {
      const dateA = new Date(a.date.split('/').reverse().join('-'));
      const dateB = new Date(b.date.split('/').reverse().join('-'));
      return dateB.getTime() - dateA.getTime();
    });

    setLedgerTransactions(sortedTransactions);

    // Recalculate the ledger total from current entries to ensure accuracy
    const total = transactions.reduce((sum, entry) => {
      const amount = typeof entry.amount === 'string' ? parseFloat(entry.amount) : entry.amount;
      return sum + amount;
    }, 0);

    // Update the selected ledger with the accurate total
    setSelectedLedger({
      ...ledger,
      total: total,
      count: transactions.length
    });
  };

  const handleBackToLedgers = () => {
    setSelectedLedger(null);
    setLedgerTransactions([]);
    setEditData(null);
    setSideBySideView(null);
  };

  const handleSideBySideView = (ledgerName: string) => {
    setSideBySideView(ledgerName);
    setSelectedLedger(null);
    setLedgerTransactions([]);
    setEditData(null);
  };

  // Check if a ledger exists in both receipts and payments
  const ledgerExistsInBoth = (ledgerName: string, filteredLedgersList: LedgerSummary[]) => {
    const hasReceipt = filteredLedgersList.some(l => l.name === ledgerName && l.type === 'receipt');
    const hasPayment = filteredLedgersList.some(l => l.name === ledgerName && l.type === 'payment');
    return hasReceipt && hasPayment;
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

      // Reload all entries and recompute ledgers
      const allEntries = await db.getAllEntries(selectedFY);
      setEntries(allEntries);
      computeLedgers(allEntries);
      handleCancel();

      // Refresh ledger transactions if we're viewing a ledger
      if (selectedLedger) {
        // Find the updated ledger data
        const updatedLedger = allEntries.find(
          (entry) => entry.head_of_accounts === selectedLedger.name && entry.type === selectedLedger.type
        );
        if (updatedLedger) {
          // Recalculate total for this specific ledger
          const ledgerEntries = allEntries.filter(
            (entry) => entry.head_of_accounts === selectedLedger.name && entry.type === selectedLedger.type
          );
          const total = ledgerEntries.reduce((sum, entry) => {
            const amount = typeof entry.amount === 'string' ? parseFloat(entry.amount) : entry.amount;
            return sum + amount;
          }, 0);
          handleLedgerClick({ ...selectedLedger, total, count: ledgerEntries.length });
        }
      }
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

        // Reload all entries and recompute ledgers
        const allEntries = await db.getAllEntries(selectedFY);
        setEntries(allEntries);
        computeLedgers(allEntries);

        // Refresh ledger transactions if we're viewing a ledger
        if (selectedLedger) {
          // Recalculate total for this specific ledger
          const ledgerEntries = allEntries.filter(
            (entry) => entry.head_of_accounts === selectedLedger.name && entry.type === selectedLedger.type
          );

          if (ledgerEntries.length > 0) {
            const total = ledgerEntries.reduce((sum, entry) => {
              const amount = typeof entry.amount === 'string' ? parseFloat(entry.amount) : entry.amount;
              return sum + amount;
            }, 0);
            handleLedgerClick({ ...selectedLedger, total, count: ledgerEntries.length });
          } else {
            // If no more entries for this ledger, go back to ledger list
            handleBackToLedgers();
          }
        }
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

  // Export ledger summary to CSV
  const exportLedgerSummaryToCSV = () => {
    let csvContent = 'Type,Ledger Name,Transaction Count,Total Amount\n';

    filteredLedgers.forEach((ledger) => {
      csvContent += `${ledger.type === 'receipt' ? 'Receipt' : 'Payment'},"${ledger.name}",${ledger.count},${ledger.total}\n`;
    });

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Ledgers_Summary_${selectedFY}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export ledger summary to PDF
  const exportLedgerSummaryToPDF = () => {
    const doc = new jsPDF('landscape', 'mm', 'a4');

    // Compact header in single row
    doc.setFontSize(14);
    doc.text('Ledgers Summary', 148, 12, { align: 'center' });
    doc.setFontSize(8);
    doc.text(`Sanjay Memorial Polytechnic, Sagar | FY: ${getFinancialYearDisplay(selectedFY)}`, 148, 17, { align: 'center' });

    // Separate receipts and payments
    const receiptLedgersData = filteredLedgers.filter(l => l.type === 'receipt');
    const paymentLedgersData = filteredLedgers.filter(l => l.type === 'payment');

    // Prepare side-by-side data
    const maxRows = Math.max(receiptLedgersData.length, paymentLedgersData.length);
    const tableData: any[] = [];

    for (let i = 0; i < maxRows; i++) {
      const receipt = receiptLedgersData[i];
      const payment = paymentLedgersData[i];

      tableData.push([
        receipt?.name || '',
        receipt?.count || '',
        receipt ? formatAmount(receipt.total) : '',
        payment?.name || '',
        payment?.count || '',
        payment ? formatAmount(payment.total) : '',
      ]);
    }

    // Add totals row
    const receiptTotal = receiptLedgersData.reduce((sum, l) => sum + l.total, 0);
    const paymentTotal = paymentLedgersData.reduce((sum, l) => sum + l.total, 0);

    tableData.push([
      'TOTAL',
      '',
      formatAmount(receiptTotal),
      'TOTAL',
      '',
      formatAmount(paymentTotal),
    ]);

    autoTable(doc, {
      head: [['Receipt Ledger', 'Count', 'Total', 'Payment Ledger', 'Count', 'Total']],
      body: tableData,
      startY: 22,
      margin: { left: 10, right: 10 },
      tableWidth: 'auto',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [66, 139, 202], fontStyle: 'bold', fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 20, halign: 'center' },
        2: { cellWidth: 35, halign: 'right' },
        3: { cellWidth: 'auto' },
        4: { cellWidth: 20, halign: 'center' },
        5: { cellWidth: 35, halign: 'right' },
      },
      didParseCell: function(data) {
        // Bold the last row (totals)
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 240, 240];
          data.cell.styles.fontSize = 10;
        }
      }
    });

    doc.save(`Ledgers_Summary_${selectedFY}.pdf`);
  };

  // Export individual ledger transactions to CSV
  const exportLedgerTransactionsToCSV = () => {
    if (!selectedLedger) return;

    let csvContent = 'Date,Type,Cheque No,Amount,Head of Accounts,Notes\n';

    ledgerTransactions.forEach((entry) => {
      csvContent += `${entry.date},${entry.type === 'receipt' ? 'Receipt' : 'Payment'},${entry.cheque_no || ''},${entry.amount},"${entry.head_of_accounts}","${entry.notes || ''}"\n`;
    });

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Ledger_${selectedLedger.name.replace(/[^a-z0-9]/gi, '_')}_${selectedFY}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export individual ledger transactions to PDF
  const exportLedgerTransactionsToPDF = () => {
    if (!selectedLedger) return;

    const doc = new jsPDF('landscape', 'mm', 'a4');

    // Compact header
    doc.setFontSize(14);
    doc.text(`Ledger: ${selectedLedger.name}`, 148, 12, { align: 'center' });
    doc.setFontSize(8);
    doc.text(`Sanjay Memorial Polytechnic, Sagar | ${selectedLedger.type === 'receipt' ? 'Receipt' : 'Payment'} Ledger | FY: ${getFinancialYearDisplay(selectedFY)}`, 148, 17, { align: 'center' });

    // Prepare table data
    const tableData: any[] = [];
    ledgerTransactions.forEach((entry) => {
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

    const finalY = (doc as any).lastAutoTable.finalY;
    doc.setFontSize(10);
    doc.text(`Total: ${formatAmount(selectedLedger.total)}`, 14, finalY + 10);
    doc.text(`Transactions: ${selectedLedger.count}`, 14, finalY + 17);

    doc.save(`Ledger_${selectedLedger.name.replace(/[^a-z0-9]/gi, '_')}_${selectedFY}.pdf`);
  };

  // Export side-by-side view to CSV
  const exportSideBySideToCSV = (receiptTrans: CashEntry[], paymentTrans: CashEntry[], ledgerName: string) => {
    let csvContent = 'R.Date,R.Chq,R.Amount,R.Notes,P.Date,P.Chq,P.Amount,P.Notes\n';

    const maxRows = Math.max(receiptTrans.length, paymentTrans.length);
    for (let i = 0; i < maxRows; i++) {
      const receipt = receiptTrans[i];
      const payment = paymentTrans[i];

      // Receipt columns
      if (receipt) {
        csvContent += `${receipt.date},${receipt.cheque_no || ''},${receipt.amount},"${receipt.notes || ''}",`;
      } else {
        csvContent += ',,,,';
      }

      // Payment columns
      if (payment) {
        csvContent += `${payment.date},${payment.cheque_no || ''},${payment.amount},"${payment.notes || ''}"`;
      } else {
        csvContent += ',,,';
      }

      csvContent += '\n';
    }

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Ledger_SideBySide_${ledgerName.replace(/[^a-z0-9]/gi, '_')}_${selectedFY}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export side-by-side view to PDF
  const exportSideBySideToPDF = (receiptTrans: CashEntry[], paymentTrans: CashEntry[], ledgerName: string, receiptTotal: number, paymentTotal: number) => {
    const doc = new jsPDF('landscape', 'mm', 'a4');

    // Compact header
    doc.setFontSize(14);
    doc.text(`Ledger: ${ledgerName} (Side by Side)`, 148, 12, { align: 'center' });
    doc.setFontSize(8);
    doc.text(`Sanjay Memorial Polytechnic, Sagar | FY: ${getFinancialYearDisplay(selectedFY)}`, 148, 17, { align: 'center' });

    // Prepare table data
    const tableData: any[] = [];
    const maxRows = Math.max(receiptTrans.length, paymentTrans.length);

    for (let i = 0; i < maxRows; i++) {
      const receipt = receiptTrans[i];
      const payment = paymentTrans[i];

      tableData.push([
        receipt?.date || '',
        receipt?.cheque_no || '',
        receipt ? formatAmount(receipt.amount) : '',
        receipt?.notes || '',
        payment?.date || '',
        payment?.cheque_no || '',
        payment ? formatAmount(payment.amount) : '',
        payment?.notes || '',
      ]);
    }

    autoTable(doc, {
      head: [['R.Date', 'R.Chq', 'R.Amount', 'R.Notes', 'P.Date', 'P.Chq', 'P.Amount', 'P.Notes']],
      body: tableData,
      startY: 22,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [66, 139, 202] },
    });

    const finalY = (doc as any).lastAutoTable.finalY;
    doc.setFontSize(10);
    doc.text(`Receipts Total: ${formatAmount(receiptTotal)}`, 14, finalY + 10);
    doc.text(`Payments Total: ${formatAmount(paymentTotal)}`, 14, finalY + 17);
    doc.text(`Net (R - P): ${formatAmount(receiptTotal - paymentTotal)}`, 14, finalY + 24);

    doc.save(`Ledger_SideBySide_${ledgerName.replace(/[^a-z0-9]/gi, '_')}_${selectedFY}.pdf`);
  };

  // Filter ledgers based on search
  const filteredLedgers = ledgers.filter((ledger) =>
    ledger.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const receiptLedgers = filteredLedgers.filter((l) => l.type === 'receipt');
  const paymentLedgers = filteredLedgers.filter((l) => l.type === 'payment');

  const totalReceipts = receiptLedgers.reduce((sum, l) => sum + l.total, 0);
  const totalPayments = paymentLedgers.reduce((sum, l) => sum + l.total, 0);

  // Render side-by-side view
  if (sideBySideView) {
    const receiptTransactions = entries
      .filter((entry) => entry.head_of_accounts === sideBySideView && entry.type === 'receipt')
      .sort((a, b) => {
        const dateA = new Date(a.date.split('/').reverse().join('-'));
        const dateB = new Date(b.date.split('/').reverse().join('-'));
        return dateB.getTime() - dateA.getTime();
      });

    const paymentTransactions = entries
      .filter((entry) => entry.head_of_accounts === sideBySideView && entry.type === 'payment')
      .sort((a, b) => {
        const dateA = new Date(a.date.split('/').reverse().join('-'));
        const dateB = new Date(b.date.split('/').reverse().join('-'));
        return dateB.getTime() - dateA.getTime();
      });

    const receiptTotal = receiptTransactions.reduce((sum, entry) => {
      const amount = typeof entry.amount === 'string' ? parseFloat(entry.amount) : entry.amount;
      return sum + amount;
    }, 0);

    const paymentTotal = paymentTransactions.reduce((sum, entry) => {
      const amount = typeof entry.amount === 'string' ? parseFloat(entry.amount) : entry.amount;
      return sum + amount;
    }, 0);

    return (
      <div className="h-full bg-gray-50 flex flex-col">
        {/* Success Message */}
        {successMessage && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-2 py-1.5 m-2 rounded relative animate-fade-in text-xs">
            <span className="block sm:inline">{successMessage}</span>
          </div>
        )}

        {/* Header with Back Button */}
        <div className="bg-white shadow-sm mx-2 mt-2 rounded-lg p-2">
          <div className="flex justify-between items-start mb-2">
            <button
              onClick={handleBackToLedgers}
              className="px-3 py-1 bg-gray-600 text-white rounded text-xs font-medium hover:bg-gray-700 transition-colors"
            >
              ← Back to Ledgers
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => exportSideBySideToCSV(receiptTransactions, paymentTransactions, sideBySideView)}
                className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 transition-colors"
              >
                Export CSV
              </button>
              <button
                onClick={() => exportSideBySideToPDF(receiptTransactions, paymentTransactions, sideBySideView, receiptTotal, paymentTotal)}
                className="px-3 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 transition-colors"
              >
                Export PDF
              </button>
            </div>
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-800">{sideBySideView}</h2>
            <p className="text-xs text-gray-600">
              Side by Side View • FY: {getFinancialYearDisplay(selectedFY)}
            </p>
          </div>
        </div>

        {/* Two-column layout for transactions */}
        <div className="flex-1 mx-2 mb-2 mt-2 flex gap-2 min-h-0">
          {/* Receipt Transactions */}
          <div className="flex-1 bg-white shadow-sm rounded-lg flex flex-col min-h-0">
            <div className="bg-green-100 border-b-2 border-green-300 px-3 py-1.5">
              <h3 className="text-sm font-semibold text-green-800">
                Receipts ({receiptTransactions.length})
              </h3>
              <p className="text-xs text-green-700">
                Total: {formatAmount(receiptTotal)}
              </p>
            </div>
            <div className="flex-1 overflow-auto">
              {receiptTransactions.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <p className="text-sm">No receipt transactions</p>
                </div>
              ) : (
                <table className="w-full border-collapse">
                  <thead className="bg-gray-200 sticky top-0 z-10">
                    <tr>
                      <th className="text-left px-2 py-1 text-xs font-semibold text-gray-700 border-b border-gray-300">
                        Date
                      </th>
                      <th className="text-left px-2 py-1 text-xs font-semibold text-gray-700 border-b border-gray-300">
                        Cheque No
                      </th>
                      <th className="text-right px-2 py-1 text-xs font-semibold text-gray-700 border-b border-gray-300">
                        Amount
                      </th>
                      <th className="text-left px-2 py-1 text-xs font-semibold text-gray-700 border-b border-gray-300">
                        Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiptTransactions.map((entry) => (
                      <tr
                        key={entry.id}
                        className="bg-green-50 hover:opacity-80 border-b border-gray-200"
                      >
                        <td className="px-2 py-1 text-xs text-gray-800">{entry.date}</td>
                        <td className="px-2 py-1 text-xs text-gray-700">
                          {entry.cheque_no || '-'}
                        </td>
                        <td className="px-2 py-1 text-xs text-gray-800 text-right font-medium">
                          {formatAmount(entry.amount)}
                        </td>
                        <td className="px-2 py-1 text-xs text-gray-600 truncate">
                          {entry.notes || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Payment Transactions */}
          <div className="flex-1 bg-white shadow-sm rounded-lg flex flex-col min-h-0">
            <div className="bg-red-100 border-b-2 border-red-300 px-3 py-1.5">
              <h3 className="text-sm font-semibold text-red-800">
                Payments ({paymentTransactions.length})
              </h3>
              <p className="text-xs text-red-700">
                Total: {formatAmount(paymentTotal)}
              </p>
            </div>
            <div className="flex-1 overflow-auto">
              {paymentTransactions.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <p className="text-sm">No payment transactions</p>
                </div>
              ) : (
                <table className="w-full border-collapse">
                  <thead className="bg-gray-200 sticky top-0 z-10">
                    <tr>
                      <th className="text-left px-2 py-1 text-xs font-semibold text-gray-700 border-b border-gray-300">
                        Date
                      </th>
                      <th className="text-left px-2 py-1 text-xs font-semibold text-gray-700 border-b border-gray-300">
                        Cheque No
                      </th>
                      <th className="text-right px-2 py-1 text-xs font-semibold text-gray-700 border-b border-gray-300">
                        Amount
                      </th>
                      <th className="text-left px-2 py-1 text-xs font-semibold text-gray-700 border-b border-gray-300">
                        Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentTransactions.map((entry) => (
                      <tr
                        key={entry.id}
                        className="bg-red-50 hover:opacity-80 border-b border-gray-200"
                      >
                        <td className="px-2 py-1 text-xs text-gray-800">{entry.date}</td>
                        <td className="px-2 py-1 text-xs text-gray-700">
                          {entry.cheque_no || '-'}
                        </td>
                        <td className="px-2 py-1 text-xs text-gray-800 text-right font-medium">
                          {formatAmount(entry.amount)}
                        </td>
                        <td className="px-2 py-1 text-xs text-gray-600 truncate">
                          {entry.notes || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Net Summary */}
        <div className="bg-white shadow-sm mx-2 mb-2 rounded-lg p-2">
          <div className="flex justify-center items-center gap-6">
            <div className="text-center">
              <p className="text-xs text-gray-600">Receipts</p>
              <p className="text-base font-bold text-green-700">{formatAmount(receiptTotal)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-600">Payments</p>
              <p className="text-base font-bold text-red-700">{formatAmount(paymentTotal)}</p>
            </div>
            <div className="text-center border-l-2 border-gray-300 pl-6">
              <p className="text-xs text-gray-600">Net (R - P)</p>
              <p className={`text-lg font-bold ${receiptTotal - paymentTotal >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatAmount(receiptTotal - paymentTotal)}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render ledger list view
  if (!selectedLedger) {
    return (
      <div className="h-full bg-gray-50 flex flex-col">
        {/* Success Message */}
        {successMessage && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-2 py-1.5 m-2 rounded relative animate-fade-in text-xs">
            <span className="block sm:inline">{successMessage}</span>
          </div>
        )}

        {/* Search Bar */}
        <div className="bg-white shadow-sm mx-2 mt-2 rounded-lg p-2">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search ledgers by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={exportLedgerSummaryToCSV}
                className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 transition-colors"
              >
                Export CSV
              </button>
              <button
                onClick={exportLedgerSummaryToPDF}
                className="px-3 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 transition-colors"
              >
                Export PDF
              </button>
            </div>
          </div>
          <div className="mt-1 text-xs text-gray-600">
            FY: {getFinancialYearDisplay(selectedFY)}
          </div>
        </div>

        {/* Two-column layout for ledgers */}
        <div className="flex-1 mx-2 mb-2 mt-2 flex gap-2 min-h-0">
          {/* Receipt Ledgers */}
          <div className="flex-1 bg-white shadow-sm rounded-lg flex flex-col min-h-0">
            <div className="bg-green-100 border-b-2 border-green-300 px-3 py-1.5">
              <h2 className="text-sm font-semibold text-green-800">
                Receipt Ledgers ({receiptLedgers.length})
              </h2>
              <p className="text-xs text-green-700">
                Total: {formatAmount(totalReceipts)}
              </p>
            </div>
            <div className="flex-1 overflow-auto">
              {receiptLedgers.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <p className="text-sm">
                    {searchQuery ? 'No matching receipt ledgers' : 'No receipt ledgers'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {receiptLedgers.map((ledger, index) => (
                    <div key={index} className="px-3 py-2 hover:bg-green-50 transition-colors">
                      <div className="flex justify-between items-start gap-2">
                        <button
                          onClick={() => handleLedgerClick(ledger)}
                          className="flex-1 text-left"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-gray-800">
                                  {ledger.name}
                                </p>
                                {ledgerExistsInBoth(ledger.name, filteredLedgers) && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSideBySideView(ledger.name);
                                    }}
                                    className="px-2 py-0.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition-colors"
                                  >
                                    View Side by Side
                                  </button>
                                )}
                              </div>
                              <p className="text-xs text-gray-600">
                                {ledger.count} transaction{ledger.count !== 1 ? 's' : ''}
                              </p>
                            </div>
                            <p className="text-sm font-bold text-green-700 ml-2">
                              {formatAmount(ledger.total)}
                            </p>
                          </div>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Payment Ledgers */}
          <div className="flex-1 bg-white shadow-sm rounded-lg flex flex-col min-h-0">
            <div className="bg-red-100 border-b-2 border-red-300 px-3 py-1.5">
              <h2 className="text-sm font-semibold text-red-800">
                Payment Ledgers ({paymentLedgers.length})
              </h2>
              <p className="text-xs text-red-700">
                Total: {formatAmount(totalPayments)}
              </p>
            </div>
            <div className="flex-1 overflow-auto">
              {paymentLedgers.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <p className="text-sm">
                    {searchQuery ? 'No matching payment ledgers' : 'No payment ledgers'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {paymentLedgers.map((ledger, index) => (
                    <div key={index} className="px-3 py-2 hover:bg-red-50 transition-colors">
                      <div className="flex justify-between items-start gap-2">
                        <button
                          onClick={() => handleLedgerClick(ledger)}
                          className="flex-1 text-left"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-gray-800">
                                  {ledger.name}
                                </p>
                                {ledgerExistsInBoth(ledger.name, filteredLedgers) && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSideBySideView(ledger.name);
                                    }}
                                    className="px-2 py-0.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition-colors"
                                  >
                                    View Side by Side
                                  </button>
                                )}
                              </div>
                              <p className="text-xs text-gray-600">
                                {ledger.count} transaction{ledger.count !== 1 ? 's' : ''}
                              </p>
                            </div>
                            <p className="text-sm font-bold text-red-700 ml-2">
                              {formatAmount(ledger.total)}
                            </p>
                          </div>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render individual ledger transactions view
  return (
    <div className="h-full bg-gray-50 flex flex-col">
      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-2 py-1.5 m-2 rounded relative animate-fade-in text-xs">
          <span className="block sm:inline">{successMessage}</span>
        </div>
      )}

      {/* Back Button and Ledger Info */}
      <div className="bg-white shadow-sm mx-2 mt-2 rounded-lg p-2">
        <div className="flex justify-between items-start mb-2">
          <button
            onClick={handleBackToLedgers}
            className="px-3 py-1 bg-gray-600 text-white rounded text-xs font-medium hover:bg-gray-700 transition-colors"
          >
            ← Back to Ledgers
          </button>
          <div className="flex gap-2">
            <button
              onClick={exportLedgerTransactionsToCSV}
              className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 transition-colors"
            >
              Export CSV
            </button>
            <button
              onClick={exportLedgerTransactionsToPDF}
              className="px-3 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 transition-colors"
            >
              Export PDF
            </button>
          </div>
        </div>
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-base font-bold text-gray-800">{selectedLedger.name}</h2>
            <p className="text-xs text-gray-600">
              {selectedLedger.type === 'receipt' ? 'Receipt' : 'Payment'} Ledger • FY: {getFinancialYearDisplay(selectedFY)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-gray-700">Total Amount</p>
            <p className={`text-lg font-bold ${selectedLedger.type === 'receipt' ? 'text-green-700' : 'text-red-700'}`}>
              {formatAmount(selectedLedger.total)}
            </p>
            <p className="text-xs text-gray-600">
              {selectedLedger.count} transaction{selectedLedger.count !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

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

      {/* Transactions Table */}
      <div className="flex-1 bg-white shadow-sm mx-2 mb-2 mt-2 rounded-lg flex flex-col min-h-0">
        <div className="bg-gray-100 border-b border-gray-300 px-3 py-1.5">
          <h3 className="text-sm font-semibold text-gray-800">
            Transactions ({ledgerTransactions.length})
          </h3>
        </div>

        <div className="flex-1 overflow-auto">
          {ledgerTransactions.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <p className="text-sm">No transactions found</p>
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
                    Balance
                  </th>
                  <th className="text-center px-3 py-1.5 text-sm font-semibold text-gray-700 border-b border-gray-300 w-24">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {ledgerTransactions.map((entry, index) => {
                  const balance = calculateRunningBalance(ledgerTransactions, index);
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
      </div>
    </div>
  );
}
