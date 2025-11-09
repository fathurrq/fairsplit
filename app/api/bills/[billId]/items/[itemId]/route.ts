import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toDecimal } from '@/lib/utils'
import { z } from 'zod'

const updateItemSchema = z.object({
  name: z.string().min(1).optional(),
  quantity: z.number().int().positive().optional(),
  unitPrice: z.number().nonnegative().optional(),
  totalPrice: z.number().nonnegative().optional(),
  notes: z.string().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { billId: string; itemId: string } }
) {
  try {
    const body = await request.json()
    const data = updateItemSchema.parse(body)
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
      return NextResponse.json({ error: 'Cannot update items in finalized bill' }, { status: 400 })
    }

    const updateData: any = {}
    if (data.name) updateData.name = data.name
    if (data.quantity) updateData.quantity = data.quantity
    if (data.unitPrice !== undefined) updateData.unitPrice = toDecimal(data.unitPrice)
    if (data.totalPrice !== undefined) updateData.totalPrice = toDecimal(data.totalPrice)
    if (data.notes !== undefined) updateData.notes = data.notes

    const item = await prisma.item.update({
      where: { id: params.itemId },
      data: updateData,
    })

    return NextResponse.json({ item })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    console.error('Error updating item:', error)
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { billId: string; itemId: string } }
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
      return NextResponse.json({ error: 'Cannot delete items from finalized bill' }, { status: 400 })
    }

    await prisma.item.delete({
      where: { id: params.itemId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting item:', error)
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 })
  }
}


