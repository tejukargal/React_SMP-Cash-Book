import { useState, useEffect } from 'react';
import type { CashEntry, CBType } from '../types';
import { formatAmount, toProperCase } from '../utils/helpers';
import { db } from '../services/database';
import { getFinancialYearDisplay } from '../utils/financialYear';

interface DashboardPageProps {
  selectedFY: string;
  selectedCBType: CBType;
  onNavigate?: (page: 'transactions' | 'ledgers') => void;
}

interface DashboardStats {
  totalReceipts: number;
  totalPayments: number;
  totalReceiptAmount: number;
  totalPaymentAmount: number;
  closingBalance: number;
  todayEntries: number;
  thisWeekEntries: number;
  thisMonthEntries: number;
}

export default function DashboardPage({ selectedFY, selectedCBType, onNavigate }: DashboardPageProps) {
  const [stats, setStats] = useState<DashboardStats>({
    totalReceipts: 0,
    totalPayments: 0,
    totalReceiptAmount: 0,
    totalPaymentAmount: 0,
    closingBalance: 0,
    todayEntries: 0,
    thisWeekEntries: 0,
    thisMonthEntries: 0,
  });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<CashEntry[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadDashboardData();
  }, [selectedFY, selectedCBType]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      // Get entries filtered by selected FY and CB Type to match transactions page
      const entries = await db.getAllEntries(selectedFY, selectedCBType);

      // Calculate stats - properly parse amounts (they might be strings)
      const receipts = entries.filter(e => e.type === 'receipt');
      const payments = entries.filter(e => e.type === 'payment');

      const totalReceiptAmount = receipts.reduce((sum, e) => sum + (typeof e.amount === 'string' ? parseFloat(e.amount) : e.amount), 0);
      const totalPaymentAmount = payments.reduce((sum, e) => sum + (typeof e.amount === 'string' ? parseFloat(e.amount) : e.amount), 0);

      // Calculate closing balance - should match the net balance from transactions page
      const closingBalance = totalReceiptAmount - totalPaymentAmount;

      // Get today's date in dd/mm/yy format
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const yy = String(today.getFullYear()).slice(-2);
      const todayStr = `${dd}/${mm}/${yy}`;

      // Get week start (last Monday)
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay() + 1);

      // Count entries
      const todayEntries = entries.filter(e => e.date === todayStr).length;
      const thisWeekEntries = entries.filter(e => {
        const [day, month, year] = e.date.split('/').map(Number);
        const entryDate = new Date(2000 + year, month - 1, day);
        return entryDate >= weekStart && entryDate <= today;
      }).length;
      const thisMonthEntries = entries.filter(e => {
        const [, month, year] = e.date.split('/');
        return month === mm && year === yy;
      }).length;

      setStats({
        totalReceipts: receipts.length,
        totalPayments: payments.length,
        totalReceiptAmount,
        totalPaymentAmount,
        closingBalance,
        todayEntries,
        thisWeekEntries,
        thisMonthEntries,
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    try {
      setIsSearching(true);
      const allEntries = await db.getAllEntries(selectedFY);

      const results = allEntries.filter((entry) => {
        const query = searchQuery.toLowerCase();
        return (
          entry.head_of_accounts.toLowerCase().includes(query) ||
          entry.notes?.toLowerCase().includes(query) ||
          entry.cheque_no?.toLowerCase().includes(query) ||
          entry.date.includes(searchQuery) ||
          entry.amount.toString().includes(searchQuery)
        );
      });

      setSearchResults(results);
    } catch (error) {
      console.error('Error searching:', error);
    }
  };

  const handleSearchKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setIsSearching(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="p-3 bg-gray-50 h-full overflow-auto">
      {/* Header */}
      <div className="mb-3">
        <h2 className="text-lg font-bold text-gray-800">Dashboard Overview</h2>
        <p className="text-xs text-gray-600">Financial Year: {getFinancialYearDisplay(selectedFY)}</p>
      </div>

      {/* Summary Cards - Compact */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
        {/* Total Receipts Card */}
        <div className="bg-white rounded shadow p-2 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-600 uppercase font-medium">Total Receipts</p>
              <p className="text-lg font-bold text-gray-800">{stats.totalReceipts}</p>
              <p className="text-xs text-green-600 font-medium">{formatAmount(stats.totalReceiptAmount)}</p>
            </div>
            <div className="bg-green-100 rounded-full p-1.5">
              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
          </div>
        </div>

        {/* Total Payments Card */}
        <div className="bg-white rounded shadow p-2 border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-600 uppercase font-medium">Total Payments</p>
              <p className="text-lg font-bold text-gray-800">{stats.totalPayments}</p>
              <p className="text-xs text-red-600 font-medium">{formatAmount(stats.totalPaymentAmount)}</p>
            </div>
            <div className="bg-red-100 rounded-full p-1.5">
              <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </div>
          </div>
        </div>

        {/* Closing Balance Card */}
        <div className={`bg-white rounded shadow p-2 border-l-4 ${stats.closingBalance >= 0 ? 'border-blue-500' : 'border-orange-500'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-600 uppercase font-medium">Closing Balance</p>
              <p className={`text-lg font-bold ${stats.closingBalance >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                {formatAmount(stats.closingBalance)}
              </p>
              <p className="text-[10px] text-gray-500">
                {stats.closingBalance >= 0 ? 'Positive Balance' : 'Deficit'}
              </p>
            </div>
            <div className={`${stats.closingBalance >= 0 ? 'bg-blue-100' : 'bg-orange-100'} rounded-full p-1.5`}>
              <svg className={`w-4 h-4 ${stats.closingBalance >= 0 ? 'text-blue-600' : 'text-orange-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Total Entries Card */}
        <div className="bg-white rounded shadow p-2 border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-600 uppercase font-medium">Total Entries</p>
              <p className="text-lg font-bold text-gray-800">{stats.totalReceipts + stats.totalPayments}</p>
              <p className="text-[10px] text-gray-500">All transactions</p>
            </div>
            <div className="bg-purple-100 rounded-full p-1.5">
              <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Activity Stats - Compact */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
        <div className="bg-white rounded shadow p-2">
          <p className="text-xs text-gray-600 font-medium">Today's Entries</p>
          <p className="text-xl font-bold text-gray-800 mt-1">{stats.todayEntries}</p>
        </div>
        <div className="bg-white rounded shadow p-2">
          <p className="text-xs text-gray-600 font-medium">This Week's Entries</p>
          <p className="text-xl font-bold text-gray-800 mt-1">{stats.thisWeekEntries}</p>
        </div>
        <div className="bg-white rounded shadow p-2">
          <p className="text-xs text-gray-600 font-medium">This Month's Entries</p>
          <p className="text-xl font-bold text-gray-800 mt-1">{stats.thisMonthEntries}</p>
        </div>
      </div>

      {/* Search Section - Compact */}
      <div className="bg-white rounded shadow p-3 mb-3 flex-1 flex flex-col overflow-hidden">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">Search Transactions & Ledgers</h3>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            placeholder="Search by head of account, notes, cheque no, date, or amount..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(toProperCase(e.target.value))}
            onKeyPress={handleSearchKeyPress}
            className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button
            onClick={handleSearch}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition-colors"
          >
            Search
          </button>
          {isSearching && (
            <button
              onClick={clearSearch}
              className="px-3 py-1.5 bg-gray-600 text-white rounded text-xs font-medium hover:bg-gray-700 transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* Search Results - Scrollable with 5 visible rows */}
        {isSearching && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <p className="text-xs text-gray-600 mb-2">
              Found {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
            </p>

            {searchResults.length > 0 ? (
              <div className="border border-gray-300 rounded overflow-hidden flex flex-col" style={{ maxHeight: '200px' }}>
                <div className="overflow-y-auto">
                  <table className="w-full">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-gray-700">Date</th>
                        <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-gray-700">Type</th>
                        <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-gray-700">Cheque No</th>
                        <th className="text-right px-2 py-1.5 text-[10px] font-semibold text-gray-700">Amount</th>
                        <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-gray-700">Head of Accounts</th>
                        <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-gray-700">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchResults.map((entry) => (
                        <tr
                          key={entry.id}
                          className={`border-t ${
                            entry.type === 'receipt' ? 'bg-green-50' : 'bg-red-50'
                          } hover:opacity-80`}
                          style={{ height: '32px' }}
                        >
                          <td className="px-2 py-1 text-xs text-gray-800">{entry.date}</td>
                          <td className="px-2 py-1 text-xs">
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                entry.type === 'receipt'
                                  ? 'bg-green-200 text-green-800'
                                  : 'bg-red-200 text-red-800'
                              }`}
                            >
                              {entry.type === 'receipt' ? 'R' : 'P'}
                            </span>
                          </td>
                          <td className="px-2 py-1 text-xs text-gray-700">{entry.cheque_no || '-'}</td>
                          <td className="px-2 py-1 text-xs text-gray-800 text-right font-medium">
                            {formatAmount(entry.amount)}
                          </td>
                          <td className="px-2 py-1 text-xs text-gray-800">{entry.head_of_accounts}</td>
                          <td className="px-2 py-1 text-xs text-gray-600 truncate max-w-xs">
                            {entry.notes || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-500 text-center py-3">No results found for "{searchQuery}"</p>
            )}
          </div>
        )}
      </div>

      {/* Quick Links - Compact */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <button
          onClick={() => onNavigate?.('transactions')}
          className="bg-white rounded shadow p-3 hover:shadow-md transition-shadow text-left"
        >
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-gray-800">View All Transactions</h4>
              <p className="text-xs text-gray-600 mt-0.5">Browse complete transaction history</p>
            </div>
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>

        <button
          onClick={() => onNavigate?.('ledgers')}
          className="bg-white rounded shadow p-3 hover:shadow-md transition-shadow text-left"
        >
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-gray-800">View Ledgers</h4>
              <p className="text-xs text-gray-600 mt-0.5">Separate receipt and payment ledgers</p>
            </div>
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      </div>
    </div>
  );
}
