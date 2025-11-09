'use client'

import { ParticipantTotal } from '@/lib/api-client'
import { formatCurrency } from '@/lib/client-utils'

interface TotalsSummaryProps {
  totals: ParticipantTotal[]
  isFinal: boolean
  currency: string
}

export default function TotalsSummary({ totals, currency, isFinal }: TotalsSummaryProps) {
  const grandTotal = totals.reduce((sum, t) => sum + parseFloat(t.total), 0)
  const totalSubtotal = totals.reduce((sum, t) => sum + parseFloat(t.subtotal), 0)
  const totalTax = totals.reduce((sum, t) => sum + parseFloat(t.taxShare), 0)
  const totalService = totals.reduce((sum, t) => sum + parseFloat(t.serviceShare), 0)
  const totalTip = totals.reduce((sum, t) => sum + parseFloat(t.tipShare), 0)

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Totals</h2>
        {!isFinal && (
          <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
            Estimated
          </span>
        )}
        {isFinal && (
          <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
            Final
          </span>
        )}
      </div>

      <div className="space-y-4">
        {totals.map((total) => (
          <div key={total.participantId} className="border-b border-gray-200 pb-3 last:border-0">
            <div className="flex justify-between items-start mb-2">
              <span className="font-medium text-gray-900">{total.displayName}</span>
              <span className="font-bold text-lg text-gray-900">
                {formatCurrency(parseFloat(total.total), currency)}
              </span>
            </div>
            <div className="text-sm text-gray-600 space-y-1 ml-4">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{formatCurrency(parseFloat(total.subtotal), currency)}</span>
              </div>
              {parseFloat(total.taxShare) > 0 && (
                <div className="flex justify-between">
                  <span>Tax:</span>
                  <span>{formatCurrency(parseFloat(total.taxShare), currency)}</span>
                </div>
              )}
              {parseFloat(total.serviceShare) > 0 && (
                <div className="flex justify-between">
                  <span>Service:</span>
                  <span>{formatCurrency(parseFloat(total.serviceShare), currency)}</span>
                </div>
              )}
              {parseFloat(total.tipShare) > 0 && (
                <div className="flex justify-between">
                  <span>Tip:</span>
                  <span>{formatCurrency(parseFloat(total.tipShare), currency)}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t-2 border-gray-300">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Total Subtotal:</span>
            <span>{formatCurrency(totalSubtotal, currency)}</span>
          </div>
          {totalTax > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Total Tax:</span>
              <span>{formatCurrency(totalTax, currency)}</span>
            </div>
          )}
          {totalService > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Total Service:</span>
              <span>{formatCurrency(totalService, currency)}</span>
            </div>
          )}
          {totalTip > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Total Tip:</span>
              <span>{formatCurrency(totalTip, currency)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold pt-2">
            <span>Grand Total:</span>
            <span>{formatCurrency(grandTotal, currency)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

