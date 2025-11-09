import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toDecimal } from '@/lib/utils'
import { z } from 'zod'

const updateBillSchema = z.object({
  title: z.string().min(1).optional(),
  taxPercentage: z.number().min(0).max(100).optional(),
  servicePercentage: z.number().min(0).max(100).optional(),
  tipAmount: z.number().min(0).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: { billId: string } }
) {
  try {
    const bill = await prisma.bill.findUnique({
      where: { id: params.billId },
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
        finalTotals: {
          include: {
            participant: true,
          },
        },
      },
    })

    if (!bill) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
    }

    return NextResponse.json({ bill })
  } catch (error) {
    console.error('Error fetching bill:', error)
    return NextResponse.json({ error: 'Failed to fetch bill' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { billId: string } }
) {
  try {
    const body = await request.json()
    const data = updateBillSchema.parse(body)
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
      return NextResponse.json({ error: 'Cannot update finalized bill' }, { status: 400 })
    }

    const updateData: any = {}
    if (data.title) updateData.title = data.title
    if (data.taxPercentage !== undefined) updateData.taxPercentage = toDecimal(data.taxPercentage)
    if (data.servicePercentage !== undefined) updateData.servicePercentage = toDecimal(data.servicePercentage)
    if (data.tipAmount !== undefined) updateData.tipAmount = toDecimal(data.tipAmount)

    const updatedBill = await prisma.bill.update({
      where: { id: params.billId },
      data: updateData,
    })

    return NextResponse.json({ bill: updatedBill })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    console.error('Error updating bill:', error)
    return NextResponse.json({ error: 'Failed to update bill' }, { status: 500 })
  }
}


