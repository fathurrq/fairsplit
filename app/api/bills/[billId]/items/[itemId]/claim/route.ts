import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const claimItemSchema = z.object({
  participantId: z.string().uuid(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { billId: string; itemId: string } }
) {
  try {
    const body = await request.json()
    const data = claimItemSchema.parse(body)

    const bill = await prisma.bill.findUnique({
      where: { id: params.billId },
    })

    if (!bill) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
    }

    if (bill.status === 'FINALIZED' || bill.status === 'ARCHIVED') {
      return NextResponse.json({ error: 'Cannot claim items in finalized or archived bill' }, { status: 400 })
    }

    // Check if item exists
    const item = await prisma.item.findUnique({
      where: { id: params.itemId },
    })

    if (!item || item.billId !== params.billId) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    // Check if participant exists
    const participant = await prisma.participant.findUnique({
      where: { id: data.participantId },
    })

    if (!participant || participant.billId !== params.billId) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 })
    }

    // Create or update claim
    const claim = await prisma.claim.upsert({
      where: {
        itemId_participantId: {
          itemId: params.itemId,
          participantId: data.participantId,
        },
      },
      update: {},
      create: {
        billId: params.billId,
        itemId: params.itemId,
        participantId: data.participantId,
      },
    })

    return NextResponse.json({ claim }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    console.error('Error claiming item:', error)
    return NextResponse.json({ error: 'Failed to claim item' }, { status: 500 })
  }
}


