'use client'

import { useState, useRef } from 'react'
import { createWorker } from 'tesseract.js'
import { formatCurrency } from '@/lib/client-utils'

interface ParsedItem {
  name: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

export default function OCRTestPage() {
  const [image, setImage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<string>('')
  const [extractedText, setExtractedText] = useState<string>('')
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([])
  const [parsingMethod, setParsingMethod] = useState<'ai' | 'regex'>('ai')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setImage(reader.result as string)
        setExtractedText('')
        setParsedItems([])
      }
      reader.readAsDataURL(file)
    }
  }

  const processImage = async () => {
    if (!image) return

    setLoading(true)
    setProgress(0)
    setStatus('Initializing Tesseract...')
    setExtractedText('')
    setParsedItems([])

    try {
      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100))
            setStatus(`Processing... ${Math.round(m.progress * 100)}%`)
          } else {
            setStatus(m.status)
          }
        },
      })

      setStatus('Recognizing text...')
      const { data: { text } } = await worker.recognize(image)

      setExtractedText(text)
      setStatus('Text extracted successfully!')
      
      // Parse items based on selected method
      if (parsingMethod === 'ai') {
        setStatus('Parsing with AI...')
        try {
          const response = await fetch('/api/ai/parse-bill', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text }),
          })

          if (response.ok) {
            const data = await response.json()
            setParsedItems(data.items || [])
            setStatus('AI parsing completed!')
          } else {
            const error = await response.json()
            setStatus(`AI parsing failed: ${error.error || 'Unknown error'}`)
            // Fallback to regex parsing
            const items = parseBillItems(text)
            setParsedItems(items)
          }
        } catch (error: any) {
          setStatus(`AI parsing error: ${error.message}`)
          // Fallback to regex parsing
          const items = parseBillItems(text)
          setParsedItems(items)
        }
      } else {
        // Use regex parsing
        const items = parseBillItems(text)
        setParsedItems(items)
        setStatus('Regex parsing completed!')
      }

      await worker.terminate()
    } catch (error: any) {
      setStatus(`Error: ${error.message}`)
      console.error('OCR Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const parseBillItems = (text: string): ParsedItem[] => {
    const items: ParsedItem[] = []
    const lines = text.split('\n').filter(line => line.trim().length > 0)

    // Common patterns for bill items:
    // - "Item Name $10.00"
    // - "Item Name 2x $5.00 $10.00"
    // - "Item Name 10.00"
    // - "Item Name $10.00 $20.00" (quantity x price = total)

    const pricePattern = /[\$]?(\d+\.?\d*)/g
    const currencyPattern = /[\$€£¥]?\s*(\d+\.?\d{2})/

    for (const line of lines) {
      // Skip lines that look like headers, totals, or tax
      if (
        line.toLowerCase().includes('total') ||
        line.toLowerCase().includes('subtotal') ||
        line.toLowerCase().includes('tax') ||
        line.toLowerCase().includes('tip') ||
        line.toLowerCase().includes('service') ||
        line.toLowerCase().includes('change') ||
        line.toLowerCase().includes('cash') ||
        line.toLowerCase().includes('card') ||
        line.match(/^[A-Z\s]+$/) // All caps (likely header)
      ) {
        continue
      }

      // Extract all numbers from the line
      const numbers: number[] = []
      let match
      while ((match = pricePattern.exec(line)) !== null) {
        const num = parseFloat(match[1])
        if (!isNaN(num) && num > 0 && num < 10000) {
          numbers.push(num)
        }
      }

      if (numbers.length === 0) continue

      // Try to extract item name (everything before the first number)
      const firstNumberIndex = line.search(currencyPattern)
      if (firstNumberIndex === -1) continue

      let itemName = line.substring(0, firstNumberIndex).trim()
      
      // Clean up item name
      itemName = itemName
        .replace(/^\d+x\s*/i, '') // Remove leading quantity like "2x "
        .replace(/x\d+\s*$/i, '') // Remove trailing quantity like " x2"
        .replace(/[\$€£¥]/g, '') // Remove currency symbols
        .trim()

      if (itemName.length === 0 || itemName.length > 100) continue

      // Determine quantity, unit price, and total
      let quantity = 1
      let unitPrice = 0
      let totalPrice = 0

      // Check if line starts with quantity (e.g., "2x Item Name $10.00")
      const quantityMatch = line.match(/^(\d+)\s*x\s*/i)
      if (quantityMatch) {
        quantity = parseInt(quantityMatch[1])
        itemName = itemName.replace(/^\d+x\s*/i, '').trim()
      }

      if (numbers.length === 1) {
        // Only one number - assume it's the total price
        totalPrice = numbers[0]
        unitPrice = totalPrice / quantity
      } else if (numbers.length === 2) {
        // Two numbers - could be unit price and total, or quantity and price
        // If first number is small (< 10) and second is larger, might be quantity
        if (numbers[0] < 10 && numbers[1] > numbers[0] * 2) {
          quantity = Math.round(numbers[0])
          totalPrice = numbers[1]
          unitPrice = totalPrice / quantity
        } else {
          // Assume unit price and total
          unitPrice = numbers[0]
          totalPrice = numbers[1]
          quantity = Math.round(totalPrice / unitPrice) || 1
        }
      } else {
        // Multiple numbers - take the last as total, second to last as unit price
        unitPrice = numbers[numbers.length - 2]
        totalPrice = numbers[numbers.length - 1]
        quantity = Math.round(totalPrice / unitPrice) || 1
      }

      // Validate the item
      if (itemName.length > 0 && totalPrice > 0 && totalPrice < 10000) {
        items.push({
          name: itemName,
          quantity: Math.max(1, quantity),
          unitPrice: Math.round(unitPrice * 100) / 100,
          totalPrice: Math.round(totalPrice * 100) / 100,
        })
      }
    }

    return items
  }

  const clearImage = () => {
    setImage(null)
    setExtractedText('')
    setParsedItems([])
    setProgress(0)
    setStatus('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <a
            href="/"
            className="text-primary-600 hover:text-primary-700 mb-4 inline-block"
          >
            ← Back to home
          </a>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">OCR Bill Parser Test</h1>
          <p className="text-gray-600">
            Upload a receipt image to extract text and parse bill items using Tesseract.js OCR
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Image Upload Section */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Upload Receipt Image</h2>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    checked={parsingMethod === 'ai'}
                    onChange={() => setParsingMethod('ai')}
                    className="w-4 h-4 text-primary-600"
                  />
                  <span>🤖 AI</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    checked={parsingMethod === 'regex'}
                    onChange={() => setParsingMethod('regex')}
                    className="w-4 h-4 text-primary-600"
                  />
                  <span>🔍 Regex</span>
                </label>
              </div>
            </div>
            
            {!image ? (
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-primary-500 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="text-4xl mb-4">📸</div>
                <p className="text-gray-600 mb-2">Click to upload or drag and drop</p>
                <p className="text-sm text-gray-500">PNG, JPG, JPEG up to 10MB</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative">
                  <img
                    src={image}
                    alt="Uploaded receipt"
                    className="w-full h-auto rounded-lg border border-gray-200 max-h-96 object-contain"
                  />
                  <button
                    onClick={clearImage}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-2 hover:bg-red-600 transition-colors"
                  >
                    ✕
                  </button>
                </div>
                <button
                  onClick={processImage}
                  disabled={loading}
                  className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Processing...' : 'Extract Text from Image'}
                </button>
                
                {loading && (
                  <div className="space-y-2">
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div
                        className="bg-primary-600 h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                    <p className="text-sm text-gray-600 text-center">{status}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Extracted Text Section */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Extracted Text</h2>
            {extractedText ? (
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                  <pre className="whitespace-pre-wrap text-sm font-mono text-gray-800">
                    {extractedText}
                  </pre>
                </div>
                {parsedItems.length > 0 && (
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold">Parsed Items ({parsedItems.length})</h3>
                      <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
                        {parsingMethod === 'ai' ? '🤖 AI' : '🔍 Regex'}
                      </span>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {parsedItems.map((item, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="flex-1">
                            <div className="font-medium">{item.name}</div>
                            <div className="text-sm text-gray-600">
                              {item.quantity}x {formatCurrency(item.unitPrice)} = {formatCurrency(item.totalPrice)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {extractedText && parsedItems.length === 0 && (
                  <div className="border-t pt-4">
                    <p className="text-sm text-gray-500 text-center">
                      No items parsed. Try adjusting the parsing method.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <div className="text-4xl mb-4">📄</div>
                <p>Upload an image and click "Extract Text" to see results</p>
              </div>
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">📋 Tips for Best Results:</h3>
          <ul className="list-disc list-inside text-sm text-blue-800 space-y-1">
            <li>Use clear, well-lit images of receipts</li>
            <li>Ensure text is readable and not blurry</li>
            <li>Try to capture the entire receipt in the image</li>
            <li>Higher resolution images work better</li>
            <li>The parser works best with standard receipt formats</li>
          </ul>
        </div>
      </div>
    </div>
)

}