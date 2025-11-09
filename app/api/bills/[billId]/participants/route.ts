import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateSessionId } from '@/lib/utils'
import { z } from 'zod'

const joinBillSchema = z.object({
  displayName: z.string().min(1),
  sessionId: z.string().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { billId: string } }
) {
  try {
    const body = await request.json()
    const data = joinBillSchema.parse(body)

    const bill = await prisma.bill.findUnique({
      where: { id: params.billId },
    })

    if (!bill) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
    }

    if (bill.status === 'FINALIZED' || bill.status === 'ARCHIVED') {
      return NextResponse.json({ error: 'Cannot join finalized or archived bill' }, { status: 400 })
    }

    const sessionId = data.sessionId || generateSessionId()

    // Check if participant already exists
    let participant = await prisma.participant.findFirst({
      where: {
        billId: params.billId,
        sessionId,
      },
    })

    if (participant) {
      // Update display name if different
      if (participant.displayName !== data.displayName) {
        participant = await prisma.participant.update({
          where: { id: participant.id },
          data: { displayName: data.displayName },
        })
      }
    } else {
      participant = await prisma.participant.create({
        data: {
          billId: params.billId,
          sessionId,
          displayName: data.displayName,
        },
      })
    }

    return NextResponse.json({ participant, sessionId }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    console.error('Error joining bill:', error)
    return NextResponse.json({ error: 'Failed to join bill' }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { billId: string } }
) {
  try {
    const participants = await prisma.participant.findMany({
      where: { billId: params.billId },
      orderBy: { joinedAt: 'asc' },
    })

    return NextResponse.json({ participants })
  } catch (error) {
    console.error('Error fetching participants:', error)
    return NextResponse.json({ error: 'Failed to fetch participants' }, { status: 500 })
  }
}


