import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

function monthRange(offsetMonths: number) {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1)
  const from = d.toISOString().split('T')[0]
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const to = last.toISOString().split('T')[0]
  return { from, to, year: d.getFullYear(), month: d.getMonth() + 1 }
}

export async function GET() {
  const prev = monthRange(-1)
  const curr = monthRange(0)

  const [prevRev, prevExp, currRev, currExp] = await Promise.all([
    supabase.from('revenue').select('amount').gte('date', prev.from).lte('date', prev.to),
    supabase.from('expenses').select('amount').gte('date', prev.from).lte('date', prev.to),
    supabase.from('revenue').select('amount').gte('date', curr.from).lte('date', curr.to),
    supabase.from('expenses').select('amount').gte('date', curr.from).lte('date', curr.to),
  ])

  const sum = (rows: { amount: number }[] | null) =>
    (rows ?? []).reduce((a, r) => a + Number(r.amount), 0)

  const prevRevTotal = sum(prevRev.data)
  const prevExpTotal = sum(prevExp.data)
  const prevProfit = prevRevTotal - prevExpTotal

  const currRevTotal = sum(currRev.data)
  const currExpTotal = sum(currExp.data)
  const currProfit = currRevTotal - currExpTotal

  // Проецируем текущий месяц до конца на основе прошлого
  const today = new Date()
  const dayOfMonth = today.getDate()
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const progress = dayOfMonth / daysInMonth

  const projectedRev = progress > 0 ? Math.round(currRevTotal / progress) : 0
  const projectedProfit = progress > 0 ? Math.round(currProfit / progress) : 0

  return NextResponse.json({
    prev: { from: prev.from, to: prev.to, month: prev.month, year: prev.year, revenue: prevRevTotal, expenses: prevExpTotal, profit: prevProfit },
    curr: { from: curr.from, to: curr.to, month: curr.month, year: curr.year, revenue: currRevTotal, expenses: currExpTotal, profit: currProfit },
    projected: { revenue: projectedRev, profit: projectedProfit },
    progress: Math.round(progress * 100),
    daysLeft: daysInMonth - dayOfMonth,
  })
}
