import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0]
}

function startOfWeek(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

function today() {
  return new Date().toISOString().split('T')[0]
}

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function revQ(property: string | null) {
  const q = supabase.from('revenue').select('amount')
  return property ? q.eq('property', property) : q
}

function expQ(property: string | null) {
  const q = supabase.from('expenses').select('amount')
  return property ? q.eq('property', property) : q
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const property = searchParams.get('property')

  const now = new Date()
  const todayStr = today()
  const weekStart = startOfWeek(now)
  const monthStart = startOfMonth(now)
  const prevWeekStart = daysAgo(14)
  const prevWeekEnd = daysAgo(8)

  const [
    revToday, revWeek, revMonth,
    expToday, expWeek, expMonth,
    expMonthByDay, revMonthByDay,
    expByCategory,
    planMonth,
    expPrevWeek, revPrevWeek,
  ] = await Promise.all([
    revQ(property).eq('date', todayStr),
    revQ(property).gte('date', weekStart).lte('date', todayStr),
    revQ(property).gte('date', monthStart).lte('date', todayStr),

    expQ(property).eq('date', todayStr),
    expQ(property).gte('date', weekStart).lte('date', todayStr),
    expQ(property).gte('date', monthStart).lte('date', todayStr),

    (() => {
      const q = supabase.from('expenses').select('date, amount')
      return (property ? q.eq('property', property) : q).gte('date', monthStart).lte('date', todayStr)
    })(),
    (() => {
      const q = supabase.from('revenue').select('date, amount')
      return (property ? q.eq('property', property) : q).gte('date', monthStart).lte('date', todayStr)
    })(),

    (() => {
      const q = supabase.from('expenses').select('category, amount')
      return (property ? q.eq('property', property) : q).gte('date', monthStart).lte('date', todayStr)
    })(),

    property
      ? supabase.from('plans').select('*').eq('month', monthStart).eq('property', property).maybeSingle()
      : supabase.from('plans').select('*').eq('month', monthStart).maybeSingle(),

    expQ(property).gte('date', prevWeekStart).lte('date', prevWeekEnd),
    revQ(property).gte('date', prevWeekStart).lte('date', prevWeekEnd),
  ])

  const sum = (rows: { amount: number }[] | null) =>
    (rows ?? []).reduce((acc, r) => acc + Number(r.amount), 0)

  const revTodayTotal = sum(revToday.data)
  const revWeekTotal = sum(revWeek.data)
  const revMonthTotal = sum(revMonth.data)
  const expTodayTotal = sum(expToday.data)
  const expWeekTotal = sum(expWeek.data)
  const expMonthTotal = sum(expMonth.data)
  const profitMonth = revMonthTotal - expMonthTotal

  // График по дням
  const byDay: Record<string, { revenue: number; expenses: number }> = {}
  for (const r of (revMonthByDay.data ?? [])) {
    if (!byDay[r.date]) byDay[r.date] = { revenue: 0, expenses: 0 }
    byDay[r.date].revenue += Number(r.amount)
  }
  for (const e of (expMonthByDay.data ?? [])) {
    if (!byDay[e.date]) byDay[e.date] = { revenue: 0, expenses: 0 }
    byDay[e.date].expenses += Number(e.amount)
  }
  const chart = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }))

  // Расходы по категориям
  const categories: Record<string, number> = {}
  for (const e of (expByCategory.data ?? [])) {
    categories[e.category] = (categories[e.category] || 0) + Number(e.amount)
  }

  // План vs факт
  const plan = planMonth.data ?? null
  const revPlanTotal = plan?.revenue_plan ?? 0
  const profitPlanTotal = plan?.profit_plan ?? 0

  // Рекомендации
  const alerts: { type: 'warning' | 'info'; message: string }[] = []

  // Правило 2: расходы растут быстрее выручки
  const expPrevTotal = sum(expPrevWeek.data)
  const revPrevTotal = sum(revPrevWeek.data)
  if (expPrevTotal > 0) {
    const expGrowth = ((expWeekTotal - expPrevTotal) / expPrevTotal) * 100
    const revGrowth = revPrevTotal > 0 ? ((revWeekTotal - revPrevTotal) / revPrevTotal) * 100 : -100
    if (expGrowth > 15 && revGrowth < 5) {
      alerts.push({
        type: 'warning',
        message: `Расходы за неделю выросли на ${expGrowth.toFixed(0)}%, выручка — на ${revGrowth.toFixed(0)}%. Проверь статьи расходов.`,
      })
    }
  }

  // Правило 3: прибыль выше плана
  if (profitPlanTotal > 0 && profitMonth > profitPlanTotal) {
    const overPercent = (((profitMonth - profitPlanTotal) / profitPlanTotal) * 100).toFixed(0)
    alerts.push({
      type: 'info',
      message: `Прибыль выше плана на ${overPercent}%. Можно рассмотреть дополнительные закупки или инвестиции.`,
    })
  }

  return NextResponse.json({
    revenue: { today: revTodayTotal, week: revWeekTotal, month: revMonthTotal },
    expenses: { today: expTodayTotal, week: expWeekTotal, month: expMonthTotal },
    profit: { month: profitMonth },
    plan: {
      revenue_plan: revPlanTotal,
      profit_plan: profitPlanTotal,
      revenue_fact: revMonthTotal,
      profit_fact: profitMonth,
      revenue_diff: revMonthTotal - revPlanTotal,
      profit_diff: profitMonth - profitPlanTotal,
      revenue_diff_pct: revPlanTotal > 0 ? (((revMonthTotal - revPlanTotal) / revPlanTotal) * 100).toFixed(1) : null,
      profit_diff_pct: profitPlanTotal > 0 ? (((profitMonth - profitPlanTotal) / profitPlanTotal) * 100).toFixed(1) : null,
    },
    chart,
    categories,
    alerts,
  })
}
