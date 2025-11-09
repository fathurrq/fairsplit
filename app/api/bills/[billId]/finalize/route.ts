import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { finalizeBill } from '@/lib/calculations'

export async function POST(
  request: NextRequest,
  { params }: { params: { billId: string } }
) {
  try {
    const sessionId = request.headers.get('x-session-id')

    const bill = await prisma.bill.findUnique({
      where: { id: params.billId },
    })

    if (!bill) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
    }

    if (bill.payerSessionId !== sessionId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (bill.status === 'FINALIZED') {
      return NextResponse.json({ error: 'Bill already finalized' }, { status: 400 })
    }

    await finalizeBill(params.billId)

    const finalizedBill = await prisma.bill.findUnique({
      where: { id: params.billId },
      include: {
        finalTotals: {
          include: {
            participant: true,
          },
        },
      },
    })

    return NextResponse.json({ bill: finalizedBill })
  } catch (error) {
    console.error('Error finalizing bill:', error)
    return NextResponse.json({ error: 'Failed to finalize bill' }, { status: 500 })
  }
}


