import type { EntryType } from '../types';

interface TypeSelectionProps {
  onSelectType: (type: EntryType) => void;
}

export default function TypeSelection({ onSelectType }: TypeSelectionProps) {
  return (
    <div className="flex justify-center items-center gap-3 h-12 bg-gray-50 border-b border-gray-200">
      <button
        onClick={() => onSelectType('receipt')}
        className="w-[100px] h-[36px] bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded shadow-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-green-400"
      >
        Receipt
      </button>
      <button
        onClick={() => onSelectType('payment')}
        className="w-[100px] h-[36px] bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded shadow-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-400"
      >
        Payment
      </button>
    </div>
  );
}
