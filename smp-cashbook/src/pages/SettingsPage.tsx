import { useState, useEffect } from 'react';
import { getCurrentFinancialYear, generateFinancialYears, getFinancialYearDisplay } from '../utils/financialYear';
import { db } from '../services/database';
import type { CBType } from '../types';
import { useDeleteAllEntries, useAllEntries } from '../hooks/useCashEntries';

interface SettingsPageProps {
  onFinancialYearChange?: (fy: string) => void;
  onCBTypeChange?: (cbType: CBType) => void;
  selectedCBType: CBType;
}

export default function SettingsPage({ onFinancialYearChange, onCBTypeChange, selectedCBType }: SettingsPageProps) {
  const [selectedFY, setSelectedFY] = useState<string>(() => {
    // Load from localStorage or use current FY
    return localStorage.getItem('selectedFinancialYear') || getCurrentFinancialYear();
  });

  const [localCBType, setLocalCBType] = useState<CBType>(selectedCBType);

  const [successMessage, setSuccessMessage] = useState<string>('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [deletePassword, setDeletePassword] = useState<string>('');
  const [deleteError, setDeleteError] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [restoreError, setRestoreError] = useState<string>('');
  const financialYears = generateFinancialYears(5, 2);

  // React Query hooks
  const deleteAllMutation = useDeleteAllEntries();
  const { data: backupEntries = [] } = useAllEntries(undefined, localCBType);

  useEffect(() => {
    // Notify parent component about FY change
    if (onFinancialYearChange) {
      onFinancialYearChange(selectedFY);
    }
  }, [selectedFY, onFinancialYearChange]);

  useEffect(() => {
    // Sync local CB Type with prop changes
    setLocalCBType(selectedCBType);
  }, [selectedCBType]);

  const handleFYChange = (fy: string) => {
    setSelectedFY(fy);
    localStorage.setItem('selectedFinancialYear', fy);
    showSuccessMessage(`Financial Year changed to ${getFinancialYearDisplay(fy)}`);
  };

  const handleCBTypeChange = (cbType: CBType) => {
    setLocalCBType(cbType);
    if (onCBTypeChange) {
      onCBTypeChange(cbType);
    }
    const cbTypeLabel = cbType === 'aided' ? 'Aided' : cbType === 'unaided' ? 'Unaided' : 'Both (Combined)';
    showSuccessMessage(`Cashbook Type changed to ${cbTypeLabel}`);
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
      // Use mutation with automatic cache invalidation
      const result = await deleteAllMutation.mutateAsync({ cbType: localCBType, financialYear: selectedFY });
      setShowDeleteConfirm(false);
      setDeletePassword('');

      const cbTypeLabel = localCBType === 'aided' ? 'Aided' : localCBType === 'unaided' ? 'Unaided' : 'All (Both Aided & Unaided)';
      showSuccessMessage(`${cbTypeLabel} data for FY ${getFinancialYearDisplay(selectedFY)} has been deleted successfully (${result.deleted} entries)`);
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

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      // Use cached entries from React Query
      const entries = backupEntries;

      // Create backup object with metadata
      const backup = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        cbType: localCBType,
        count: entries.length,
        entries: entries,
      };

      // Convert to JSON and create blob
      const jsonStr = JSON.stringify(backup, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Generate filename with timestamp and CB type
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const cbTypeLabel = localCBType === 'aided' ? 'Aided' : localCBType === 'unaided' ? 'Unaided' : 'Both';
      link.download = `SMP-CashBook-Backup-${cbTypeLabel}-${timestamp}.json`;

      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const cbTypeMsg = localCBType === 'aided' ? 'Aided' : localCBType === 'unaided' ? 'Unaided' : 'All (Both Aided & Unaided)';
      showSuccessMessage(`Backup created successfully! Downloaded ${entries.length} ${cbTypeMsg} entries.`);
    } catch (error) {
      console.error('Failed to create backup:', error);
      showSuccessMessage('Failed to create backup. Please try again.');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsRestoring(true);
    setRestoreError('');

    try {
      // Read file content
      const fileContent = await file.text();
      const backup = JSON.parse(fileContent);

      // Validate backup structure
      if (!backup.version || !backup.entries || !Array.isArray(backup.entries)) {
        throw new Error('Invalid backup file format');
      }

      // Check if backup CB type matches current selection
      if (backup.cbType !== localCBType) {
        const backupType = backup.cbType === 'aided' ? 'Aided' : backup.cbType === 'unaided' ? 'Unaided' : 'Both';
        const currentType = localCBType === 'aided' ? 'Aided' : localCBType === 'unaided' ? 'Unaided' : 'Both';
        setRestoreError(`Warning: Backup is for ${backupType} but current selection is ${currentType}. Please select the correct cashbook type before restoring.`);
        setIsRestoring(false);
        event.target.value = ''; // Reset file input
        return;
      }

      if (backup.entries.length === 0) {
        setRestoreError('Backup file contains no entries.');
        setIsRestoring(false);
        event.target.value = ''; // Reset file input
        return;
      }

      // Prepare entries for bulk import (strip IDs and timestamps)
      const entriesToImport = backup.entries.map((entry: any) => ({
        date: entry.date,
        type: entry.type,
        cheque_no: entry.cheque_no || '',
        amount: parseFloat(entry.amount),
        head_of_accounts: entry.head_of_accounts,
        notes: entry.notes || '',
        cb_type: entry.cb_type || localCBType,
      }));

      // Import entries
      const result = await db.bulkImport(entriesToImport);

      if (result.success) {
        const cbTypeMsg = localCBType === 'aided' ? 'Aided' : localCBType === 'unaided' ? 'Unaided' : 'All';
        showSuccessMessage(`Restore completed! Imported ${result.imported} ${cbTypeMsg} entries. ${result.failed > 0 ? `Failed: ${result.failed} entries.` : ''}`);
      } else {
        setRestoreError(`Restore failed. Please check the backup file.`);
      }
    } catch (error) {
      console.error('Failed to restore backup:', error);
      setRestoreError(error instanceof Error ? error.message : 'Failed to restore backup. Please check the file format.');
    } finally {
      setIsRestoring(false);
      event.target.value = ''; // Reset file input
    }
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

        {/* CB Type Section */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="text-lg font-semibold text-gray-700 mb-3">Cashbook Type</h3>
          <p className="text-sm text-gray-600 mb-4">
            Select the cashbook type to manage transactions. You can view Aided, Unaided, or both combined.
          </p>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current Cashbook Type:
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleCBTypeChange('aided')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    localCBType === 'aided'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  🟢 Aided
                </button>
                <button
                  onClick={() => handleCBTypeChange('unaided')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    localCBType === 'unaided'
                      ? 'bg-yellow-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  🟡 Unaided
                </button>
                <button
                  onClick={() => handleCBTypeChange('both')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    localCBType === 'both'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  🔵 Both (Combined)
                </button>
              </div>
            </div>

            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                <strong>Selected CB Type:</strong> {localCBType === 'aided' ? 'Aided' : localCBType === 'unaided' ? 'Unaided' : 'Both (Combined)'}
              </p>
              <p className="text-xs text-blue-600 mt-1">
                {localCBType === 'aided' && 'Showing only Aided cashbook transactions'}
                {localCBType === 'unaided' && 'Showing only Unaided cashbook transactions'}
                {localCBType === 'both' && 'Showing both Aided and Unaided transactions combined'}
              </p>
            </div>
          </div>
        </div>

        {/* Backup & Restore Section */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="text-lg font-semibold text-gray-700 mb-3">Backup & Restore</h3>
          <p className="text-sm text-gray-600 mb-4">
            Create backups of your cashbook data and restore them when needed. Backups are saved based on the selected cashbook type.
          </p>

          <div className="grid grid-cols-1 gap-4">
            {/* Backup Section */}
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-md">
              <h4 className="text-sm font-semibold text-blue-900 mb-2">Create Backup</h4>
              <p className="text-xs text-blue-800 mb-3">
                Download a JSON backup file for <strong>{localCBType === 'aided' ? 'Aided' : localCBType === 'unaided' ? 'Unaided' : 'All (Both Aided & Unaided)'}</strong> cashbook entries.
              </p>
              <button
                onClick={handleBackup}
                disabled={isBackingUp}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isBackingUp ? 'Creating Backup...' : `Backup ${localCBType === 'aided' ? 'Aided' : localCBType === 'unaided' ? 'Unaided' : 'All'} Data`}
              </button>
            </div>

            {/* Restore Section */}
            <div className="bg-green-50 border border-green-200 p-4 rounded-md">
              <h4 className="text-sm font-semibold text-green-900 mb-2">Restore from Backup</h4>
              <p className="text-xs text-green-800 mb-3">
                Upload a backup file to restore <strong>{localCBType === 'aided' ? 'Aided' : localCBType === 'unaided' ? 'Unaided' : 'All (Both Aided & Unaided)'}</strong> cashbook entries. The backup must match the selected cashbook type.
              </p>
              {restoreError && (
                <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  {restoreError}
                </div>
              )}
              <label className="inline-block">
                <input
                  type="file"
                  accept=".json"
                  onChange={handleRestore}
                  disabled={isRestoring}
                  className="hidden"
                  id="restore-file-input"
                />
                <span className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors cursor-pointer inline-block disabled:bg-gray-300 disabled:cursor-not-allowed">
                  {isRestoring ? 'Restoring...' : `Restore ${localCBType === 'aided' ? 'Aided' : localCBType === 'unaided' ? 'Unaided' : 'All'} Data`}
                </span>
              </label>
            </div>

            {/* Info Box */}
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-xs text-yellow-800">
                <strong>Important:</strong> Backups are created separately for Aided, Unaided, and Both (Combined) cashbook types.
                Make sure to select the correct cashbook type before creating or restoring a backup.
                Restoring a backup will add entries to the existing data without deleting current entries.
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
            {localCBType === 'aided' && (
              <p className="text-sm text-red-800 mb-4">
                <strong>Warning:</strong> This action will permanently delete all <strong>Aided</strong> cashbook entries for <strong>FY {getFinancialYearDisplay(selectedFY)}</strong> from the database. This cannot be undone!
              </p>
            )}
            {localCBType === 'unaided' && (
              <p className="text-sm text-red-800 mb-4">
                <strong>Warning:</strong> This action will permanently delete all <strong>Unaided</strong> cashbook entries for <strong>FY {getFinancialYearDisplay(selectedFY)}</strong> from the database. This cannot be undone!
              </p>
            )}
            {localCBType === 'both' && (
              <p className="text-sm text-red-800 mb-4">
                <strong>Warning:</strong> This action will permanently delete <strong>ALL</strong> cashbook entries (both Aided and Unaided) for <strong>FY {getFinancialYearDisplay(selectedFY)}</strong> from the database. This cannot be undone!
              </p>
            )}

            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 transition-colors"
              >
                {localCBType === 'aided' && 'Reset Aided Data'}
                {localCBType === 'unaided' && 'Reset Unaided Data'}
                {localCBType === 'both' && 'Reset All Data'}
              </button>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-red-900 mb-2">
                    Enter password to confirm deletion of{' '}
                    {localCBType === 'aided' && 'Aided'}
                    {localCBType === 'unaided' && 'Unaided'}
                    {localCBType === 'both' && 'All'} data:
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
                    {isDeleting ? 'Deleting...' : `Confirm Delete ${localCBType === 'aided' ? 'Aided' : localCBType === 'unaided' ? 'Unaided' : 'All'} Data`}
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
