// This file contains server-only utilities that use Prisma Decimal types
// DO NOT import this file in client components
// Use client-utils.ts for client-side utilities instead

import { Decimal } from '@prisma/client/runtime/library'

export function generateBillCode(): string {
  return Math.random().toString(36).substring(2, 9).toUpperCase()
}

export function generateSessionId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

export function toDecimal(value: number | string | Decimal): Decimal {
  if (value instanceof Decimal) return value
  return new Decimal(value)
}

export function toNumber(decimal: Decimal | number): number {
  if (typeof decimal === 'number') return decimal
  return decimal.toNumber()
}

export function calculateItemShare(itemPrice: Decimal, claimCount: number): Decimal {
  if (claimCount === 0) return new Decimal(0)
  return itemPrice.dividedBy(claimCount)
}

export function calculateTaxShare(
  participantSubtotal: Decimal,
  totalSubtotal: Decimal,
  taxPercentage: Decimal
): Decimal {
  if (totalSubtotal.equals(0)) return new Decimal(0)
  const taxAmount = totalSubtotal.multipliedBy(taxPercentage).dividedBy(100)
  const share = participantSubtotal.multipliedBy(taxAmount).dividedBy(totalSubtotal)
  return share
}

export function calculateServiceShare(
  participantSubtotal: Decimal,
  totalSubtotal: Decimal,
  servicePercentage: Decimal
): Decimal {
  if (totalSubtotal.equals(0)) return new Decimal(0)
  const serviceAmount = totalSubtotal.multipliedBy(servicePercentage).dividedBy(100)
  const share = participantSubtotal.multipliedBy(serviceAmount).dividedBy(totalSubtotal)
  return share
}

// formatCurrency moved to client-utils.ts for client-side use
// This file is server-only and uses Prisma Decimal types

