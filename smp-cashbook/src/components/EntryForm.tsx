import { useState, useEffect, useRef } from 'react';
import type { ChangeEvent, KeyboardEvent, FormEvent } from 'react';
import type { EntryType, EntryFormData, AutocompleteOption } from '../types';
import { toProperCase, isValidDate, isValidAmount, autoFormatDateInput } from '../utils/helpers';
import { db } from '../services/database';

interface EntryFormProps {
  selectedType: EntryType;
  initialDate: string;
  editData?: { id: string; formData: EntryFormData } | null;
  onSave: (type: EntryType, formData: EntryFormData, editId?: string) => void;
  onCancel: () => void;
}

export default function EntryForm({
  selectedType,
  initialDate,
  editData,
  onSave,
  onCancel,
}: EntryFormProps) {
  const [formData, setFormData] = useState<EntryFormData>({
    date: initialDate,
    cheque_no: '',
    amount: '',
    head_of_accounts: '',
    notes: '',
  });

  const [suggestions, setSuggestions] = useState<{
    cheque: AutocompleteOption[];
    head: AutocompleteOption[];
    notes: AutocompleteOption[];
  }>({
    cheque: [],
    head: [],
    notes: [],
  });

  const [activeSuggestion, setActiveSuggestion] = useState<{
    field: 'cheque' | 'head' | 'notes' | null;
    index: number;
  }>({ field: null, index: -1 });

  const [isValid, setIsValid] = useState(false);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const suggestionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load edit data if editing
  useEffect(() => {
    if (editData) {
      setFormData(editData.formData);
    }
  }, [editData]);

  // Focus amount input when form appears
  useEffect(() => {
    amountInputRef.current?.focus();
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (suggestionTimeoutRef.current) {
        clearTimeout(suggestionTimeoutRef.current);
      }
    };
  }, []);

  // Validate form - ALL fields are now mandatory
  useEffect(() => {
    const valid =
      isValidDate(formData.date) &&
      isValidAmount(formData.amount) &&
      formData.head_of_accounts.trim().length >= 2 &&
      formData.cheque_no.trim().length >= 1 &&
      formData.notes.trim().length >= 1;
    setIsValid(valid);
  }, [formData]);

  const handleInputChange = async (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;

    let processedValue = value;

    // Apply proper case to text fields
    if (name === 'head_of_accounts' || name === 'notes' || name === 'cheque_no') {
      processedValue = toProperCase(value);
    }

    setFormData(prev => ({ ...prev, [name]: processedValue }));

    // Clear existing timeout
    if (suggestionTimeoutRef.current) {
      clearTimeout(suggestionTimeoutRef.current);
    }

    // Fetch autocomplete suggestions
    if (name === 'cheque_no' && value.length >= 1) {
      const suggestions = await db.getChequeNoSuggestions(value);
      setSuggestions(prev => ({ ...prev, cheque: suggestions }));

      // Auto-hide after 3 seconds
      suggestionTimeoutRef.current = setTimeout(() => {
        setSuggestions(prev => ({ ...prev, cheque: [] }));
      }, 3000);
    } else if (name === 'head_of_accounts' && value.length >= 2) {
      const suggestions = await db.getHeadOfAccountsSuggestions(value);
      setSuggestions(prev => ({ ...prev, head: suggestions }));

      // Auto-hide after 3 seconds
      suggestionTimeoutRef.current = setTimeout(() => {
        setSuggestions(prev => ({ ...prev, head: [] }));
      }, 3000);
    } else if (name === 'notes' && value.length >= 2) {
      const suggestions = await db.getNotesSuggestions(value);
      setSuggestions(prev => ({ ...prev, notes: suggestions }));

      // Auto-hide after 3 seconds
      suggestionTimeoutRef.current = setTimeout(() => {
        setSuggestions(prev => ({ ...prev, notes: [] }));
      }, 3000);
    } else {
      // Clear suggestions if input is too short
      if (name === 'cheque_no') setSuggestions(prev => ({ ...prev, cheque: [] }));
      if (name === 'head_of_accounts') setSuggestions(prev => ({ ...prev, head: [] }));
      if (name === 'notes') setSuggestions(prev => ({ ...prev, notes: [] }));
    }

    setActiveSuggestion({ field: null, index: -1 });
  };

  const handleDateBlur = () => {
    // Auto-format date on blur
    if (formData.date && !formData.date.includes('/')) {
      const formatted = autoFormatDateInput(formData.date);
      setFormData(prev => ({ ...prev, date: formatted }));
    }
  };

  const handleKeyDown = (
    e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    field: 'cheque' | 'head' | 'notes'
  ) => {
    const currentSuggestions =
      field === 'cheque'
        ? suggestions.cheque
        : field === 'head'
        ? suggestions.head
        : suggestions.notes;

    if (currentSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestion(prev => ({
        field,
        index: Math.min(prev.index + 1, currentSuggestions.length - 1),
      }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestion(prev => ({
        field,
        index: Math.max(prev.index - 1, -1),
      }));
    } else if (e.key === 'Enter' && activeSuggestion.field === field) {
      e.preventDefault();
      if (activeSuggestion.index >= 0) {
        selectSuggestion(field, currentSuggestions[activeSuggestion.index].value);
      }
    } else if (e.key === 'Escape') {
      clearSuggestions(field);
    }
  };

  const selectSuggestion = (field: 'cheque' | 'head' | 'notes', value: string) => {
    const fieldName =
      field === 'cheque'
        ? 'cheque_no'
        : field === 'head'
        ? 'head_of_accounts'
        : 'notes';

    setFormData(prev => ({ ...prev, [fieldName]: value }));
    clearSuggestions(field);
  };

  const clearSuggestions = (field: 'cheque' | 'head' | 'notes') => {
    setSuggestions(prev => ({ ...prev, [field]: [] }));
    setActiveSuggestion({ field: null, index: -1 });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    // Check for duplicate (all fields must match)
    if (!editData) {
      const isDuplicate = await db.checkDuplicate(
        formData.date,
        selectedType,
        formData.amount,
        formData.head_of_accounts,
        formData.cheque_no,
        formData.notes
      );

      if (isDuplicate) {
        if (!confirm('An identical entry was created recently. Do you want to continue?')) {
          return;
        }
      }
    }

    onSave(selectedType, formData, editData?.id);
  };

  const accentColor = selectedType === 'receipt' ? 'green' : 'red';
  const borderColor = selectedType === 'receipt' ? 'border-green-500' : 'border-red-500';
  const bgColor = selectedType === 'receipt' ? 'bg-green-500' : 'bg-red-500';
  const hoverColor = selectedType === 'receipt' ? 'hover:bg-green-600' : 'hover:bg-red-600';

  return (
    <div className={`bg-white border-l-4 ${borderColor} shadow-md p-2 mb-2`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">
          {editData ? 'Edit' : 'New'}{' '}
          <span className={`text-${accentColor}-600 capitalize`}>{selectedType}</span>
        </h3>
        {editData && (
          <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
            Editing Entry
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        {/* Row 1: Date and Cheque No */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-0.5">
              Date <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="date"
              value={formData.date}
              onChange={handleInputChange}
              onBlur={handleDateBlur}
              placeholder="dd/mm/yy"
              className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 text-xs"
            />
          </div>

          <div className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-0.5">
              Cheque No <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="cheque_no"
              value={formData.cheque_no}
              onChange={handleInputChange}
              onKeyDown={(e) => handleKeyDown(e, 'cheque')}
              onFocus={() => setActiveSuggestion({ field: 'cheque', index: -1 })}
              onBlur={() => setTimeout(() => clearSuggestions('cheque'), 200)}
              className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 text-xs"
            />
            {suggestions.cheque.length > 0 && (
              <div className="absolute z-10 w-full mt-0.5 bg-white border border-gray-300 rounded shadow-lg max-h-32 overflow-y-auto">
                {suggestions.cheque.map((suggestion, index) => (
                  <div
                    key={index}
                    className={`px-2 py-1 cursor-pointer text-xs ${
                      activeSuggestion.field === 'cheque' && activeSuggestion.index === index
                        ? 'bg-blue-100'
                        : 'hover:bg-gray-100'
                    }`}
                    onClick={() => selectSuggestion('cheque', suggestion.value)}
                  >
                    {suggestion.value}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Amount and Head of Accounts */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-0.5">
              Amount <span className="text-red-500">*</span>
            </label>
            <input
              ref={amountInputRef}
              type="text"
              name="amount"
              value={formData.amount}
              onChange={handleInputChange}
              placeholder="0.00"
              className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 text-xs text-right"
            />
          </div>

          <div className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-0.5">
              Head of Accounts <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="head_of_accounts"
              value={formData.head_of_accounts}
              onChange={handleInputChange}
              onKeyDown={(e) => handleKeyDown(e, 'head')}
              onFocus={() => setActiveSuggestion({ field: 'head', index: -1 })}
              onBlur={() => setTimeout(() => clearSuggestions('head'), 200)}
              className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 text-xs"
            />
            {suggestions.head.length > 0 && (
              <div className="absolute z-10 w-full mt-0.5 bg-white border border-gray-300 rounded shadow-lg max-h-32 overflow-y-auto">
                {suggestions.head.map((suggestion, index) => (
                  <div
                    key={index}
                    className={`px-2 py-1 cursor-pointer text-xs ${
                      activeSuggestion.field === 'head' && activeSuggestion.index === index
                        ? 'bg-blue-100'
                        : 'hover:bg-gray-100'
                    }`}
                    onClick={() => selectSuggestion('head', suggestion.value)}
                  >
                    {suggestion.value}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Row 3: Notes */}
        <div className="relative">
          <label className="block text-xs font-medium text-gray-700 mb-0.5">Notes <span className="text-red-500">*</span></label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleInputChange}
            onKeyDown={(e) => handleKeyDown(e, 'notes')}
            onFocus={() => setActiveSuggestion({ field: 'notes', index: -1 })}
            onBlur={() => setTimeout(() => clearSuggestions('notes'), 200)}
            rows={1}
            className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 text-xs resize-none"
          />
          {suggestions.notes.length > 0 && (
            <div className="absolute z-10 w-full mt-0.5 bg-white border border-gray-300 rounded shadow-lg max-h-32 overflow-y-auto">
              {suggestions.notes.map((suggestion, index) => (
                <div
                  key={index}
                  className={`px-2 py-1 cursor-pointer text-xs ${
                    activeSuggestion.field === 'notes' && activeSuggestion.index === index
                      ? 'bg-blue-100'
                      : 'hover:bg-gray-100'
                  }`}
                  onClick={() => selectSuggestion('notes', suggestion.value)}
                >
                  {suggestion.value}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex justify-center items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={!isValid}
            className={`px-4 py-1.5 ${bgColor} ${hoverColor} text-white text-xs font-medium rounded shadow-md transition-colors duration-200 disabled:bg-gray-400 disabled:cursor-not-allowed focus:outline-none focus:ring-1 ${
              selectedType === 'receipt' ? 'focus:ring-green-400' : 'focus:ring-red-400'
            }`}
          >
            Save {selectedType === 'receipt' ? 'Receipt' : 'Payment'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-gray-600 hover:text-gray-800 text-xs font-medium transition-colors duration-200 focus:outline-none"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
