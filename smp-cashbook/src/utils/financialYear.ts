// Financial Year utilities
// Financial Year runs from April 1st to March 31st
// Format: YY-YY (e.g., "25-26" for April 2025 to March 2026)

/**
 * Calculate Financial Year from a date in dd/mm/yy format
 * @param dateStr - Date in dd/mm/yy format (e.g., "15/04/25")
 * @returns Financial Year in YY-YY format (e.g., "25-26")
 */
export function calculateFinancialYear(dateStr: string): string {
  const datePattern = /^(\d{2})\/(\d{2})\/(\d{2})$/;
  const match = dateStr.match(datePattern);

  if (!match) {
    return '';
  }

  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  // If month is Jan-Mar (1-3), FY is (year-1)-year
  if (month >= 1 && month <= 3) {
    const prevYear = year - 1;
    return `${prevYear.toString().padStart(2, '0')}-${year.toString().padStart(2, '0')}`;
  }

  // If month is Apr-Dec (4-12), FY is year-(year+1)
  const nextYear = year + 1;
  return `${year.toString().padStart(2, '0')}-${nextYear.toString().padStart(2, '0')}`;
}

/**
 * Get current Financial Year based on today's date
 * @returns Financial Year in YY-YY format (e.g., "25-26")
 */
export function getCurrentFinancialYear(): string {
  const today = new Date();
  const month = today.getMonth() + 1; // 1-12
  const year = today.getFullYear() % 100; // Get last 2 digits

  // If month is Jan-Mar (1-3), FY is (year-1)-year
  if (month >= 1 && month <= 3) {
    const prevYear = year - 1;
    return `${prevYear.toString().padStart(2, '0')}-${year.toString().padStart(2, '0')}`;
  }

  // If month is Apr-Dec (4-12), FY is year-(year+1)
  const nextYear = year + 1;
  return `${year.toString().padStart(2, '0')}-${nextYear.toString().padStart(2, '0')}`;
}

/**
 * Generate a list of Financial Years for selection
 * @param yearsBack - Number of years to go back from current FY
 * @param yearsForward - Number of years to go forward from current FY
 * @returns Array of FY strings in YY-YY format
 */
export function generateFinancialYears(yearsBack: number = 5, yearsForward: number = 2): string[] {
  const currentFY = getCurrentFinancialYear();
  const currentStartYear = parseInt(currentFY.split('-')[0], 10);

  const fys: string[] = [];

  for (let i = yearsBack; i >= -yearsForward; i--) {
    const startYear = currentStartYear - i;
    const endYear = startYear + 1;
    fys.push(`${startYear.toString().padStart(2, '0')}-${endYear.toString().padStart(2, '0')}`);
  }

  return fys;
}

/**
 * Get full year range display for a FY
 * @param fy - Financial Year in YY-YY format (e.g., "25-26")
 * @returns Display string (e.g., "2025-26")
 */
export function getFinancialYearDisplay(fy: string): string {
  if (!fy || fy.length !== 5) return fy;

  const [startYY, endYY] = fy.split('-');
  return `20${startYY}-${endYY}`;
}

/**
 * Get date range for a Financial Year
 * @param fy - Financial Year in YY-YY format (e.g., "25-26")
 * @returns Object with start and end dates in dd/mm/yy format
 */
export function getFinancialYearDateRange(fy: string): { start: string; end: string } {
  if (!fy || fy.length !== 5) {
    return { start: '', end: '' };
  }

  const [startYY, endYY] = fy.split('-');

  return {
    start: `01/04/${startYY}`, // April 1st
    end: `31/03/${endYY}`,     // March 31st
  };
}
