import { useState, useEffect } from 'react';
import { db } from '../services/database';
import type { CashEntry, CBType } from '../types';
import { formatAmount } from '../utils/helpers';
import { getFinancialYearDisplay } from '../utils/financialYear';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ReportsPageProps {
  selectedFY: string;
  selectedCBType: CBType;
}

type ReportType = 'cb-report-1' | 'cb-report-2';

interface GroupedEntry {
  date: string;
  receipts: CashEntry[];
  payments: CashEntry[];
}

export default function ReportsPage({ selectedFY, selectedCBType }: ReportsPageProps) {
  const [selectedReport, setSelectedReport] = useState<ReportType>('cb-report-1');
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEntries();
  }, [selectedFY, selectedCBType]);

  const loadEntries = async () => {
    setLoading(true);
    try {
      const allEntries = await db.getAllEntries(selectedFY, selectedCBType);
      setEntries(allEntries);
    } catch (error) {
      console.error('Error loading entries:', error);
    } finally {
      setLoading(false);
    }
  };

  // Group entries by date
  const groupEntriesByDate = (): GroupedEntry[] => {
    const grouped: { [date: string]: GroupedEntry } = {};

    entries.forEach((entry) => {
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

    // Convert to array and sort by date (oldest first)
    return Object.values(grouped).sort((a, b) => {
      const dateA = parseDate(a.date);
      const dateB = parseDate(b.date);
      return dateA.getTime() - dateB.getTime();
    });
  };

  // Parse date from dd/mm/yy format
  const parseDate = (dateStr: string): Date => {
    const [day, month, year] = dateStr.split('/').map(Number);
    return new Date(2000 + year, month - 1, day);
  };

  // Export to CSV
  const exportToCSV = () => {
    const groupedData = groupEntriesByDate();
    let csvContent = '';

    if (selectedReport === 'cb-report-1') {
      // CB Report 1 format
      csvContent = 'Sl No,R.Date,R.Chq,R.Amount,R.Heads,R.Notes,P.Date,P.Chq,P.Amount,P.Heads,P.Notes\n';

      let slNo = 1;
      groupedData.forEach((group) => {
        const maxRows = Math.max(group.receipts.length, group.payments.length);

        for (let i = 0; i < maxRows; i++) {
          const receipt = group.receipts[i];
          const payment = group.payments[i];

          csvContent += `${slNo},`;

          // Receipt columns
          if (receipt) {
            csvContent += `${receipt.date},${receipt.cheque_no || ''},${receipt.amount},"${receipt.head_of_accounts}","${receipt.notes || ''}",`;
          } else {
            csvContent += ',,,,,';
          }

          // Payment columns
          if (payment) {
            csvContent += `${payment.date},${payment.cheque_no || ''},${payment.amount},"${payment.head_of_accounts}","${payment.notes || ''}"`;
          } else {
            csvContent += ',,,,';
          }

          csvContent += '\n';
          slNo++;
        }
      });
    } else {
      // CB Report 2 format
      csvContent = 'R.Date,R.Heads,R.Notes,R.Amount,P.Date,P.Heads,P.Notes,P.Amount\n';

      let runningBalance = 0;
      const sortedGroupedData = [...groupedData].sort((a, b) => {
        const dateA = parseDate(a.date);
        const dateB = parseDate(b.date);
        return dateA.getTime() - dateB.getTime();
      });

      sortedGroupedData.forEach((group, groupIndex) => {
        const dateReceipts = group.receipts.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0);
        const datePayments = group.payments.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0);

        // By Opening Balance row
        if (groupIndex > 0) {
          csvContent += `,,"By Opening Bal",${formatAmount(runningBalance)},,,,\n`;
        }

        // Transaction rows
        const maxRows = Math.max(group.receipts.length, group.payments.length);
        for (let i = 0; i < maxRows; i++) {
          const receipt = group.receipts[i];
          const payment = group.payments[i];

          csvContent += `${receipt?.date || ''},"${receipt?.head_of_accounts || ''}","${receipt?.notes || ''}",${receipt ? formatAmount(receipt.amount) : ''},`;
          csvContent += `${payment?.date || ''},"${payment?.head_of_accounts || ''}","${payment?.notes || ''}",${payment ? formatAmount(payment.amount) : ''}\n`;
        }

        // Total row
        const previousBalance = runningBalance;
        const totalReceipts = dateReceipts + (groupIndex > 0 ? previousBalance : 0);
        csvContent += `,,"Total",${formatAmount(totalReceipts)},${group.date},,"Total",${formatAmount(datePayments)}\n`;

        runningBalance += dateReceipts - datePayments;

        // Closing balance rows
        csvContent += `,,,,,,,"Closing Bal",${formatAmount(runningBalance)}\n`;
        csvContent += `,,,,,,,${formatAmount(datePayments + runningBalance)}\n`;
        csvContent += `,,,,,,,,\n`; // Empty row
      });
    }

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Cash_Book_Report_${selectedReport}_${selectedFY}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to PDF
  const exportToPDF = () => {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const groupedData = groupEntriesByDate();

    // Title
    doc.setFontSize(16);
    doc.text('Cash Book Report', 148, 15, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Sanjay Memorial Polytechnic, Sagar`, 148, 22, { align: 'center' });
    doc.text(`Financial Year: ${getFinancialYearDisplay(selectedFY)}`, 148, 28, { align: 'center' });

    if (selectedReport === 'cb-report-1') {
      // CB Report 1 format
      const tableData: any[] = [];
      let slNo = 1;

      groupedData.forEach((group) => {
        const maxRows = Math.max(group.receipts.length, group.payments.length);

        for (let i = 0; i < maxRows; i++) {
          const receipt = group.receipts[i];
          const payment = group.payments[i];

          tableData.push([
            slNo,
            receipt?.date || '',
            receipt?.cheque_no || '',
            receipt ? formatAmount(receipt.amount) : '',
            receipt?.head_of_accounts || '',
            receipt?.notes || '',
            payment?.date || '',
            payment?.cheque_no || '',
            payment ? formatAmount(payment.amount) : '',
            payment?.head_of_accounts || '',
            payment?.notes || '',
          ]);
          slNo++;
        }
      });

      // Calculate totals
      const totalReceipts = entries
        .filter(e => e.type === 'receipt')
        .reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0);

      const totalPayments = entries
        .filter(e => e.type === 'payment')
        .reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0);

      // Add totals row
      tableData.push([
        '',
        '',
        'Total:',
        formatAmount(totalReceipts),
        '',
        '',
        '',
        'Total:',
        formatAmount(totalPayments),
        '',
        '',
      ]);

      autoTable(doc, {
        head: [[
          'Sl No',
          'R.Date',
          'R.Chq',
          'R.Amount',
          'R.Heads',
          'R.Notes',
          'P.Date',
          'P.Chq',
          'P.Amount',
          'P.Heads',
          'P.Notes',
        ]],
        body: tableData,
        startY: 35,
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
          0: { cellWidth: 12 }, // Sl No
          1: { cellWidth: 18 }, // R.Date
          2: { cellWidth: 16 }, // R.Chq
          3: { cellWidth: 22, halign: 'right' }, // R.Amount
          4: { cellWidth: 38 }, // R.Heads
          5: { cellWidth: 32 }, // R.Notes
          6: { cellWidth: 18 }, // P.Date
          7: { cellWidth: 16 }, // P.Chq
          8: { cellWidth: 22, halign: 'right' }, // P.Amount
          9: { cellWidth: 38 }, // P.Heads
          10: { cellWidth: 32 }, // P.Notes
        },
        didParseCell: (data) => {
          // Remove all default background colors
          if (data.section === 'body') {
            data.cell.styles.fillColor = [255, 255, 255]; // White background
          }

          // Highlight only the total row (last row)
          if (data.row.index === tableData.length - 1) {
            data.cell.styles.fillColor = [229, 231, 235]; // Gray
            data.cell.styles.fontStyle = 'bold';
          }
        },
      });
    } else {
      // CB Report 2 format
      const tableData: any[] = [];
      let runningBalance = 0;

      const sortedGroupedData = [...groupedData].sort((a, b) => {
        const dateA = parseDate(a.date);
        const dateB = parseDate(b.date);
        return dateA.getTime() - dateB.getTime();
      });

      sortedGroupedData.forEach((group, groupIndex) => {
        const dateReceipts = group.receipts.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0);
        const datePayments = group.payments.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0);

        // By Opening Balance row
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
          group.date,
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
        startY: 35,
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
    }

    doc.save(`Cash_Book_Report_${selectedReport}_${selectedFY}.pdf`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-gray-600">Loading reports...</p>
        </div>
      </div>
    );
  }

  const groupedData = groupEntriesByDate();

  return (
    <div className="h-full bg-gray-50 flex flex-col">
      {/* Header with Report Type Dropdown and Export Buttons */}
      <div className="bg-white shadow-sm mx-2 mt-2 rounded-lg p-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <label className="text-sm font-semibold text-gray-700">Report Type:</label>
            <select
              value={selectedReport}
              onChange={(e) => setSelectedReport(e.target.value as ReportType)}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="cb-report-1">CB Report 1 - Cash Book Format</option>
              <option value="cb-report-2">CB Report 2 - Traditional Cash Book</option>
            </select>
          </div>

          <div className="flex gap-2">
            <button
              onClick={exportToCSV}
              className="px-4 py-1.5 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              <span>📊</span> Export CSV
            </button>
            <button
              onClick={exportToPDF}
              className="px-4 py-1.5 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700 transition-colors flex items-center gap-2"
            >
              <span>📄</span> Export PDF
            </button>
          </div>
        </div>
      </div>

      {/* Report Content */}
      <div className="flex-1 bg-white shadow-sm mx-2 my-2 rounded-lg overflow-hidden flex flex-col">
        <div className="bg-gray-100 border-b border-gray-300 px-4 py-2">
          <h2 className="text-lg font-semibold text-gray-800">
            Cash Book Report - Sanjay Memorial Polytechnic, Sagar
          </h2>
          <p className="text-sm text-gray-600">FY: {getFinancialYearDisplay(selectedFY)}</p>
        </div>

        <div className="flex-1 overflow-auto">
          {entries.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <p className="text-lg font-medium">No entries found</p>
                <p className="text-sm mt-1">Add some transactions to generate reports</p>
              </div>
            </div>
          ) : selectedReport === 'cb-report-1' ? (
            <table className="w-full border-collapse">
              <thead className="bg-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="px-2 py-2 text-xs font-semibold text-gray-700 border border-gray-300">
                    Sl No
                  </th>
                  {/* Receipt Columns (Green) */}
                  <th className="px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-300 bg-green-100">
                    R.Date
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-300 bg-green-100">
                    R.Chq
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-300 bg-green-100">
                    R.Amount
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-300 bg-green-100">
                    R.Heads
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-300 bg-green-100">
                    R.Notes
                  </th>
                  {/* Payment Columns (Red) */}
                  <th className="px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-300 bg-red-100">
                    P.Date
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-300 bg-red-100">
                    P.Chq
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-300 bg-red-100">
                    P.Amount
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-300 bg-red-100">
                    P.Heads
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-300 bg-red-100">
                    P.Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let slNo = 1;
                  return groupedData.map((group, groupIndex) => {
                    const maxRows = Math.max(group.receipts.length, group.payments.length);
                    const rows = [];

                    // Date header row
                    rows.push(
                      <tr key={`date-${groupIndex}`} className="bg-blue-50">
                        <td
                          colSpan={11}
                          className="px-3 py-1.5 text-sm font-semibold text-blue-800 border border-gray-300"
                        >
                          📅 {group.date}
                        </td>
                      </tr>
                    );

                    // Transaction rows for this date
                    for (let i = 0; i < maxRows; i++) {
                      const receipt = group.receipts[i];
                      const payment = group.payments[i];

                      rows.push(
                        <tr key={`${groupIndex}-${i}`} className="hover:bg-gray-50">
                          <td className="px-2 py-1.5 text-xs text-center text-gray-700 border border-gray-300">
                            {slNo}
                          </td>
                          {/* Receipt columns */}
                          <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-green-50">
                            {receipt?.date || ''}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 bg-green-50">
                            {receipt?.cheque_no || ''}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-gray-800 text-right font-medium border border-gray-300 bg-green-50">
                            {receipt ? formatAmount(receipt.amount) : ''}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-green-50">
                            {receipt?.head_of_accounts || ''}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 bg-green-50">
                            {receipt?.notes || ''}
                          </td>
                          {/* Payment columns */}
                          <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-red-50">
                            {payment?.date || ''}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 bg-red-50">
                            {payment?.cheque_no || ''}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-gray-800 text-right font-medium border border-gray-300 bg-red-50">
                            {payment ? formatAmount(payment.amount) : ''}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-red-50">
                            {payment?.head_of_accounts || ''}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 bg-red-50">
                            {payment?.notes || ''}
                          </td>
                        </tr>
                      );
                      slNo++;
                    }

                    return rows;
                  });
                })()}
              </tbody>
            </table>
          ) : (
            /* CB Report 2 - Traditional Cash Book Format */
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
                  let runningBalance = 0;

                  // Sort grouped data by date (oldest first for cashbook)
                  const sortedGroupedData = [...groupedData].sort((a, b) => {
                    const dateA = parseDate(a.date);
                    const dateB = parseDate(b.date);
                    return dateA.getTime() - dateB.getTime();
                  });

                  sortedGroupedData.forEach((group, groupIndex) => {
                    const dateReceipts = group.receipts.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0);
                    const datePayments = group.payments.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0);

                    // First date: Show opening balance
                    if (groupIndex === 0 && runningBalance !== 0) {
                      rows.push(
                        <tr key="opening-balance" className="bg-white">
                          <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-green-50">
                            {group.date}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-green-50">
                            AA Opening Balance
                          </td>
                          <td className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 bg-green-50">
                            Opening Balance as on date
                          </td>
                          <td className="px-3 py-1.5 text-xs text-blue-600 text-right font-medium border border-gray-300 bg-green-50">
                            {formatAmount(runningBalance)}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-red-50">
                            {group.date}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-gray-800 border border-gray-300 bg-red-50"></td>
                          <td className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 bg-red-50"></td>
                          <td className="px-3 py-1.5 text-xs text-gray-800 text-right font-medium border border-gray-300 bg-red-50"></td>
                        </tr>
                      );
                    }

                    // Show "By Opening Bal" row if this is not the first date
                    if (groupIndex > 0) {
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
                    const maxRows = Math.max(group.receipts.length, group.payments.length);
                    for (let i = 0; i < maxRows; i++) {
                      const receipt = group.receipts[i];
                      const payment = group.payments[i];

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
                          {group.date}
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
          )}
        </div>

        {/* Summary Footer */}
        {entries.length > 0 && (
          <div className="bg-gray-100 border-t-2 border-gray-300 px-4 py-3 sticky bottom-0">
            <div className="flex justify-end items-center gap-8">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Total Receipts:</span>
                <span className="text-sm font-bold text-green-700">
                  {formatAmount(
                    entries
                      .filter((e) => e.type === 'receipt')
                      .reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0)
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Total Payments:</span>
                <span className="text-sm font-bold text-red-700">
                  {formatAmount(
                    entries
                      .filter((e) => e.type === 'payment')
                      .reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0)
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2 pl-4 border-l-2 border-gray-400">
                <span className="text-sm font-medium text-gray-700">Net Balance:</span>
                <span
                  className={`text-base font-bold ${
                    entries
                      .filter((e) => e.type === 'receipt')
                      .reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0) -
                      entries
                        .filter((e) => e.type === 'payment')
                        .reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0) >=
                    0
                      ? 'text-green-700'
                      : 'text-red-700'
                  }`}
                >
                  {formatAmount(
                    entries
                      .filter((e) => e.type === 'receipt')
                      .reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0) -
                      entries
                        .filter((e) => e.type === 'payment')
                        .reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0)
                  )}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
