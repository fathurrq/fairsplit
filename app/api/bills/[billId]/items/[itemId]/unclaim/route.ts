import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const unclaimItemSchema = z.object({
  participantId: z.string().uuid(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { billId: string; itemId: string } }
) {
  try {
    const body = await request.json()
    const data = unclaimItemSchema.parse(body)

    const bill = await prisma.bill.findUnique({
      where: { id: params.billId },
    })

    if (!bill) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
    }

    if (bill.status === 'FINALIZED' || bill.status === 'ARCHIVED') {
      return NextResponse.json({ error: 'Cannot unclaim items in finalized or archived bill' }, { status: 400 })
    }

    await prisma.claim.deleteMany({
      where: {
        itemId: params.itemId,
        participantId: data.participantId,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    console.error('Error unclaiming item:', error)
    return NextResponse.json({ error: 'Failed to unclaim item' }, { status: 500 })
  }
}

