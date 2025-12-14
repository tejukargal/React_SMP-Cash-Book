// Convert text to proper case (capitalize first letter of each word)
export function toProperCase(text: string): string {
  if (!text) return '';

  return text
    .toLowerCase()
    .split(' ')
    .map(word => {
      if (word.length === 0) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

// Validate date in dd/mm/yy format
export function isValidDate(dateStr: string): boolean {
  // Check format
  const datePattern = /^(\d{2})\/(\d{2})\/(\d{2})$/;
  const match = dateStr.match(datePattern);

  if (!match) return false;

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  // Validate ranges
  if (day < 1 || day > 31) return false;
  if (month < 1 || month > 12) return false;
  if (year < 0 || year > 99) return false;

  // Check for valid day in month
  const fullYear = 2000 + year;
  const date = new Date(fullYear, month - 1, day);

  return (
    date.getFullYear() === fullYear &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

// Format date to dd/mm/yy
export function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);

  return `${day}/${month}/${year}`;
}

// Get today's date in dd/mm/yy format
export function getTodayDate(): string {
  return formatDate(new Date());
}

// Parse dd/mm/yy to Date object
export function parseDate(dateStr: string): Date | null {
  const datePattern = /^(\d{2})\/(\d{2})\/(\d{2})$/;
  const match = dateStr.match(datePattern);

  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  const fullYear = 2000 + year;

  return new Date(fullYear, month - 1, day);
}

// Validate amount (positive number with optional decimals)
export function isValidAmount(amount: string): boolean {
  if (!amount || amount.trim() === '') return false;

  const amountPattern = /^\d+(\.\d{1,2})?$/;
  if (!amountPattern.test(amount)) return false;

  const numAmount = parseFloat(amount);
  return numAmount > 0;
}

// Format amount for display
export function formatAmount(amount: number | string): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return numAmount.toFixed(2);
}

// Auto-format date input (add slashes automatically)
export function autoFormatDateInput(value: string): string {
  // Remove non-numeric characters
  const numbers = value.replace(/\D/g, '');

  // Auto-add slashes
  if (numbers.length <= 2) {
    return numbers;
  } else if (numbers.length <= 4) {
    return `${numbers.slice(0, 2)}/${numbers.slice(2)}`;
  } else {
    return `${numbers.slice(0, 2)}/${numbers.slice(2, 4)}/${numbers.slice(4, 6)}`;
  }
}

// Validate date input and convert to dd/mm/yy format
export function validateAndFormatDate(value: string): string {
  // If already in correct format, validate and return
  if (value.includes('/')) {
    return value;
  }

  // If numbers only, auto-format
  const numbers = value.replace(/\D/g, '');
  if (numbers.length === 6 || numbers.length === 8) {
    return autoFormatDateInput(numbers);
  }

  return value;
}

// Calculate running balance
export function calculateRunningBalance(
  entries: Array<{ type: 'receipt' | 'payment'; amount: number | string }>,
  upToIndex: number
): number {
  let balance = 0;

  for (let i = entries.length - 1; i >= upToIndex; i--) {
    const entry = entries[i];
    const amount = typeof entry.amount === 'string' ? parseFloat(entry.amount) : entry.amount;
    if (entry.type === 'receipt') {
      balance += amount;
    } else {
      balance -= amount;
    }
  }

  return balance;
}
