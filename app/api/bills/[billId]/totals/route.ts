import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculateProvisionalTotals } from '@/lib/calculations'

export async function GET(
  request: NextRequest,
  { params }: { params: { billId: string } }
) {
  try {
    const bill = await prisma.bill.findUnique({
      where: { id: params.billId },
    })

    if (!bill) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
    }

    if (bill.status === 'FINALIZED') {
      // Return final totals
      const finalTotals = await prisma.finalTotal.findMany({
        where: { billId: params.billId },
        include: {
          participant: true,
        },
      })

      return NextResponse.json({
        totals: finalTotals.map((ft) => ({
          participantId: ft.participantId,
          displayName: ft.participant.displayName,
          subtotal: ft.subtotal.toString(),
          taxShare: ft.taxShare.toString(),
          serviceShare: ft.serviceShare.toString(),
          tipShare: ft.tipShare.toString(),
          total: ft.total.toString(),
        })),
        isFinal: true,
      })
    } else {
      // Calculate provisional totals
      const totals = await calculateProvisionalTotals(params.billId)

      return NextResponse.json({
        totals: totals.map((t) => ({
          participantId: t.participantId,
          displayName: t.displayName,
          subtotal: t.subtotal.toString(),
          taxShare: t.taxShare.toString(),
          serviceShare: t.serviceShare.toString(),
          tipShare: t.tipShare.toString(),
          total: t.total.toString(),
        })),
        isFinal: false,
      })
    }
  } catch (error) {
    console.error('Error calculating totals:', error)
    return NextResponse.json({ error: 'Failed to calculate totals' }, { status: 500 })
  }
}


