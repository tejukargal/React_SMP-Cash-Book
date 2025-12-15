import type { AppPage, CBType } from '../types';

interface SidebarProps {
  currentPage: AppPage;
  onNavigate: (page: AppPage) => void;
  selectedCBType: CBType;
}

export default function Sidebar({ currentPage, onNavigate, selectedCBType }: SidebarProps) {
  const menuItems = [
    { id: 'dashboard' as AppPage, label: 'Dashboard', icon: '🏠' },
    { id: 'entry' as AppPage, label: 'New Entry', icon: '➕' },
    { id: 'transactions' as AppPage, label: 'All Transactions', icon: '📊' },
    { id: 'ledgers' as AppPage, label: 'Ledgers', icon: '📖' },
    { id: 'import' as AppPage, label: 'Import Fee Data', icon: '📥' },
    { id: 'salary-import' as AppPage, label: 'Import Salary Data', icon: '💰' },
    { id: 'transaction-import' as AppPage, label: 'Import Transactions', icon: '📤' },
    { id: 'reports' as AppPage, label: 'Reports', icon: '📈' },
    { id: 'settings' as AppPage, label: 'Settings', icon: '⚙️' },
  ];

  return (
    <aside className="w-48 bg-gradient-to-b from-blue-700 to-blue-900 text-white flex flex-col shadow-2xl">
      {/* Logo/Title */}
      <div className="p-3 border-b border-blue-600">
        <h2 className="text-sm font-bold">SMP Cash Book</h2>
        <p className="text-[10px] text-blue-200 mt-0.5">Sanjay Memorial Polytechnic</p>
      </div>

      {/* CB Type Indicator */}
      <div className="px-3 py-2 bg-blue-800 border-b border-blue-600">
        <p className="text-[10px] text-blue-200 mb-1">Cashbook Type:</p>
        <div className="flex items-center gap-1">
          <span className="text-xs font-semibold">
            {selectedCBType === 'aided' && '🟢 Aided'}
            {selectedCBType === 'unaided' && '🟡 Unaided'}
            {selectedCBType === 'both' && '🔵 Both (Combined)'}
          </span>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 py-2">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-full text-left px-3 py-2.5 flex items-center gap-2 transition-all duration-200 text-sm ${
              currentPage === item.id
                ? 'bg-blue-600 border-l-4 border-white font-semibold'
                : 'hover:bg-blue-800 border-l-4 border-transparent'
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-blue-600 text-center text-[10px] text-blue-200">
        <p>&copy; 2025 SMP Sagar</p>
      </div>
    </aside>
  );
}
