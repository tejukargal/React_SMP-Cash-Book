import { useState } from 'react';
import Sidebar from './components/Sidebar';
import EntryPage from './pages/EntryPage';
import TransactionsPage from './pages/TransactionsPage';
import LedgersPage from './pages/LedgersPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import FeeImportPage from './pages/FeeImportPage';
import SalaryImportPage from './pages/SalaryImportPage';
import type { AppPage } from './types';
import { getCurrentFinancialYear } from './utils/financialYear';

function App() {
  const [currentPage, setCurrentPage] = useState<AppPage>('entry');
  const [selectedFY, setSelectedFY] = useState<string>(() => {
    return localStorage.getItem('selectedFinancialYear') || getCurrentFinancialYear();
  });

  const handleNavigate = (page: AppPage) => {
    setCurrentPage(page);
  };

  const handleFinancialYearChange = (fy: string) => {
    setSelectedFY(fy);
    // Refresh data when FY changes
    if (currentPage === 'entry' || currentPage === 'transactions' || currentPage === 'ledgers' || currentPage === 'reports') {
      // This will cause a re-render with new FY
      setCurrentPage(currentPage);
    }
  };

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      {/* Sidebar */}
      <Sidebar currentPage={currentPage} onNavigate={handleNavigate} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-blue-600 text-white py-2 px-4 shadow-md">
          <h1 className="text-lg font-bold">
            {currentPage === 'entry' && 'New Entry'}
            {currentPage === 'transactions' && 'All Transactions'}
            {currentPage === 'ledgers' && 'Ledgers'}
            {currentPage === 'reports' && 'Reports & Analytics'}
            {currentPage === 'settings' && 'Settings'}
            {currentPage === 'import' && 'Import Fee Data'}
            {currentPage === 'salary-import' && 'Import Salary Data'}
          </h1>
          <p className="text-xs text-blue-100">
            {currentPage === 'entry' && 'Create new receipt or payment entries'}
            {currentPage === 'transactions' && 'View, edit, and manage all transactions'}
            {currentPage === 'ledgers' && 'View receipt and payment ledgers with transaction details'}
            {currentPage === 'reports' && 'Financial reports and analytics'}
            {currentPage === 'settings' && 'Configure application settings'}
            {currentPage === 'import' && 'Import student fee collection data from CSV files'}
            {currentPage === 'salary-import' && 'Import staff salary data from CSV files'}
          </p>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto">
          {currentPage === 'entry' && <EntryPage selectedFY={selectedFY} onNavigate={handleNavigate} />}
          {currentPage === 'transactions' && <TransactionsPage selectedFY={selectedFY} onNavigate={handleNavigate} />}
          {currentPage === 'ledgers' && <LedgersPage selectedFY={selectedFY} />}
          {currentPage === 'reports' && <ReportsPage selectedFY={selectedFY} />}
          {currentPage === 'settings' && <SettingsPage onFinancialYearChange={handleFinancialYearChange} />}
          {currentPage === 'import' && <FeeImportPage />}
          {currentPage === 'salary-import' && <SalaryImportPage />}
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
