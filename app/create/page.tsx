'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createWorker } from 'tesseract.js'
import { api } from '@/lib/api-client'
import { formatNumber } from '@/lib/client-utils'

type InputMethod = 'camera' | 'upload' | 'manual'

interface ParsedItem {
  name: string
  quantity: number
  unitPrice: number
  totalPrice: number
  notes?: string
}

export default function CreateBillPage() {
  const router = useRouter()
  const [activeMethod, setActiveMethod] = useState<InputMethod>('camera')
  const [cameraPermission, setCameraPermission] = useState<'granted' | 'denied' | 'prompt' | 'checking'>('checking')
  
  // Common bill info
  const [title, setTitle] = useState('')
  const [payerName, setPayerName] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [taxPercentage, setTaxPercentage] = useState(0)
  const [servicePercentage, setServicePercentage] = useState(0)
  const [tipAmount, setTipAmount] = useState(0)
  const [items, setItems] = useState<ParsedItem[]>([])
  
  // Camera specific
  const videoRef = useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  
  // Upload specific
  const [uploadedImage, setUploadedImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // OCR
  const [processing, setProcessing] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrStatus, setOcrStatus] = useState('')
  const [parsingMethod, setParsingMethod] = useState<'ai' | 'regex'>('ai')
  
  // Manual input
  const [newItem, setNewItem] = useState({
    name: '',
    quantity: 1,
    unitPrice: 0,
    totalPrice: 0,
    notes: '',
  })
  
  const [creating, setCreating] = useState(false)

  // Check camera permission on mount
  useEffect(() => {
    checkCameraPermission()
    return () => {
      stopCamera()
    }
  }, [])

  // Start camera when camera method is selected
  useEffect(() => {
    if (activeMethod === 'camera' && cameraPermission === 'granted') {
      startCamera()
    } else {
      stopCamera()
    }
  }, [activeMethod, cameraPermission])

  const checkCameraPermission = async () => {
    try {
      const result = await navigator.permissions.query({ name: 'camera' as PermissionName })
      setCameraPermission(result.state as 'granted' | 'denied' | 'prompt')
      
      result.addEventListener('change', () => {
        setCameraPermission(result.state as 'granted' | 'denied' | 'prompt')
      })
    } catch (error) {
      // Fallback: assume prompt if permission API not supported
      setCameraPermission('prompt')
    }
  }

  const requestCameraPermission = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      mediaStream.getTracks().forEach(track => track.stop())
      setCameraPermission('granted')
      startCamera()
    } catch (error) {
      setCameraPermission('denied')
    }
  }

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      })
      setStream(mediaStream)
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }
    } catch (error) {
      console.error('Failed to start camera:', error)
      setCameraPermission('denied')
    }
  }

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      setStream(null)
    }
  }

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas')
      canvas.width = videoRef.current.videoWidth
      canvas.height = videoRef.current.videoHeight
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0)
        const imageData = canvas.toDataURL('image/jpeg')
        setCapturedImage(imageData)
        stopCamera()
      }
    }
  }

  const retakePhoto = () => {
    setCapturedImage(null)
    setItems([])
    if (cameraPermission === 'granted') {
      startCamera()
    }
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setUploadedImage(reader.result as string)
        setItems([])
      }
      reader.readAsDataURL(file)
    }
  }

  const clearUpload = () => {
    setUploadedImage(null)
    setItems([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const processOCR = async (imageData: string) => {
    setProcessing(true)
    setOcrProgress(0)
    setOcrStatus('Initializing OCR...')
    setItems([])

    try {
      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setOcrProgress(Math.round(m.progress * 100))
            setOcrStatus(`Processing... ${Math.round(m.progress * 100)}%`)
          }
        },
      })

      setOcrStatus('Extracting text...')
      const { data: { text } } = await worker.recognize(imageData)
      
      setOcrStatus('Parsing items...')
      
      if (parsingMethod === 'ai') {
        try {
          const response = await fetch('/api/ai/parse-bill', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
          })

          if (response.ok) {
            const data = await response.json()
            setItems(data.items || [])
            
            // Automatically populate tax and service percentages if extracted
            if (data.taxPercentage !== undefined && data.taxPercentage > 0) {
              setTaxPercentage(data.taxPercentage)
            }
            if (data.servicePercentage !== undefined && data.servicePercentage > 0) {
              setServicePercentage(data.servicePercentage)
            }
            
            setOcrStatus('AI parsing completed!')
          } else {
            const fallbackItems = parseBillItemsRegex(text)
            setItems(fallbackItems)
            setOcrStatus('Using regex parsing (AI failed)')
          }
        } catch (error) {
          const fallbackItems = parseBillItemsRegex(text)
          setItems(fallbackItems)
          setOcrStatus('Using regex parsing (AI error)')
        }
      } else {
        const parsedItems = parseBillItemsRegex(text)
        setItems(parsedItems)
        setOcrStatus('Regex parsing completed!')
      }

      await worker.terminate()
    } catch (error: any) {
      setOcrStatus(`OCR failed: ${error.message}`)
      console.error('OCR Error:', error)
    } finally {
      setProcessing(false)
    }
  }

  const parseBillItemsRegex = (text: string): ParsedItem[] => {
    const items: ParsedItem[] = []
    const lines = text.split('\n').filter(line => line.trim().length > 0)
    const pricePattern = /[\$]?(\d+\.?\d*)/g
    const currencyPattern = /[\$€£¥]?\s*(\d+\.?\d{2})/

    for (const line of lines) {
      if (
        line.toLowerCase().includes('total') ||
        line.toLowerCase().includes('subtotal') ||
        line.toLowerCase().includes('tax') ||
        line.toLowerCase().includes('tip') ||
        line.toLowerCase().includes('service') ||
        line.toLowerCase().includes('change') ||
        line.toLowerCase().includes('cash') ||
        line.toLowerCase().includes('card') ||
        line.match(/^[A-Z\s]+$/)
      ) {
        continue
      }

      const numbers: number[] = []
      let match
      while ((match = pricePattern.exec(line)) !== null) {
        const num = parseFloat(match[1])
        if (!isNaN(num) && num > 0 && num < 10000) {
          numbers.push(num)
        }
      }

      if (numbers.length === 0) continue

      const firstNumberIndex = line.search(currencyPattern)
      if (firstNumberIndex === -1) continue

      let itemName = line.substring(0, firstNumberIndex).trim()
      itemName = itemName
        .replace(/^\d+x\s*/i, '')
        .replace(/x\d+\s*$/i, '')
        .replace(/[\$€£¥]/g, '')
        .trim()

      if (itemName.length === 0 || itemName.length > 100) continue

      let quantity = 1
      let unitPrice = 0
      let totalPrice = 0

      const quantityMatch = line.match(/^(\d+)\s*x\s*/i)
      if (quantityMatch) {
        quantity = parseInt(quantityMatch[1])
      }

      if (numbers.length === 1) {
        totalPrice = numbers[0]
        unitPrice = totalPrice / quantity
      } else if (numbers.length === 2) {
        if (numbers[0] < 10 && numbers[1] > numbers[0] * 2) {
          quantity = Math.round(numbers[0])
          totalPrice = numbers[1]
          unitPrice = totalPrice / quantity
        } else {
          unitPrice = numbers[0]
          totalPrice = numbers[1]
          quantity = Math.round(totalPrice / unitPrice) || 1
        }
      } else {
        unitPrice = numbers[numbers.length - 2]
        totalPrice = numbers[numbers.length - 1]
        quantity = Math.round(totalPrice / unitPrice) || 1
      }

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

  const addManualItem = () => {
    if (!newItem.name || newItem.unitPrice <= 0) return
    setItems([...items, { ...newItem }])
    setNewItem({ name: '', quantity: 1, unitPrice: 0, totalPrice: 0, notes: '' })
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const handleCreateBill = async () => {
    if (!title || !payerName) {
      alert('Please enter bill title and your name')
      return
    }

    if (items.length === 0) {
      alert('Please add at least one item')
      return
    }

    setCreating(true)
    try {
      const bill = await api.bills.create({
        title,
        currency,
        payerDisplayName: payerName,
        taxPercentage,
        servicePercentage,
        tipAmount,
        items,
      })
      router.push(`/bills/${bill.code}`)
    } catch (error: any) {
      alert(error.message || 'Failed to create bill')
    } finally {
      setCreating(false)
    }
  }

  const toggleMethod = (method: InputMethod) => {
    setActiveMethod(activeMethod === method ? activeMethod : method)
  }

  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0)
  const taxAmount = (subtotal * taxPercentage) / 100
  const serviceAmount = (subtotal * servicePercentage) / 100
  const total = subtotal + taxAmount + serviceAmount + tipAmount

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <button
          onClick={() => router.push('/')}
          className="text-primary-600 hover:text-primary-700 mb-4 inline-block"
        >
          ← Back to home
        </button>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Create New Bill</h1>
        <p className="text-gray-600 mb-8">Choose how to add your bill items</p>

        {/* Bill Information */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">Bill Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="billTitle" className="block text-sm font-medium text-gray-700 mb-2">
                Bill Title <span className="text-red-500">*</span>
              </label>
              <input
                id="billTitle"
                type="text"
                placeholder="e.g., Dinner at Restaurant"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 bg-white placeholder:text-gray-400"
              />
            </div>
            <div>
              <label htmlFor="payerName" className="block text-sm font-medium text-gray-700 mb-2">
                Your Name <span className="text-red-500">*</span>
              </label>
              <input
                id="payerName"
                type="text"
                placeholder="e.g., John Doe"
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 bg-white placeholder:text-gray-400"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <label htmlFor="taxPercentage" className="block text-sm font-medium text-gray-700 mb-2">
                Tax Percentage (%)
              </label>
              <input
                id="taxPercentage"
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="e.g., 10"
                value={taxPercentage || ''}
                onChange={(e) => setTaxPercentage(parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 bg-white placeholder:text-gray-400"
              />
            </div>
            <div>
              <label htmlFor="servicePercentage" className="block text-sm font-medium text-gray-700 mb-2">
                Service Charge (%)
              </label>
              <input
                id="servicePercentage"
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="e.g., 5"
                value={servicePercentage || ''}
                onChange={(e) => setServicePercentage(parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 bg-white placeholder:text-gray-400"
              />
            </div>
          </div>
        </div>

        {/* Input Method Accordion */}
        <div className="bg-white rounded-lg shadow-md mb-6">
          {/* OPTION A: CAMERA */}
          <div className="border-b border-gray-200">
            <button
              onClick={() => toggleMethod('camera')}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">📷</span>
                <div className="text-left">
                  <div className="font-semibold text-gray-900">A. Capture with Camera</div>
                  <div className="text-sm text-gray-500">Take a photo of your receipt directly</div>
                </div>
              </div>
              <span className="text-gray-400">{activeMethod === 'camera' ? '▼' : '▶'}</span>
            </button>
            {activeMethod === 'camera' && (
              <div className="px-6 py-4 border-t border-gray-100">
                {cameraPermission === 'checking' && (
                  <div className="text-center py-8 text-gray-500">Checking camera permissions...</div>
                )}
                
                {cameraPermission === 'denied' && (
                  <div className="text-center py-8">
                    <div className="text-4xl mb-4">🚫</div>
                    <p className="text-gray-700 font-medium mb-2">Camera Access Denied</p>
                    <p className="text-sm text-gray-500 mb-4">Please enable camera access in your browser settings</p>
                  </div>
                )}
                
                {cameraPermission === 'prompt' && (
                  <div className="text-center py-8">
                    <div className="text-4xl mb-4">📸</div>
                    <p className="text-gray-700 font-medium mb-2">Camera Permission Required</p>
                    <p className="text-sm text-gray-500 mb-4">We need access to your camera to capture receipts</p>
                    <button
                      onClick={requestCameraPermission}
                      className="bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
                    >
                      Enable Camera
                    </button>
                  </div>
                )}
                
                {cameraPermission === 'granted' && !capturedImage && (
                  <div className="space-y-4">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      className="w-full rounded-lg bg-black"
                    />
                    <button
                      onClick={capturePhoto}
                      className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 rounded-lg transition-colors"
                    >
                      📸 Capture Photo
                    </button>
                  </div>
                )}
                
                {capturedImage && (
                  <div className="space-y-4">
                    <div className="relative">
                      <img src={capturedImage} alt="Captured receipt" className="w-full rounded-lg" />
                      <button
                        onClick={retakePhoto}
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-2 hover:bg-red-600"
                      >
                        ✕
                      </button>
                    </div>
                    {!processing && items.length === 0 && (
                      <div className="flex gap-2">
                        <select
                          value={parsingMethod}
                          onChange={(e) => setParsingMethod(e.target.value as 'ai' | 'regex')}
                          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                        >
                          <option value="ai">🤖 AI Parsing</option>
                          <option value="regex">🔍 Regex Parsing</option>
                        </select>
                        <button
                          onClick={() => processOCR(capturedImage)}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-lg"
                        >
                          Extract Items
                        </button>
                      </div>
                    )}
                    {processing && (
                      <div className="space-y-2">
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                          <div className="bg-primary-600 h-2.5 rounded-full transition-all" style={{ width: `${ocrProgress}%` }} />
                        </div>
                        <p className="text-sm text-gray-600 text-center">{ocrStatus}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* OPTION B: UPLOAD */}
          <div className="border-b border-gray-200">
            <button
              onClick={() => toggleMethod('upload')}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">📁</span>
                <div className="text-left">
                  <div className="font-semibold text-gray-900">B. Upload from Gallery</div>
                  <div className="text-sm text-gray-500">Choose an existing photo from your device</div>
                </div>
              </div>
              <span className="text-gray-400">{activeMethod === 'upload' ? '▼' : '▶'}</span>
            </button>
            {activeMethod === 'upload' && (
              <div className="px-6 py-4 border-t border-gray-100">
                {!uploadedImage ? (
                  <div
                    className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-primary-500 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="text-4xl mb-4">📤</div>
                    <p className="text-gray-600 mb-2">Click to upload receipt image</p>
                    <p className="text-sm text-gray-500">PNG, JPG, JPEG up to 10MB</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="relative">
                      <img src={uploadedImage} alt="Uploaded receipt" className="w-full rounded-lg max-h-96 object-contain" />
                      <button
                        onClick={clearUpload}
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-2 hover:bg-red-600"
                      >
                        ✕
                      </button>
                    </div>
                    {!processing && items.length === 0 && (
                      <div className="flex gap-2">
                        <select
                          value={parsingMethod}
                          onChange={(e) => setParsingMethod(e.target.value as 'ai' | 'regex')}
                          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                        >
                          <option value="ai">🤖 AI Parsing</option>
                          <option value="regex">🔍 Regex Parsing</option>
                        </select>
                        <button
                          onClick={() => processOCR(uploadedImage)}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-lg"
                        >
                          Extract Items
                        </button>
                      </div>
                    )}
                    {processing && (
                      <div className="space-y-2">
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                          <div className="bg-primary-600 h-2.5 rounded-full transition-all" style={{ width: `${ocrProgress}%` }} />
                        </div>
                        <p className="text-sm text-gray-600 text-center">{ocrStatus}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* OPTION C: MANUAL */}
          <div>
            <button
              onClick={() => toggleMethod('manual')}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">✏️</span>
                <div className="text-left">
                  <div className="font-semibold text-gray-900">C. Input Manually</div>
                  <div className="text-sm text-gray-500">Type in each item yourself</div>
                </div>
              </div>
              <span className="text-gray-400">{activeMethod === 'manual' ? '▼' : '▶'}</span>
            </button>
            {activeMethod === 'manual' && (
              <div className="px-6 py-4 border-t border-gray-100 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <input
                    type="text"
                    placeholder="Item name"
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-gray-900 bg-white placeholder:text-gray-400"
                  />
                  <input
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={newItem.quantity}
                    onChange={(e) => {
                      const qty = parseInt(e.target.value) || 1
                      setNewItem({
                        ...newItem,
                        quantity: qty,
                        totalPrice: qty * newItem.unitPrice,
                      })
                    }}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-gray-900 bg-white placeholder:text-gray-400"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Unit price"
                    value={newItem.unitPrice}
                    onChange={(e) => {
                      const price = parseFloat(e.target.value) || 0
                      setNewItem({
                        ...newItem,
                        unitPrice: price,
                        totalPrice: newItem.quantity * price,
                      })
                    }}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-gray-900 bg-white placeholder:text-gray-400"
                  />
                  <button
                    onClick={addManualItem}
                    className="bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Items List */}
        {items.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Items ({items.length})</h2>
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">{item.name}</div>
                    <div className="text-sm text-gray-600">
                      {item.quantity}x {formatNumber(item.unitPrice)} = {formatNumber(item.totalPrice)}
                    </div>
                  </div>
                  <button
                    onClick={() => removeItem(index)}
                    className="text-red-600 hover:text-red-800 font-medium ml-4"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary */}
        {items.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Summary</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{formatNumber(subtotal)}</span>
              </div>
              {taxPercentage > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Tax ({taxPercentage}%):</span>
                  <span>{formatNumber(taxAmount)}</span>
                </div>
              )}
              {servicePercentage > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Service ({servicePercentage}%):</span>
                  <span>{formatNumber(serviceAmount)}</span>
                </div>
              )}
              {tipAmount > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Tip:</span>
                  <span>{formatNumber(tipAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span>Total:</span>
                <span>{formatNumber(total)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={handleCreateBill}
            disabled={creating || items.length === 0}
            className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? 'Creating Bill...' : 'Create Bill & Share'}
          </button>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

