// Client-safe utility functions (no Prisma dependencies)
// These functions can be safely used in client components

/**
 * Format a number with dot thousand separators and comma decimal separator
 * @param amount - The amount to format (number or string)
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted number string (e.g., 1.000,00)
 */
export function formatNumber(amount: number | string, decimals: number = 2): string {
  // Handle both number and string inputs
  const num = typeof amount === 'number' 
    ? amount 
    : parseFloat(String(amount).replace(/[^0-9.-]/g, ''))
  
  // Return 0.00 if invalid
  if (isNaN(num) || !isFinite(num)) {
    return '0' + (decimals > 0 ? ',' + '0'.repeat(decimals) : '')
  }
  
  // Format with dot as thousand separator and comma as decimal separator
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num)
}

