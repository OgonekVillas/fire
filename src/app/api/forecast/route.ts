import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

function monthRange(offsetMonths: number) {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1)
  const from = d.toISOString().split('T')[0]
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const to = last.toISOString().split('T')[0]
  return { from, to, year: d.getFullYear(), month: d.getMonth() + 1, daysInMonth: last.getDate() }
}

export async function GET() {
  const prev = monthRange(-1)
  const curr = monthRange(0)

  const today = new Date()
  const dayOfMonth = today.getDate()
  const daysInMonth = curr.daysInMonth

  // Current month to today
  const currToday = today.toISOString().split('T')[0]

  const [prevRev, prevExp, currRev, currExp, prevRevSameDay] = await Promise.all([
    supabase.from('revenue').select('amount').gte('date', prev.from).lte('date', prev.to),
    supabase.from('expenses').select('amount').gte('date', prev.from).lte('date', prev.to),
    supabase.from('revenue').select('amount').gte('date', curr.from).lte('date', currToday),
    supabase.from('expenses').select('amount').gte('date', curr.from).lte('date', currToday),
    // Previous month — same number of days elapsed
    supabase.from('revenue').select('amount')
      .gte('date', prev.from)
      .lte('date', new Date(today.getFullYear(), today.getMonth() - 1, dayOfMonth).toISOString().split('T')[0]),
  ])

  const sum = (rows: { amount: number }[] | null) =>
    (rows ?? []).reduce((a, r) => a + Number(r.amount), 0)

  const prevRevTotal = sum(prevRev.data)
  const prevExpTotal = sum(prevExp.data)
  const currRevFact = sum(currRev.data)
  const currExpFact = sum(currExp.data)
  const prevRevSameDayTotal = sum(prevRevSameDay.data)

  // Daily pace current month
  const currDailyPace = dayOfMonth > 0 ? currRevFact / dayOfMonth : 0
  // Daily pace previous month at same point
  const prevDailyPace = dayOfMonth > 0 ? prevRevSameDayTotal / dayOfMonth : 0

  // Projection: current pace × full month
  const projectedRev = Math.round(currDailyPace * daysInMonth)
  const projectedExp = currExpFact > 0 ? Math.round(currExpFact / dayOfMonth * daysInMonth) : 0
  const projectedProfit = projectedRev - projectedExp

  // Pace comparison vs previous month
  const paceVsPrev = prevDailyPace > 0
    ? Math.round((currDailyPace - prevDailyPace) / prevDailyPace * 100)
    : null

  return NextResponse.json({
    prev: { from: prev.from, to: prev.to, month: prev.month, year: prev.year, revenue: prevRevTotal, expenses: prevExpTotal, profit: prevRevTotal - prevExpTotal },
    curr: { from: curr.from, to: curr.to, month: curr.month, year: curr.year, revenue: currRevFact, expenses: currExpFact, profit: currRevFact - currExpFact },
    projected: { revenue: projectedRev, expenses: projectedExp, profit: projectedProfit },
    pace: { current: Math.round(currDailyPace), prev: Math.round(prevDailyPace), vsPercent: paceVsPrev },
    progress: Math.round(dayOfMonth / daysInMonth * 100),
    dayOfMonth,
    daysInMonth,
    daysLeft: daysInMonth - dayOfMonth,
  })
}
