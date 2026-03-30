import { NextRequest, NextResponse } from 'next/server'

// Vercel Cron Job — вызывается каждые 4 часа
// Vercel передаёт заголовок Authorization: Bearer CRON_SECRET
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Синхронизируем с апреля 2026 (начало учёта)
  const from = '2026-04-01'
  const to = new Date(Date.now() + 3 * 3600000).toISOString().split('T')[0]

  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

  try {
    const res = await fetch(`${base}/api/sync/bnovo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to }),
    })
    const data = await res.json()
    return NextResponse.json({ ok: true, ...data, ran_at: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
