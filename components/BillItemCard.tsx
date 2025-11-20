'use client'

import { Item, Participant } from '@/lib/api-client'
import { formatNumber } from '@/lib/client-utils'

interface BillItemCardProps {
  item: Item
  participantId?: string
  isPayer: boolean
  billStatus: string
  onClaim: (itemId: string) => void
  onUnclaim: (itemId: string) => void
}

export default function BillItemCard({
  item,
  participantId,
  isPayer,
  billStatus,
  onClaim,
  onUnclaim,
}: BillItemCardProps) {
  const isClaimed = item.claims?.some((claim) => claim.participant.id === participantId) || false
  const claimCount = item.claims?.length || 0
  const canInteract = billStatus === 'OPEN' || billStatus === 'DRAFT'

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">{item.name}</h3>
          {item.notes && <p className="text-sm text-gray-600 mt-1">{item.notes}</p>}
        </div>
        <div className="text-right ml-4">
          <div className="font-semibold text-gray-900">
            {formatNumber(parseFloat(item.totalPrice))}
          </div>
          {claimCount > 0 && (
            <div className="text-xs text-gray-500 mt-1">
              {claimCount} {claimCount === 1 ? 'claim' : 'claims'}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between mt-3">
        <div className="text-sm text-gray-600">
          {item.quantity}x {formatNumber(parseFloat(item.unitPrice))}
        </div>
        {canInteract && participantId && (
          <button
            onClick={() => (isClaimed ? onUnclaim(item.id) : onClaim(item.id))}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              isClaimed
                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                : 'bg-primary-100 text-primary-700 hover:bg-primary-200'
            }`}
          >
            {isClaimed ? 'Unclaim' : 'Claim'}
          </button>
        )}
        {!canInteract && isClaimed && (
          <span className="px-4 py-2 rounded-lg bg-green-100 text-green-700 font-medium">
            Claimed
          </span>
        )}
        {!canInteract && !isClaimed && isPayer && (
          <span className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium text-sm">
            Unclaimed (yours)
          </span>
        )}
      </div>
      {item.claims && item.claims.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="text-xs text-gray-500 mb-1">Claimed by:</div>
          <div className="flex flex-wrap gap-2">
            {item.claims.map((claim) => (
              <span
                key={claim.id}
                className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs"
              >
                {claim.participant.displayName}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

