// Client-safe utility functions (no Prisma dependencies)
// These functions can be safely used in client components

/**
 * Format a number or string as currency
 * @param amount - The amount to format (number or string)
 * @param currency - The currency code (default: 'USD')
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number | string, currency: string = 'USD'): string {
  // Handle both number and string inputs
  const num = typeof amount === 'number' 
    ? amount 
    : parseFloat(String(amount).replace(/[^0-9.-]/g, ''))
  
  // Return formatted currency, or $0.00 if invalid
  if (isNaN(num) || !isFinite(num)) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(0)
  }
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(num)
}

