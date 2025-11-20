'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api, Bill, ParticipantTotal } from '@/lib/api-client'
import BillItemCard from '@/components/BillItemCard'
import TotalsSummary from '@/components/TotalsSummary'
import { formatNumber } from '@/lib/client-utils'

export default function BillViewPage() {
  const params = useParams()
  const router = useRouter()
  const code = params.code as string

  const [bill, setBill] = useState<Bill | null>(null)
  const [totals, setTotals] = useState<ParticipantTotal[]>([])
  const [isFinal, setIsFinal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [participant, setParticipant] = useState<{ id: string; displayName: string } | null>(null)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    loadBill()
  }, [code])

  const loadBill = async () => {
    try {
      const billData = await api.bills.getByCode(code)
      setBill(billData)

      // Check if user is already a participant
      // For MVP, we'll show join modal if bill is open/draft
      // In production, match by sessionId from localStorage
      if (billData.status === 'OPEN' || billData.status === 'DRAFT') {
        // Check if we have a stored participant ID for this bill
        const storedParticipantId = typeof window !== 'undefined' 
          ? localStorage.getItem(`participant_${billData.id}`) 
          : null
        
        if (storedParticipantId) {
          const existingParticipant = billData.participants.find((p) => p.id === storedParticipantId)
          if (existingParticipant) {
            setParticipant({ id: existingParticipant.id, displayName: existingParticipant.displayName })
          } else {
            setShowJoinModal(true)
          }
        } else {
          setShowJoinModal(true)
        }
      }

      loadTotals(billData.id)
    } catch (error: any) {
      alert(error.message || 'Failed to load bill')
    } finally {
      setLoading(false)
    }
  }

  const loadTotals = async (billId: string) => {
    try {
      const result = await api.totals.get(billId)
      setTotals(result.totals)
      setIsFinal(result.isFinal)
    } catch (error) {
      console.error('Failed to load totals:', error)
    }
  }

  const handleJoin = async () => {
    if (!displayName.trim()) {
      alert('Please enter your name')
      return
    }

    if (!bill) return

    try {
      const result = await api.participants.join(bill.id, displayName)
      setParticipant({ id: result.participant.id, displayName: result.participant.displayName })
      // Store participant ID for this bill
      if (typeof window !== 'undefined' && bill) {
        localStorage.setItem(`participant_${bill.id}`, result.participant.id)
      }
      setShowJoinModal(false)
      loadBill()
    } catch (error: any) {
      alert(error.message || 'Failed to join bill')
    }
  }

  const handleClaim = async (itemId: string) => {
    if (!bill || !participant) return

    try {
      await api.claims.claim(bill.id, itemId, participant.id)
      loadBill()
      loadTotals(bill.id)
    } catch (error: any) {
      alert(error.message || 'Failed to claim item')
    }
  }

  const handleUnclaim = async (itemId: string) => {
    if (!bill || !participant) return

    try {
      await api.claims.unclaim(bill.id, itemId, participant.id)
      loadBill()
      loadTotals(bill.id)
    } catch (error: any) {
      alert(error.message || 'Failed to unclaim item')
    }
  }

  const handleFinalize = async () => {
    if (!bill) return

    if (!confirm('Are you sure you want to finalize this bill? This will lock all totals.')) {
      return
    }

    setUpdating(true)
    try {
      await api.bills.finalize(bill.id)
      loadBill()
      loadTotals(bill.id)
    } catch (error: any) {
      alert(error.message || 'Failed to finalize bill')
    } finally {
      setUpdating(false)
    }
  }

  const handleUpdateSettings = async () => {
    if (!bill) return

    const newTax = parseFloat(prompt('Enter tax percentage:', bill.taxPercentage) || '0')
    const newService = parseFloat(prompt('Enter service charge percentage:', bill.servicePercentage) || '0')
    const newTip = parseFloat(prompt('Enter tip amount:', bill.tipAmount) || '0')

    if (isNaN(newTax) || isNaN(newService) || isNaN(newTip)) return

    setUpdating(true)
    try {
      await api.bills.update(bill.id, {
        taxPercentage: newTax,
        servicePercentage: newService,
        tipAmount: newTip,
      })
      loadBill()
      loadTotals(bill.id)
    } catch (error: any) {
      alert(error.message || 'Failed to update settings')
    } finally {
      setUpdating(false)
    }
  }

  const handleShare = () => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    navigator.clipboard.writeText(url).then(() => {
      alert('Share link copied to clipboard!')
    }).catch(() => {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = url
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      alert('Share link copied to clipboard!')
    })
  }

  const isPayer = bill?.participants.some((p) => p.isPayer && p.id === participant?.id) || false
  const canEdit = isPayer && (bill?.status === 'OPEN' || bill?.status === 'DRAFT')

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl font-medium text-gray-700">Loading...</div>
      </div>
    )
  }

  if (!bill) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Bill not found</h1>
          <button
            onClick={() => router.push('/')}
            className="text-primary-600 hover:text-primary-700"
          >
            Go home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => router.push('/')}
            className="text-primary-600 hover:text-primary-700 mb-4 inline-block"
          >
            ← Back to home
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{bill.title}</h1>
              <p className="text-gray-600 mt-1">
                Created by {bill.payerDisplayName} • Code: <span className="font-mono font-semibold">{bill.code}</span>
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleShare}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <span>🔗</span> Share
              </button>
              {canEdit && (
                <>
                  <button
                    onClick={handleUpdateSettings}
                    disabled={updating}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    Settings
                  </button>
                  <button
                    onClick={handleFinalize}
                    disabled={updating || bill.status === 'FINALIZED'}
                    className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {updating ? 'Processing...' : 'Finalize Bill'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Bill Settings</h2>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-gray-600">Tax</div>
                  <div className="font-semibold">{parseFloat(bill.taxPercentage)}%</div>
                </div>
                <div>
                  <div className="text-gray-600">Service</div>
                  <div className="font-semibold">{parseFloat(bill.servicePercentage)}%</div>
                </div>
                <div>
                  <div className="text-gray-600">Tip</div>
                  <div className="font-semibold">{formatNumber(parseFloat(bill.tipAmount))}</div>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-4">Items</h2>
              <div className="space-y-3">
                {bill.items.length === 0 ? (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
                    No items yet
                  </div>
                ) : (
                  bill.items.map((item) => (
                    <BillItemCard
                      key={item.id}
                      item={item}
                      participantId={participant?.id}
                      isPayer={isPayer}
                      billStatus={bill.status}
                      onClaim={handleClaim}
                      onUnclaim={handleUnclaim}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          <div>
            <TotalsSummary totals={totals} isFinal={isFinal} currency={bill.currency} />
          </div>
        </div>

        {showJoinModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h2 className="text-xl font-semibold mb-4">Join Bill</h2>
              <p className="text-gray-600 mb-4">Enter your name to join this bill and claim items.</p>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent mb-4 text-gray-900 bg-white placeholder:text-gray-400"
                onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
              />
              <div className="flex gap-3">
                <button
                  onClick={handleJoin}
                  className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                >
                  Join
                </button>
                <button
                  onClick={() => setShowJoinModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

