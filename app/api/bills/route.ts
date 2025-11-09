import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateBillCode, generateSessionId, toDecimal } from '@/lib/utils'
import { z } from 'zod'

const createBillSchema = z.object({
  title: z.string().min(1),
  currency: z.string().default('USD'),
  payerDisplayName: z.string().min(1),
  taxPercentage: z.number().min(0).max(100).default(0),
  servicePercentage: z.number().min(0).max(100).default(0),
  tipAmount: z.number().min(0).default(0),
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        quantity: z.number().int().positive().default(1),
        unitPrice: z.number().nonnegative(),
        totalPrice: z.number().nonnegative(),
        notes: z.string().optional(),
      })
    )
    .optional()
    .default([]),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = createBillSchema.parse(body)

    const code = generateBillCode()
    const sessionId = generateSessionId()

    const bill = await prisma.bill.create({
      data: {
        code,
        title: data.title,
        currency: data.currency,
        payerDisplayName: data.payerDisplayName,
        payerSessionId: sessionId,
        taxPercentage: toDecimal(data.taxPercentage),
        servicePercentage: toDecimal(data.servicePercentage),
        tipAmount: toDecimal(data.tipAmount),
        status: data.items.length > 0 ? 'OPEN' : 'DRAFT',
        items: {
          create: data.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unitPrice: toDecimal(item.unitPrice),
            totalPrice: toDecimal(item.totalPrice),
            notes: item.notes,
          })),
        },
        participants: {
          create: {
            sessionId,
            displayName: data.payerDisplayName,
            isPayer: true,
          },
        },
      },
      include: {
        items: true,
        participants: true,
      },
    })

    return NextResponse.json({ bill, sessionId }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    console.error('Error creating bill:', error)
    return NextResponse.json({ error: 'Failed to create bill' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')

    if (code) {
      const bill = await prisma.bill.findUnique({
        where: { code },
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

      if (!bill) {
        return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
      }

      return NextResponse.json({ bill })
    }

    return NextResponse.json({ error: 'Code parameter required' }, { status: 400 })
  } catch (error) {
    console.error('Error fetching bill:', error)
    return NextResponse.json({ error: 'Failed to fetch bill' }, { status: 500 })
  }
}


