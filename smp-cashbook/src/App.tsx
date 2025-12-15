import { useState } from 'react';
import Sidebar from './components/Sidebar';
import DashboardPage from './pages/DashboardPage';
import EntryPage from './pages/EntryPage';
import TransactionsPage from './pages/TransactionsPage';
import LedgersPage from './pages/LedgersPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import FeeImportPage from './pages/FeeImportPage';
import SalaryImportPage from './pages/SalaryImportPage';
import TransactionImportPage from './pages/TransactionImportPage';
import type { AppPage, CBType } from './types';
import { getCurrentFinancialYear } from './utils/financialYear';

function App() {
  const [currentPage, setCurrentPage] = useState<AppPage>('dashboard');
  const [selectedFY, setSelectedFY] = useState<string>(() => {
    return localStorage.getItem('selectedFinancialYear') || getCurrentFinancialYear();
  });
  const [selectedCBType, setSelectedCBType] = useState<CBType>(() => {
    return (localStorage.getItem('selectedCBType') as CBType) || 'both';
  });
  const [successMessage, setSuccessMessage] = useState<string>('');

  const handleNavigate = (page: AppPage) => {
    setCurrentPage(page);
  };

  const handleFinancialYearChange = (fy: string) => {
    setSelectedFY(fy);
    // Refresh data when FY changes
    if (currentPage === 'dashboard' || currentPage === 'entry' || currentPage === 'transactions' || currentPage === 'ledgers' || currentPage === 'reports' || currentPage === 'transaction-import') {
      // This will cause a re-render with new FY
      setCurrentPage(currentPage);
    }
  };

  const handleCBTypeChange = (cbType: CBType) => {
    setSelectedCBType(cbType);
    localStorage.setItem('selectedCBType', cbType);
    // Refresh data when CB Type changes
    if (currentPage === 'dashboard' || currentPage === 'entry' || currentPage === 'transactions' || currentPage === 'ledgers' || currentPage === 'reports' || currentPage === 'transaction-import') {
      // This will cause a re-render with new CB Type
      setCurrentPage(currentPage);
    }
  };

  const handleSuccessMessage = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => {
      setSuccessMessage('');
    }, 3000);
  };

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      {/* Sidebar */}
      <Sidebar currentPage={currentPage} onNavigate={handleNavigate} selectedCBType={selectedCBType} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-blue-600 text-white py-2 px-4 shadow-md">
          <h1 className="text-lg font-bold">
            {currentPage === 'dashboard' && 'Dashboard'}
            {currentPage === 'entry' && (successMessage || 'New Entry')}
            {currentPage === 'transactions' && 'All Transactions'}
            {currentPage === 'ledgers' && 'Ledgers'}
            {currentPage === 'reports' && 'Reports & Analytics'}
            {currentPage === 'settings' && 'Settings'}
            {currentPage === 'import' && 'Import Fee Data'}
            {currentPage === 'salary-import' && 'Import Salary Data'}
            {currentPage === 'transaction-import' && 'Import Transaction Data'}
          </h1>
          <p className="text-xs text-blue-100 h-4">
            {currentPage === 'dashboard' && 'Overview of your cash book with summaries and quick search'}
            {currentPage === 'entry' && (successMessage ? '\u00A0' : 'Create new receipt or payment entries')}
            {currentPage === 'transactions' && 'View, edit, and manage all transactions'}
            {currentPage === 'ledgers' && 'View receipt and payment ledgers with transaction details'}
            {currentPage === 'reports' && 'Financial reports and analytics'}
            {currentPage === 'settings' && 'Configure application settings'}
            {currentPage === 'import' && 'Import student fee collection data from CSV files'}
            {currentPage === 'salary-import' && 'Import staff salary data from CSV files'}
            {currentPage === 'transaction-import' && 'Import bulk transaction data from CB Report 1 format CSV files'}
          </p>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto">
          {currentPage === 'dashboard' && <DashboardPage selectedFY={selectedFY} selectedCBType={selectedCBType} onNavigate={handleNavigate} />}
          {currentPage === 'entry' && <EntryPage selectedFY={selectedFY} selectedCBType={selectedCBType} onNavigate={handleNavigate} onSuccessMessage={handleSuccessMessage} />}
          {currentPage === 'transactions' && <TransactionsPage selectedFY={selectedFY} selectedCBType={selectedCBType} onNavigate={handleNavigate} />}
          {currentPage === 'ledgers' && <LedgersPage selectedFY={selectedFY} selectedCBType={selectedCBType} />}
          {currentPage === 'reports' && <ReportsPage selectedFY={selectedFY} selectedCBType={selectedCBType} />}
          {currentPage === 'settings' && <SettingsPage onFinancialYearChange={handleFinancialYearChange} onCBTypeChange={handleCBTypeChange} selectedCBType={selectedCBType} />}
          {currentPage === 'import' && <FeeImportPage selectedCBType={selectedCBType} />}
          {currentPage === 'salary-import' && <SalaryImportPage selectedCBType={selectedCBType} />}
          {currentPage === 'transaction-import' && <TransactionImportPage selectedFY={selectedFY} selectedCBType={selectedCBType} />}
        </div>

        {/* Footer */}
        <footer className="bg-gray-800 text-gray-300 py-1.5 px-4 text-center text-xs">
          <p>Sanjay Memorial Polytechnic, Sagar - Cash Book &copy; 2025</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
