import type { CashEntry } from '../types';
import { formatAmount, calculateRunningBalance } from '../utils/helpers';

interface EntriesTableProps {
  entries: CashEntry[];
  onEdit: (entry: CashEntry) => void;
  onDelete: (id: string) => void;
}

export default function EntriesTable({ entries, onEdit, onDelete }: EntriesTableProps) {
  const handleDelete = (id: string, head: string) => {
    if (confirm(`Are you sure you want to delete the entry for "${head}"?`)) {
      onDelete(id);
    }
  };

  // Calculate totals
  const totalReceipts = entries
    .filter(e => e.type === 'receipt')
    .reduce((sum, e) => sum + (typeof e.amount === 'string' ? parseFloat(e.amount) : e.amount), 0);

  const totalPayments = entries
    .filter(e => e.type === 'payment')
    .reduce((sum, e) => sum + (typeof e.amount === 'string' ? parseFloat(e.amount) : e.amount), 0);

  const netBalance = totalReceipts - totalPayments;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-gray-100 border-b border-gray-300 px-4 py-2">
        <h2 className="text-lg font-semibold text-gray-800">
          Cash Book Entries - Sanjay Memorial Polytechnic, Sagar
        </h2>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-auto">
        {entries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <p className="text-lg font-medium">No entries yet</p>
              <p className="text-sm mt-1">Click Receipt or Payment to add your first entry</p>
            </div>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="bg-gray-200 sticky top-0 z-10">
              <tr>
                <th className="text-left px-4 py-2 text-sm font-semibold text-gray-700 border-b border-gray-300">
                  Date
                </th>
                <th className="text-left px-4 py-2 text-sm font-semibold text-gray-700 border-b border-gray-300">
                  Type
                </th>
                <th className="text-left px-4 py-2 text-sm font-semibold text-gray-700 border-b border-gray-300">
                  Cheque No
                </th>
                <th className="text-right px-4 py-2 text-sm font-semibold text-gray-700 border-b border-gray-300">
                  Amount
                </th>
                <th className="text-left px-4 py-2 text-sm font-semibold text-gray-700 border-b border-gray-300">
                  Head of Accounts
                </th>
                <th className="text-left px-4 py-2 text-sm font-semibold text-gray-700 border-b border-gray-300">
                  Notes
                </th>
                <th className="text-right px-4 py-2 text-sm font-semibold text-gray-700 border-b border-gray-300">
                  Balance
                </th>
                <th className="text-center px-4 py-2 text-sm font-semibold text-gray-700 border-b border-gray-300 w-24">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => {
                const balance = calculateRunningBalance(entries, index);
                const rowBgColor =
                  entry.type === 'receipt' ? 'bg-green-50' : 'bg-red-50';

                return (
                  <tr
                    key={entry.id}
                    className={`${rowBgColor} hover:opacity-80 transition-opacity duration-150 border-b border-gray-200`}
                    style={{ height: '36px' }}
                  >
                    <td className="px-4 py-1 text-sm text-gray-800">{entry.date}</td>
                    <td className="px-4 py-1 text-sm">
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
                    <td className="px-4 py-1 text-sm text-gray-700">
                      {entry.cheque_no || '-'}
                    </td>
                    <td className="px-4 py-1 text-sm text-gray-800 text-right font-medium">
                      {formatAmount(entry.amount)}
                    </td>
                    <td className="px-4 py-1 text-sm text-gray-800">
                      {entry.head_of_accounts}
                    </td>
                    <td className="px-4 py-1 text-sm text-gray-600 truncate max-w-xs">
                      {entry.notes || '-'}
                    </td>
                    <td
                      className={`px-4 py-1 text-sm text-right font-semibold ${
                        balance >= 0 ? 'text-green-700' : 'text-red-700'
                      }`}
                    >
                      {formatAmount(balance)}
                    </td>
                    <td className="px-4 py-1 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => onEdit(entry)}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium transition-colors duration-150"
                          title="Edit"
                        >
                          Edit
                        </button>
                        <span className="text-gray-300">|</span>
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
      {entries.length > 0 && (
        <div className="bg-gray-100 border-t-2 border-gray-300 px-4 py-3 sticky bottom-0">
          <div className="flex justify-end items-center gap-8">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Total Receipts:</span>
              <span className="text-sm font-bold text-green-700">
                {formatAmount(totalReceipts)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Total Payments:</span>
              <span className="text-sm font-bold text-red-700">
                {formatAmount(totalPayments)}
              </span>
            </div>
            <div className="flex items-center gap-2 pl-4 border-l-2 border-gray-400">
              <span className="text-sm font-medium text-gray-700">Net Balance:</span>
              <span
                className={`text-base font-bold ${
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
  );
}
