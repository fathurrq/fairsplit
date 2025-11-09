import { Decimal } from '@prisma/client/runtime/library'
import { prisma } from './prisma'
import { calculateItemShare, calculateTaxShare, calculateServiceShare, toDecimal } from './utils'

export interface ParticipantTotal {
  participantId: string
  displayName: string
  subtotal: Decimal
  taxShare: Decimal
  serviceShare: Decimal
  tipShare: Decimal
  total: Decimal
}

export async function calculateProvisionalTotals(billId: string): Promise<ParticipantTotal[]> {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: {
      items: {
        include: {
          claims: {
            include: {
              participant: true,
            },
          },
        },
      },
      participants: true,
    },
  })

  if (!bill) throw new Error('Bill not found')

  const totals = new Map<string, ParticipantTotal>()

  // Initialize participants
  for (const participant of bill.participants) {
    totals.set(participant.id, {
      participantId: participant.id,
      displayName: participant.displayName,
      subtotal: new Decimal(0),
      taxShare: new Decimal(0),
      serviceShare: new Decimal(0),
      tipShare: new Decimal(0),
      total: new Decimal(0),
    })
  }

  // Calculate item shares
  let totalSubtotal = new Decimal(0)

  for (const item of bill.items) {
    const claimCount = item.claims.length
    const itemShare = claimCount > 0 ? calculateItemShare(item.totalPrice, claimCount) : new Decimal(0)

    if (claimCount === 0) {
      // Unclaimed items go to payer
      const payer = bill.participants.find((p) => p.isPayer)
      if (payer) {
        const total = totals.get(payer.id)!
        total.subtotal = total.subtotal.plus(item.totalPrice)
        totalSubtotal = totalSubtotal.plus(item.totalPrice)
      }
    } else {
      for (const claim of item.claims) {
        const total = totals.get(claim.participantId)!
        total.subtotal = total.subtotal.plus(itemShare)
        totalSubtotal = totalSubtotal.plus(itemShare)
      }
    }
  }

  // Calculate tax and service shares
  const taxAmount = totalSubtotal.multipliedBy(bill.taxPercentage).dividedBy(100)
  const serviceAmount = totalSubtotal.multipliedBy(bill.servicePercentage).dividedBy(100)
  const tipAmount = toDecimal(bill.tipAmount)

  // Distribute tax, service, and tip proportionally
  for (const [participantId, total] of totals.entries()) {
    if (totalSubtotal.greaterThan(0)) {
      total.taxShare = calculateTaxShare(total.subtotal, totalSubtotal, bill.taxPercentage)
      total.serviceShare = calculateServiceShare(total.subtotal, totalSubtotal, bill.servicePercentage)
      total.tipShare = total.subtotal.multipliedBy(tipAmount).dividedBy(totalSubtotal)
    }
    total.total = total.subtotal.plus(total.taxShare).plus(total.serviceShare).plus(total.tipShare)
  }

  return Array.from(totals.values())
}

export async function finalizeBill(billId: string): Promise<void> {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
  })

  if (!bill) throw new Error('Bill not found')
  if (bill.status === 'FINALIZED') throw new Error('Bill already finalized')

  const totals = await calculateProvisionalTotals(billId)

  // Store final totals
  await prisma.finalTotal.deleteMany({
    where: { billId },
  })

  for (const total of totals) {
    await prisma.finalTotal.create({
      data: {
        billId,
        participantId: total.participantId,
        subtotal: total.subtotal,
        taxShare: total.taxShare,
        serviceShare: total.serviceShare,
        tipShare: total.tipShare,
        total: total.total,
      },
    })
  }

  // Update bill status and calculate total amounts
  const totalSubtotal = totals.reduce((sum, t) => sum.plus(t.subtotal), new Decimal(0))
  const totalTax = totals.reduce((sum, t) => sum.plus(t.taxShare), new Decimal(0))
  const totalService = totals.reduce((sum, t) => sum.plus(t.serviceShare), new Decimal(0))
  const totalTip = totals.reduce((sum, t) => sum.plus(t.tipShare), new Decimal(0))

  await prisma.bill.update({
    where: { id: billId },
    data: {
      status: 'FINALIZED',
      finalizedAt: new Date(),
      totalAmount: totalSubtotal.plus(totalTax).plus(totalService).plus(totalTip),
      taxAmount: totalTax,
      serviceAmount: totalService,
    },
  })
}


