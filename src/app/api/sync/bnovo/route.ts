import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const BNOVO_BASE = 'https://api.pms.bnovo.ru'
const ACCOUNT_ID = process.env.BNOVO_ACCOUNT_ID!
const TOKEN = process.env.BNOVO_TOKEN!
const PROPERTY = 'Ogonek'

export async function POST(req: NextRequest) {
  if (!TOKEN) return NextResponse.json({ error: 'Bnovo token not configured' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const dateFrom = body.from || new Date(Date.now() - 180 * 86400000).toISOString().split('T')[0]
  const dateTo = body.to || new Date().toISOString().split('T')[0]
  const debug = body.debug ?? false

  const attempts: { url: string; status: number; body: string }[] = []

  // Step 1: Get JWT via /api/v1/auth (id + password)
  let jwt: string | null = null
  const { apiPassword, secret } = (() => {
    const decoded = Buffer.from(TOKEN, 'base64').toString('utf-8')
    const [a, s] = decoded.split('|')
    return { apiPassword: a, secret: s }
  })()

  for (const pwd of [TOKEN, apiPassword, secret]) {
    try {
      const ctrl = new AbortController()
      setTimeout(() => ctrl.abort(), 6000)
      const res = await fetch(`${BNOVO_BASE}/api/v1/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ id: ACCOUNT_ID, password: pwd }),
        signal: ctrl.signal,
      })
      const text = await res.text()
      attempts.push({ url: `${BNOVO_BASE}/api/v1/auth`, status: res.status, body: text.slice(0, 300) })
      if (res.ok) {
        const d = JSON.parse(text)
        jwt = d?.data?.access_token || null
        if (jwt) break
      }
    } catch (e) {
      attempts.push({ url: `${BNOVO_BASE}/api/v1/auth`, status: 0, body: String(e) })
    }
  }

  if (!jwt) {
    return NextResponse.json({ synced: 0, skipped: 0, error: 'Auth failed', debug: attempts })
  }

  const headers = {
    'Authorization': `Bearer ${jwt}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  }

  // Step 2: Fetch bookings with pagination (max limit=50)
  interface BnovoBooking {
    id: number | string
    amount?: number; total_price?: number; price?: number; sum?: number
    room_name?: string
    status?: { id?: number; name?: string } | string
    dates?: { arrival?: string; departure?: string; create_date?: string }
    arrival?: string; check_in?: string; date_from?: string
  }

  let bookings: BnovoBooking[] = []
  const PAGE = 50

  // Fetch all pages
  for (let offset = 0; offset < 1000; offset += PAGE) {
    const url = `${BNOVO_BASE}/api/v1/bookings?date_from=${dateFrom}&date_to=${dateTo}&data_type=checkmate&limit=${PAGE}&offset=${offset}`
    try {
      const ctrl = new AbortController()
      setTimeout(() => ctrl.abort(), 8000)
      const res = await fetch(url, { headers, signal: ctrl.signal })
      const text = await res.text()
      if (offset === 0) attempts.push({ url, status: res.status, body: text.slice(0, 800) })

      if (!res.ok) break
      let parsed: unknown
      try { parsed = JSON.parse(text) } catch { break }

      const d = parsed as Record<string, unknown>
      const nested = (d.data && typeof d.data === 'object' && !Array.isArray(d.data)) ? d.data as Record<string, unknown> : null
      const arr = Array.isArray(parsed) ? parsed as BnovoBooking[]
        : nested && Array.isArray(nested.bookings) ? nested.bookings as BnovoBooking[]
        : Array.isArray(d.bookings) ? d.bookings as BnovoBooking[]
        : Array.isArray(d.data) ? d.data as BnovoBooking[]
        : Array.isArray(d.result) ? d.result as BnovoBooking[]
        : Array.isArray(d.items) ? d.items as BnovoBooking[]
        : null

      if (arr === null) {
        if (debug) attempts[attempts.length - 1].body = JSON.stringify(Object.keys(d)) + ' | ' + text.slice(0, 400)
        break
      }
      bookings.push(...arr)
      if (arr.length < PAGE) break // no more pages
    } catch (e) {
      attempts.push({ url: `offset=${offset}`, status: 0, body: String(e) })
      break
    }
  }

  if (debug || bookings.length === 0) {
    return NextResponse.json({ synced: 0, skipped: 0, debug: { dateFrom, dateTo, attempts, bookings_found: bookings.length } })
  }

  // Upsert into Supabase
  const records = bookings
    .filter(b => {
      const statusName = typeof b.status === 'object' ? (b.status?.name || '') : (b.status || '')
      const statusId = typeof b.status === 'object' ? b.status?.id : null
      return statusId !== 5 && !['отменён', 'отменена', 'cancelled', 'canceled'].includes(statusName.toLowerCase())
    })
    .map(b => ({
      date: (b.dates?.arrival || b.arrival || b.check_in || b.date_from || dateFrom).slice(0, 10),
      amount: Number(b.amount || b.total_price || b.price || b.sum) || 0,
      property: PROPERTY,
      house: b.room_name || 'Неизвестный',
      source: 'бронирование' as const,
      external_id: `bnovo_${b.id}`,
      created_at: new Date().toISOString(),
    }))
    .filter(r => r.amount > 0)

  let synced = 0, skipped = 0
  const errors: string[] = []

  for (const record of records) {
    const { error } = await supabase
      .from('revenue')
      .upsert(record, { onConflict: 'external_id', ignoreDuplicates: false })
    if (error) { skipped++; errors.push(error.message) }
    else synced++
  }

  return NextResponse.json({ synced, skipped, total: records.length, errors: errors.length > 0 ? errors.slice(0, 3) : undefined })
}

export async function GET() {
  return NextResponse.json({ configured: !!TOKEN, base: BNOVO_BASE })
}
