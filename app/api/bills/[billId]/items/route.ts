import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toDecimal } from '@/lib/utils'
import { z } from 'zod'

const createItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().int().positive().default(1),
  unitPrice: z.number().nonnegative(),
  totalPrice: z.number().nonnegative(),
  notes: z.string().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { billId: string } }
) {
  try {
    const body = await request.json()
    const data = createItemSchema.parse(body)
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
      return NextResponse.json({ error: 'Cannot add items to finalized bill' }, { status: 400 })
    }

    // Update bill status to OPEN if it was DRAFT
    if (bill.status === 'DRAFT') {
      await prisma.bill.update({
        where: { id: params.billId },
        data: { status: 'OPEN' },
      })
    }

    const item = await prisma.item.create({
      data: {
        billId: params.billId,
        name: data.name,
        quantity: data.quantity,
        unitPrice: toDecimal(data.unitPrice),
        totalPrice: toDecimal(data.totalPrice),
        notes: data.notes,
      },
    })

    return NextResponse.json({ item }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    console.error('Error creating item:', error)
    return NextResponse.json({ error: 'Failed to create item' }, { status: 500 })
  }
}


