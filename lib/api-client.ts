const API_BASE = '/api'

export interface Bill {
  id: string
  code: string
  title: string
  currency: string
  payerDisplayName: string
  taxPercentage: string
  servicePercentage: string
  tipAmount: string
  status: 'DRAFT' | 'OPEN' | 'PENDING' | 'FINALIZED' | 'ARCHIVED'
  items: Item[]
  participants: Participant[]
  finalTotals?: FinalTotal[]
}

export interface Item {
  id: string
  name: string
  quantity: number
  unitPrice: string
  totalPrice: string
  notes?: string
  claims?: Claim[]
}

export interface Participant {
  id: string
  displayName: string
  isPayer: boolean
  joinedAt: string
}

export interface Claim {
  id: string
  participant: Participant
}

export interface FinalTotal {
  participant: Participant
  subtotal: string
  taxShare: string
  serviceShare: string
  tipShare: string
  total: string
}

export interface ParticipantTotal {
  participantId: string
  displayName: string
  subtotal: string
  taxShare: string
  serviceShare: string
  tipShare: string
  total: string
}

function getSessionId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('sessionId')
}

function setSessionId(sessionId: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('sessionId', sessionId)
}

async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const sessionId = getSessionId()
  
  // Build headers as a mutable Record<string, string> to allow dynamic key assignment
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // Merge existing headers (cast to Record for simplicity since we control all API calls)
  if (options.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => {
        headers[key] = value
      })
    } else if (Array.isArray(options.headers)) {
      options.headers.forEach(([key, value]) => {
        headers[key] = value
      })
    } else {
      Object.assign(headers, options.headers as Record<string, string>)
    }
  }

  // Add session ID header conditionally
  if (sessionId) {
    headers['x-session-id'] = sessionId
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: headers as HeadersInit,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || 'Request failed')
  }

  return response.json()
}

export const api = {
  bills: {
    create: async (data: {
      title: string
      currency?: string
      payerDisplayName: string
      taxPercentage?: number
      servicePercentage?: number
      tipAmount?: number
      items?: Array<{
        name: string
        quantity?: number
        unitPrice: number
        totalPrice: number
        notes?: string
      }>
    }) => {
      const result = await fetchAPI('/bills', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      if (result.sessionId) {
        setSessionId(result.sessionId)
      }
      return result.bill as Bill
    },
    getByCode: async (code: string) => {
      const result = await fetchAPI(`/bills?code=${code}`)
      return result.bill as Bill
    },
    get: async (billId: string) => {
      const result = await fetchAPI(`/bills/${billId}`)
      return result.bill as Bill
    },
    update: async (billId: string, data: {
      title?: string
      taxPercentage?: number
      servicePercentage?: number
      tipAmount?: number
    }) => {
      const result = await fetchAPI(`/bills/${billId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      })
      return result.bill as Bill
    },
    finalize: async (billId: string) => {
      const result = await fetchAPI(`/bills/${billId}/finalize`, {
        method: 'POST',
      })
      return result.bill as Bill
    },
  },
  items: {
    create: async (billId: string, data: {
      name: string
      quantity?: number
      unitPrice: number
      totalPrice: number
      notes?: string
    }) => {
      const result = await fetchAPI(`/bills/${billId}/items`, {
        method: 'POST',
        body: JSON.stringify(data),
      })
      return result.item as Item
    },
    update: async (billId: string, itemId: string, data: {
      name?: string
      quantity?: number
      unitPrice?: number
      totalPrice?: number
      notes?: string
    }) => {
      const result = await fetchAPI(`/bills/${billId}/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      })
      return result.item as Item
    },
    delete: async (billId: string, itemId: string) => {
      await fetchAPI(`/bills/${billId}/items/${itemId}`, {
        method: 'DELETE',
      })
    },
  },
  participants: {
    join: async (billId: string, displayName: string, sessionId?: string) => {
      const result = await fetchAPI(`/bills/${billId}/participants`, {
        method: 'POST',
        body: JSON.stringify({ displayName, sessionId }),
      })
      if (result.sessionId) {
        setSessionId(result.sessionId)
      }
      return { participant: result.participant as Participant, sessionId: result.sessionId }
    },
    list: async (billId: string) => {
      const result = await fetchAPI(`/bills/${billId}/participants`)
      return result.participants as Participant[]
    },
  },
  claims: {
    claim: async (billId: string, itemId: string, participantId: string) => {
      const result = await fetchAPI(`/bills/${billId}/items/${itemId}/claim`, {
        method: 'POST',
        body: JSON.stringify({ participantId }),
      })
      return result.claim as Claim
    },
    unclaim: async (billId: string, itemId: string, participantId: string) => {
      await fetchAPI(`/bills/${billId}/items/${itemId}/unclaim`, {
        method: 'POST',
        body: JSON.stringify({ participantId }),
      })
    },
  },
  totals: {
    get: async (billId: string) => {
      const result = await fetchAPI(`/bills/${billId}/totals`)
      return {
        totals: result.totals as ParticipantTotal[],
        isFinal: result.isFinal as boolean,
      }
    },
  },
}

