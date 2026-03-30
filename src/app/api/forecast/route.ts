import { NextResponse } from 'next/server'

const BNOVO_BASE = 'https://api.pms.bnovo.ru'
const ACCOUNT_ID = process.env.BNOVO_ACCOUNT_ID!
const TOKEN = process.env.BNOVO_TOKEN!

export async function GET() {
  if (!TOKEN) return NextResponse.json({ error: 'Not configured' }, { status: 403 })

  // Auth
  const { apiPassword } = (() => {
    const decoded = Buffer.from(TOKEN, 'base64').toString('utf-8')
    const [a] = decoded.split('|')
    return { apiPassword: a }
  })()

  let jwt: string | null = null
  for (const pwd of [TOKEN, apiPassword]) {
    try {
      const res = await fetch(`${BNOVO_BASE}/api/v1/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id: ACCOUNT_ID, password: pwd }),
      })
      if (res.ok) {
        const d = await res.json()
        jwt = d?.data?.access_token || null
        if (jwt) break
      }
    } catch { /* ignore */ }
  }

  if (!jwt) return NextResponse.json({ error: 'Auth failed' }, { status: 401 })

  const headers = { Authorization: `Bearer ${jwt}`, Accept: 'application/json' }

  const today = new Date()
  const dateFrom = today.toISOString().split('T')[0]
  const dateTo = new Date(today.getTime() + 90 * 86400000).toISOString().split('T')[0]

  interface Booking {
    id: number | string
    amount?: number; total_price?: number; price?: number; sum?: number
    room_name?: string
    status?: { id?: number; name?: string } | string
    dates?: { arrival?: string; departure?: string }
    arrival?: string
  }

  const bookings: Booking[] = []
  const PAGE = 50

  for (let offset = 0; offset < 1000; offset += PAGE) {
    try {
      const res = await fetch(
        `${BNOVO_BASE}/api/v1/bookings?date_from=${dateFrom}&date_to=${dateTo}&data_type=checkmate&limit=${PAGE}&offset=${offset}`,
        { headers }
      )
      if (!res.ok) break
      const d = await res.json() as Record<string, unknown>
      const nested = (d.data && typeof d.data === 'object' && !Array.isArray(d.data)) ? d.data as Record<string, unknown> : null
      const arr = Array.isArray(d) ? d as Booking[]
        : nested && Array.isArray(nested.bookings) ? nested.bookings as Booking[]
        : Array.isArray(d.bookings) ? d.bookings as Booking[]
        : Array.isArray(d.data) ? d.data as Booking[]
        : null
      if (!arr) break
      bookings.push(...arr)
      if (arr.length < PAGE) break
    } catch { break }
  }

  // Filter cancelled
  const active = bookings.filter(b => {
    const statusId = typeof b.status === 'object' ? b.status?.id : null
    const statusName = typeof b.status === 'object' ? (b.status?.name || '') : (b.status || '')
    return statusId !== 5 && !['отменён', 'отменена', 'cancelled', 'canceled'].includes(String(statusName).toLowerCase())
  })

  // Group by month
  const byMonth: Record<string, { count: number; revenue: number }> = {}
  for (const b of active) {
    const date = (b.dates?.arrival || b.arrival || dateFrom).slice(0, 7) // YYYY-MM
    const amount = Number(b.amount || b.total_price || b.price || b.sum) || 0
    if (!byMonth[date]) byMonth[date] = { count: 0, revenue: 0 }
    byMonth[date].count++
    byMonth[date].revenue += amount
  }

  const months = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v }))

  return NextResponse.json({ total: active.length, months })
}
