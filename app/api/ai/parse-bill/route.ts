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

interface ParsedBillData {
  items: ParsedItem[]
  taxPercentage?: number
  servicePercentage?: number
  subtotal?: number
  taxAmount?: number
  serviceAmount?: number
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

    // Create a prompt for DeepSeek to parse bill items and extract tax/service info
    const prompt = `You are a bill parsing assistant. Extract bill items and tax/service information from the following receipt text.

Instructions:
1. Extract only actual bill items (food, drinks, products, services)
2. Skip headers, totals, payment method, dates, addresses
3. For each item, extract:
   - name: Clean item name (remove quantity indicators, prices from name)
   - quantity: Number of items (default to 1 if not specified)
   - unitPrice: Price per unit/item
   - totalPrice: Total price for this line item

4. Also extract (if present):
   - subtotal: The subtotal amount before tax/service
   - taxAmount: The tax amount (if shown)
   - serviceAmount: The service charge amount (if shown)
   - taxPercentage: Tax percentage (calculate from subtotal and tax amount if not explicitly shown)
   - servicePercentage: Service charge percentage (calculate from subtotal and service amount if not explicitly shown)

5. Handle various formats:
   - "2x Burger $5.00 $10.00" → quantity: 2, unitPrice: 5.00, totalPrice: 10.00
   - "Pizza $12.50" → quantity: 1, unitPrice: 12.50, totalPrice: 12.50
   - "Tax 10%" or "Tax: $5.00" → extract tax information
   - "Service Charge 5%" or "Service: $2.50" → extract service information

6. Return ONLY valid JSON in this exact format, no explanations, no markdown, no code blocks:
{
  "items": [{"name": "Item Name", "quantity": 1, "unitPrice": 10.00, "totalPrice": 10.00}],
  "subtotal": 100.00,
  "taxAmount": 10.00,
  "taxPercentage": 10,
  "serviceAmount": 5.00,
  "servicePercentage": 5
}

If tax or service information is not found, omit those fields.

Receipt text:
${data.text}

Return only the JSON object:`

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
    let parsedData: ParsedBillData = { items: [] }
    try {
      // Remove markdown code blocks if present
      const jsonContent = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()

      const parsed = JSON.parse(jsonContent)

      // Handle both old format (array) and new format (object with items)
      if (Array.isArray(parsed)) {
        // Old format: just an array of items
        parsedData.items = parsed
      } else if (parsed.items && Array.isArray(parsed.items)) {
        // New format: object with items and tax/service info
        parsedData = {
          items: parsed.items,
          taxPercentage: parsed.taxPercentage,
          servicePercentage: parsed.servicePercentage,
          subtotal: parsed.subtotal,
          taxAmount: parsed.taxAmount,
          serviceAmount: parsed.serviceAmount,
        }
      } else {
        throw new Error('Invalid response format')
      }

      // Validate and clean the items
      parsedData.items = parsedData.items
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

      // Clean and validate tax/service data
      if (parsedData.taxPercentage !== undefined) {
        parsedData.taxPercentage = Math.max(0, Math.min(100, Math.round(parsedData.taxPercentage * 100) / 100))
      }
      if (parsedData.servicePercentage !== undefined) {
        parsedData.servicePercentage = Math.max(0, Math.min(100, Math.round(parsedData.servicePercentage * 100) / 100))
      }
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

    return NextResponse.json(parsedData)
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


