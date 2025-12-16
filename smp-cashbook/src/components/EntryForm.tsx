import { useState, useEffect, useRef } from 'react';
import type { ChangeEvent, KeyboardEvent, FormEvent } from 'react';
import type { EntryType, EntryFormData, AutocompleteOption, CBType } from '../types';
import { toProperCase, isValidDate, isValidAmount, autoFormatDateInput, normalizeDateFormat } from '../utils/helpers';
import { db } from '../services/database';

interface EntryFormProps {
  selectedType: EntryType;
  initialDate: string;
  selectedCBType: CBType;
  editData?: { id: string; formData: EntryFormData } | null;
  onSave: (type: EntryType, formData: EntryFormData, editId?: string) => void;
  onCancel: () => void;
  resetTrigger?: number;
  autoFocus?: boolean;
}

export default function EntryForm({
  selectedType,
  initialDate,
  selectedCBType,
  editData,
  onSave,
  onCancel,
  resetTrigger = 0,
  autoFocus = false,
}: EntryFormProps) {
  // Helper function to convert CBType to actual cb_type for entries
  const getActualCBType = (cbType: CBType): 'aided' | 'unaided' => {
    // When 'both' is selected in settings, default new entries to 'aided'
    return cbType === 'unaided' ? 'unaided' : 'aided';
  };

  const [formData, setFormData] = useState<EntryFormData>({
    date: initialDate,
    cheque_no: '',
    amount: '',
    head_of_accounts: '',
    notes: '',
    cb_type: getActualCBType(selectedCBType),
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

  // Track which fields had a suggestion selected (to prevent re-showing until cleared)
  const [selectedFields, setSelectedFields] = useState<{
    cheque: boolean;
    head: boolean;
    notes: boolean;
  }>({ cheque: false, head: false, notes: false });

  const [isValid, setIsValid] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const chequeInputRef = useRef<HTMLInputElement>(null);
  const headInputRef = useRef<HTMLInputElement>(null);
  const notesInputRef = useRef<HTMLTextAreaElement>(null);
  const isSelectingSuggestionRef = useRef(false);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load edit data if editing
  useEffect(() => {
    if (editData) {
      setFormData(editData.formData);
    }
  }, [editData]);

  // Fetch and populate most recent entry date on mount (only if not editing)
  useEffect(() => {
    const fetchRecentDate = async () => {
      if (!editData) {
        const recentDate = await db.getMostRecentDate();
        if (recentDate) {
          setFormData(prev => ({ ...prev, date: recentDate }));
        }
      }
    };
    fetchRecentDate();
  }, [editData]);

  // Focus date input when form appears (only if autoFocus is enabled)
  useEffect(() => {
    if (autoFocus) {
      dateInputRef.current?.focus();
    }
  }, [autoFocus]);

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Update cb_type when selectedCBType changes (unless editing)
  useEffect(() => {
    if (!editData) {
      setFormData(prev => ({
        ...prev,
        cb_type: getActualCBType(selectedCBType),
      }));
    }
  }, [selectedCBType, editData]);

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

  // Reset form fields after save - only clear amount, keep other fields and highlight them
  useEffect(() => {
    if (resetTrigger > 0) {
      setFormData(prev => ({
        ...prev, // Keep all fields
        amount: '', // Clear only amount
      }));
      // Clear suggestions and selection state to allow new suggestions
      setSuggestions({ cheque: [], head: [], notes: [] });
      setSelectedFields({ cheque: false, head: false, notes: false });

      // Highlight all fields except amount for easy replacement
      setTimeout(() => {
        // Select all text in date field
        if (dateInputRef.current) {
          dateInputRef.current.select();
          dateInputRef.current.focus();
        }
        // Note: Other fields will be selected when user tabs to them
      }, 100);
    }
  }, [resetTrigger]);

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

    // Skip suggestion fetching if we're currently selecting a suggestion
    if (isSelectingSuggestionRef.current) {
      return;
    }

    // Clear any existing debounce timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Fetch autocomplete suggestions only if not previously selected or field is cleared
    // Note: Cheque No autocomplete is disabled as per requirements
    if (name === 'cheque_no') {
      // Always clear suggestions for cheque_no field
      if (value.length === 0) {
        setSelectedFields(prev => ({ ...prev, cheque: false }));
      }
      setSuggestions(prev => ({ ...prev, cheque: [] }));
    } else if (name === 'head_of_accounts') {
      if (value.length === 0) {
        // Field cleared - reset selection state
        setSelectedFields(prev => ({ ...prev, head: false }));
        setSuggestions(prev => ({ ...prev, head: [] }));
      } else if (value.length >= 4 && !selectedFields.head) {
        // Debounce the API call for faster perceived performance
        debounceTimeoutRef.current = setTimeout(async () => {
          const suggestions = await db.getHeadOfAccountsSuggestions(processedValue);
          setSuggestions(prev => ({ ...prev, head: suggestions.slice(0, 1) })); // Show only 1 suggestion
        }, 150);
      } else if (value.length < 4) {
        // Clear suggestions if less than 4 characters
        setSuggestions(prev => ({ ...prev, head: [] }));
      }
    } else if (name === 'notes') {
      if (value.length === 0) {
        // Field cleared - reset selection state
        setSelectedFields(prev => ({ ...prev, notes: false }));
        setSuggestions(prev => ({ ...prev, notes: [] }));
      } else if (value.length >= 4 && !selectedFields.notes) {
        // Debounce the API call for faster perceived performance
        debounceTimeoutRef.current = setTimeout(async () => {
          const suggestions = await db.getNotesSuggestions(processedValue);
          setSuggestions(prev => ({ ...prev, notes: suggestions.slice(0, 1) })); // Show only 1 suggestion
        }, 150);
      } else if (value.length < 4) {
        // Clear suggestions if less than 4 characters
        setSuggestions(prev => ({ ...prev, notes: [] }));
      }
    }

    setActiveSuggestion({ field: null, index: -1 });
  };

  const handleDateBlur = () => {
    // Auto-format date on blur
    if (formData.date) {
      if (!formData.date.includes('/')) {
        // If no slashes, auto-format
        const formatted = autoFormatDateInput(formData.date);
        const normalized = normalizeDateFormat(formatted);
        setFormData(prev => ({ ...prev, date: normalized }));
      } else {
        // If already has slashes, normalize yyyy to yy
        const normalized = normalizeDateFormat(formData.date);
        setFormData(prev => ({ ...prev, date: normalized }));
      }
    }
  };

  const handleFocus = (field: 'cheque' | 'head' | 'notes') => {
    // Clear all other suggestions when a field gains focus
    if (field === 'cheque') {
      setSuggestions(prev => ({ ...prev, head: [], notes: [] }));
    } else if (field === 'head') {
      setSuggestions(prev => ({ ...prev, cheque: [], notes: [] }));
    } else if (field === 'notes') {
      setSuggestions(prev => ({ ...prev, cheque: [], head: [] }));
    }
    setActiveSuggestion({ field, index: -1 });
  };

  const handleBlur = (field: 'cheque' | 'head' | 'notes') => {
    // When user leaves the field, mark it as "selected" to prevent suggestions from reappearing
    setTimeout(() => {
      clearSuggestions(field);
      // Mark field as selected if it has content to prevent re-showing suggestions
      const fieldName = field === 'cheque' ? 'cheque_no' : field === 'head' ? 'head_of_accounts' : 'notes';
      const hasContent = formData[fieldName].trim().length > 0;
      if (hasContent) {
        setSelectedFields(prev => ({ ...prev, [field]: true }));
      }
    }, 200);
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

    if (e.key === 'Tab') {
      // Select the first matching entry
      e.preventDefault();
      selectSuggestion(field, currentSuggestions[0].value);
    } else if (e.key === 'ArrowDown') {
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

    // Set flag to prevent handleInputChange from fetching suggestions
    isSelectingSuggestionRef.current = true;

    // Mark field as selected to prevent suggestions from reappearing
    setSelectedFields(prev => ({ ...prev, [field]: true }));

    // Clear suggestions immediately
    clearSuggestions(field);

    // Update form data
    setFormData(prev => ({ ...prev, [fieldName]: value }));

    // Reset the flag after all events have been processed
    setTimeout(() => {
      isSelectingSuggestionRef.current = false;
    }, 100);
  };

  const clearSuggestions = (field: 'cheque' | 'head' | 'notes') => {
    setSuggestions(prev => ({ ...prev, [field]: [] }));
    setActiveSuggestion({ field: null, index: -1 });
  };

  const handleClearAll = () => {
    // Clear all fields including date
    setFormData({
      date: initialDate,
      cheque_no: '',
      amount: '',
      head_of_accounts: '',
      notes: '',
      cb_type: getActualCBType(selectedCBType),
    });
    // Clear suggestions and selection state
    setSuggestions({ cheque: [], head: [], notes: [] });
    setSelectedFields({ cheque: false, head: false, notes: false });
    // Focus date input (only for autoFocus form)
    if (autoFocus) {
      dateInputRef.current?.focus();
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    // Normalize date format before saving (convert yyyy to yy)
    const normalizedDate = normalizeDateFormat(formData.date);
    const normalizedFormData = { ...formData, date: normalizedDate };

    // Save immediately without duplicate check for faster entry
    onSave(selectedType, normalizedFormData, editData?.id);
  };

  const accentColor = selectedType === 'receipt' ? 'green' : 'red';
  const borderColor = selectedType === 'receipt' ? 'border-green-500' : 'border-red-500';
  const bgColor = selectedType === 'receipt' ? 'bg-green-500' : 'bg-red-500';
  const hoverColor = selectedType === 'receipt' ? 'hover:bg-green-600' : 'hover:bg-red-600';

  return (
    <div className={`bg-white border-l-4 ${borderColor} shadow-md p-2 mb-2`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-700">
            {editData ? 'Edit' : 'New'}{' '}
            <span className={`text-${accentColor}-600 capitalize`}>{selectedType}</span>
          </h3>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            formData.cb_type === 'aided'
              ? 'bg-green-100 text-green-700'
              : 'bg-yellow-100 text-yellow-700'
          }`}>
            {formData.cb_type === 'aided' ? '🟢 Aided' : '🟡 Unaided'}
          </span>
        </div>
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
              ref={dateInputRef}
              type="text"
              name="date"
              value={formData.date}
              onChange={handleInputChange}
              onBlur={handleDateBlur}
              onFocus={(e) => {
                // Clear all suggestions when date field is focused
                setSuggestions({ cheque: [], head: [], notes: [] });
                // Select all text for easy replacement
                e.target.select();
              }}
              placeholder="dd/mm/yy or dd/mm/yyyy"
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-0.5">
              Cheque No <span className="text-red-500">*</span>
            </label>
            <input
              ref={chequeInputRef}
              type="text"
              name="cheque_no"
              value={formData.cheque_no}
              onChange={handleInputChange}
              onFocus={(e) => {
                // Clear all suggestions when cheque field is focused
                setSuggestions({ cheque: [], head: [], notes: [] });
                // Select all text for easy replacement
                e.target.select();
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 text-sm"
            />
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
              onFocus={(e) => {
                // Clear all suggestions when amount field is focused
                setSuggestions({ cheque: [], head: [], notes: [] });
                // Select all text for easy replacement
                e.target.select();
              }}
              placeholder="0.00"
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 text-sm text-right"
            />
          </div>

          <div className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-0.5">
              Head of Accounts <span className="text-red-500">*</span>
            </label>
            <input
              ref={headInputRef}
              type="text"
              name="head_of_accounts"
              value={formData.head_of_accounts}
              onChange={handleInputChange}
              onKeyDown={(e) => handleKeyDown(e, 'head')}
              onFocus={(e) => {
                handleFocus('head');
                // Select all text for easy replacement
                e.target.select();
              }}
              onBlur={() => handleBlur('head')}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 text-sm"
            />
            {suggestions.head.length > 0 && !selectedFields.head && (
              <div className="absolute z-10 w-full mt-0.5 bg-white border border-gray-300 rounded shadow-lg max-h-32 overflow-y-auto">
                {suggestions.head.map((suggestion, index) => (
                  <div
                    key={index}
                    className={`px-3 py-1.5 cursor-pointer text-sm ${
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
            ref={notesInputRef}
            name="notes"
            value={formData.notes}
            onChange={handleInputChange}
            onKeyDown={(e) => handleKeyDown(e, 'notes')}
            onFocus={(e) => {
              handleFocus('notes');
              // Select all text for easy replacement
              e.target.select();
            }}
            onBlur={() => handleBlur('notes')}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 text-sm resize-none"
          />
          {suggestions.notes.length > 0 && !selectedFields.notes && (
            <div className="absolute z-10 w-full mt-0.5 bg-white border border-gray-300 rounded shadow-lg max-h-32 overflow-y-auto">
              {suggestions.notes.map((suggestion, index) => (
                <div
                  key={index}
                  className={`px-3 py-1.5 cursor-pointer text-sm ${
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
            className={`px-5 py-2 ${bgColor} ${hoverColor} text-white text-sm font-medium rounded shadow-md transition-colors duration-200 disabled:bg-gray-400 disabled:cursor-not-allowed focus:outline-none focus:ring-1 ${
              selectedType === 'receipt' ? 'focus:ring-green-400' : 'focus:ring-red-400'
            }`}
          >
            Save {selectedType === 'receipt' ? 'Receipt' : 'Payment'}
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white text-sm font-medium rounded shadow-md transition-colors duration-200 focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium transition-colors duration-200 focus:outline-none"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
