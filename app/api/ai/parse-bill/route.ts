import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const parseBillSchema = z.object({
  text: z.string().min(1),
})

interface ParsedItem {
  name: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = parseBillSchema.parse(body)

    const deepseekApiKey = process.env.DEEPSEEK_API_KEY
    if (!deepseekApiKey) {
      return NextResponse.json(
        { error: 'DeepSeek API key not configured' },
        { status: 500 }
      )
    }

    // Create a prompt for DeepSeek to parse bill items
    const prompt = `You are a bill parsing assistant. Extract bill items from the following receipt text and return ONLY a valid JSON array of items.

Instructions:
1. Extract only actual bill items (food, drinks, products, services)
2. Skip headers, totals, tax lines, tip lines, payment method, dates, addresses
3. For each item, extract:
   - name: Clean item name (remove quantity indicators, prices from name)
   - quantity: Number of items (default to 1 if not specified)
   - unitPrice: Price per unit/item
   - totalPrice: Total price for this line item

4. Handle various formats:
   - "2x Burger $5.00 $10.00" → quantity: 2, unitPrice: 5.00, totalPrice: 10.00
   - "Pizza $12.50" → quantity: 1, unitPrice: 12.50, totalPrice: 12.50
   - "Coffee 3.50" → quantity: 1, unitPrice: 3.50, totalPrice: 3.50

5. Return ONLY the JSON array, no explanations, no markdown, no code blocks.

Receipt text:
${data.text}

Return format: [{"name": "Item Name", "quantity": 1, "unitPrice": 10.00, "totalPrice": 10.00}, ...]`

    // Call DeepSeek API
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that extracts structured data from receipt text. Always return valid JSON arrays only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('DeepSeek API error:', error)
      return NextResponse.json(
        { error: 'Failed to parse bill with AI', details: error },
        { status: response.status }
      )
    }

    const aiResponse = await response.json()
    const content = aiResponse.choices?.[0]?.message?.content?.trim()

    if (!content) {
      return NextResponse.json(
        { error: 'No response from AI' },
        { status: 500 }
      )
    }

    // Parse the JSON response from AI
    let items: ParsedItem[] = []
    try {
      // Remove markdown code blocks if present
      const jsonContent = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()

      items = JSON.parse(jsonContent)

      // Validate and clean the items
      if (!Array.isArray(items)) {
        throw new Error('Response is not an array')
      }

      items = items
        .filter((item) => {
          return (
            item.name &&
            typeof item.name === 'string' &&
            item.name.trim().length > 0 &&
            typeof item.quantity === 'number' &&
            item.quantity > 0 &&
            typeof item.unitPrice === 'number' &&
            item.unitPrice > 0 &&
            typeof item.totalPrice === 'number' &&
            item.totalPrice > 0
          )
        })
        .map((item) => ({
          name: item.name.trim(),
          quantity: Math.max(1, Math.round(item.quantity)),
          unitPrice: Math.round(item.unitPrice * 100) / 100,
          totalPrice: Math.round(item.totalPrice * 100) / 100,
        }))
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError)
      console.error('AI response content:', content)
      return NextResponse.json(
        {
          error: 'Failed to parse AI response',
          details: parseError instanceof Error ? parseError.message : 'Unknown error',
          rawResponse: content,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ items })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    console.error('Error parsing bill:', error)
    return NextResponse.json(
      { error: 'Failed to parse bill' },
      { status: 500 }
    )
  }
}


