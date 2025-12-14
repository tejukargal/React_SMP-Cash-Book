import { useState, useEffect } from 'react';
import { getCurrentFinancialYear, generateFinancialYears, getFinancialYearDisplay } from '../utils/financialYear';
import { db } from '../services/database';

interface SettingsPageProps {
  onFinancialYearChange?: (fy: string) => void;
}

export default function SettingsPage({ onFinancialYearChange }: SettingsPageProps) {
  const [selectedFY, setSelectedFY] = useState<string>(() => {
    // Load from localStorage or use current FY
    return localStorage.getItem('selectedFinancialYear') || getCurrentFinancialYear();
  });

  const [successMessage, setSuccessMessage] = useState<string>('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [deletePassword, setDeletePassword] = useState<string>('');
  const [deleteError, setDeleteError] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const financialYears = generateFinancialYears(5, 2);

  useEffect(() => {
    // Notify parent component about FY change
    if (onFinancialYearChange) {
      onFinancialYearChange(selectedFY);
    }
  }, [selectedFY, onFinancialYearChange]);

  const handleFYChange = (fy: string) => {
    setSelectedFY(fy);
    localStorage.setItem('selectedFinancialYear', fy);
    showSuccessMessage(`Financial Year changed to ${getFinancialYearDisplay(fy)}`);
  };

  const showSuccessMessage = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const handleDeleteAllData = async () => {
    if (deletePassword !== 'teju2015') {
      setDeleteError('Incorrect password. Please try again.');
      return;
    }

    setIsDeleting(true);
    setDeleteError('');

    try {
      await db.deleteAllEntries();
      setShowDeleteConfirm(false);
      setDeletePassword('');
      showSuccessMessage('All data has been deleted successfully');
    } catch (error) {
      console.error('Failed to delete data:', error);
      setDeleteError('Failed to delete data. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
    setDeletePassword('');
    setDeleteError('');
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 p-4">
      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-3 py-2 mb-4 rounded text-sm">
          {successMessage}
        </div>
      )}

      {/* Settings Card */}
      <div className="bg-white shadow-md rounded-lg p-6 max-w-2xl">
        <h2 className="text-xl font-bold text-gray-800 mb-6">Application Settings</h2>

        {/* Financial Year Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-3">Financial Year</h3>
          <p className="text-sm text-gray-600 mb-4">
            Select the financial year to view and manage transactions. The financial year runs from April 1st to March 31st.
          </p>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current Financial Year:
              </label>
              <div className="flex flex-wrap gap-2">
                {financialYears.map((fy) => (
                  <button
                    key={fy}
                    onClick={() => handleFYChange(fy)}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      selectedFY === fy
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {getFinancialYearDisplay(fy)}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                <strong>Selected FY:</strong> {getFinancialYearDisplay(selectedFY)}
              </p>
              <p className="text-xs text-blue-600 mt-1">
                Period: April 1, 20{selectedFY.split('-')[0]} to March 31, 20{selectedFY.split('-')[1]}
              </p>
            </div>
          </div>
        </div>

        {/* Database Info Section */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="text-lg font-semibold text-gray-700 mb-3">Database Information</h3>
          <div className="bg-gray-50 p-4 rounded-md">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Database:</p>
                <p className="font-medium text-gray-800">Nile (smp_cashbook)</p>
              </div>
              <div>
                <p className="text-gray-600">Status:</p>
                <p className="font-medium text-green-600">Connected</p>
              </div>
            </div>
          </div>
        </div>

        {/* Application Info Section */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h3 className="text-lg font-semibold text-gray-700 mb-3">Application Information</h3>
          <div className="bg-gray-50 p-4 rounded-md">
            <div className="text-sm space-y-2">
              <p className="text-gray-600">
                <strong>Name:</strong> SMP Cash Book
              </p>
              <p className="text-gray-600">
                <strong>Institution:</strong> Sanjay Memorial Polytechnic, Sagar
              </p>
              <p className="text-gray-600">
                <strong>Version:</strong> 1.0.0
              </p>
              <p className="text-gray-600">
                <strong>Year:</strong> &copy; 2025
              </p>
            </div>
          </div>
        </div>

        {/* Danger Zone Section */}
        <div className="mt-6 pt-6 border-t border-red-200">
          <h3 className="text-lg font-semibold text-red-700 mb-3">Danger Zone</h3>
          <div className="bg-red-50 border border-red-200 p-4 rounded-md">
            <p className="text-sm text-red-800 mb-4">
              <strong>Warning:</strong> This action will permanently delete all cash entries from the database. This cannot be undone!
            </p>

            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 transition-colors"
              >
                Reset All Data
              </button>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-red-900 mb-2">
                    Enter password to confirm deletion:
                  </label>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full px-3 py-2 border border-red-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    disabled={isDeleting}
                  />
                  {deleteError && (
                    <p className="text-sm text-red-600 mt-2">{deleteError}</p>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleDeleteAllData}
                    disabled={isDeleting || !deletePassword}
                    className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {isDeleting ? 'Deleting...' : 'Confirm Delete All Data'}
                  </button>
                  <button
                    onClick={handleCancelDelete}
                    disabled={isDeleting}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-400 transition-colors disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
