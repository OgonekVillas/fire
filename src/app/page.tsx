'use client'

import { useEffect, useState, useCallback } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { EXPENSE_CATEGORIES, EXPENSE_TYPES, REVENUE_SOURCES, PROPERTIES, HOUSES, CREATED_BY_OPTIONS } from '@/lib/types'

// ─── Types ───────────────────────────────────────────────────────
interface AiInsight { label: string; text: string; type: 'warning' | 'info' | 'good' }

interface DashData {
  revenue: { today: number; week: number; month: number }
  expenses: { today: number; week: number; month: number }
  profit: { month: number }
  plan: {
    revenue_plan: number; profit_plan: number
    revenue_fact: number; profit_fact: number
    revenue_diff: number; profit_diff: number
    revenue_diff_pct: string | null; profit_diff_pct: string | null
  }
  chart: { date: string; revenue: number; expenses: number }[]
  categories: Record<string, number>
  alerts: { type: 'warning' | 'info'; message: string }[]
}
interface PnlMonth {
  revenue: number; expenses: number; profit: number
  byCategory: Record<string, number>
  revHouse: number; revBath: number; revExtra: number
}

// ─── PnL months: Aug 2025 → Jul 2026 (статический список) ────────
const PNL_MONTHS = [
  { label: 'Авг 25', from: '2025-08-01', to: '2025-08-31' },
  { label: 'Сен 25', from: '2025-09-01', to: '2025-09-30' },
  { label: 'Окт 25', from: '2025-10-01', to: '2025-10-31' },
  { label: 'Ноя 25', from: '2025-11-01', to: '2025-11-30' },
  { label: 'Дек 25', from: '2025-12-01', to: '2025-12-31' },
  { label: 'Янв 26', from: '2026-01-01', to: '2026-01-31' },
  { label: 'Фев 26', from: '2026-02-01', to: '2026-02-28' },
  { label: 'Мар 26', from: '2026-03-01', to: '2026-03-31' },
  { label: 'Апр 26', from: '2026-04-01', to: '2026-04-30' },
  { label: 'Май 26', from: '2026-05-01', to: '2026-05-31' },
  { label: 'Июн 26', from: '2026-06-01', to: '2026-06-30' },
  { label: 'Июл 26', from: '2026-07-01', to: '2026-07-31' },
]

const PNL_ROWS = [
  { label: '💰 ДОХОДЫ', key: 'g_rev', group: true },
  { label: 'Проживание (дома)', key: 'rev_house', revSub: true },
  { label: 'Бани и купели', key: 'rev_bath', revSub: true },
  { label: 'Доп. услуги', key: 'rev_extra', revSub: true },
  { label: 'Итого выручка', key: 'revenue', total: true },
  { label: '📤 ПЕРЕМЕННЫЕ РАСХОДЫ', key: 'g_var', group: true },
  { label: 'Хозтовары', key: 'хозтовары', sub: true },
  { label: 'Расходники (дрова, уголь)', key: 'расходники', sub: true },
  { label: 'Эквайринг / комиссии банка', key: 'эквайринг', sub: true },
  { label: '📤 ПОСТОЯННЫЕ РАСХОДЫ', key: 'g_fixed', group: true },
  { label: 'Персонал (ФОТ)', key: 'персонал', sub: true },
  { label: 'Коммуналка', key: 'коммуналка', sub: true },
  { label: 'Реклама (Директ + ОТА)', key: 'реклама', sub: true },
  { label: 'Аренда / налоги', key: 'налоги и сборы', sub: true },
  { label: '📤 ПРОЧИЕ РАСХОДЫ', key: 'g_other', group: true },
  { label: 'Ремонт / мастера', key: 'ремонт', sub: true },
  { label: 'Прочее (подписки, амортиз.)', key: 'прочее', sub: true },
  { label: 'Итого расходы', key: 'expenses', total: true },
  { label: '🔥 ПРИБЫЛЬ', key: 'profit', profit: true },
  { label: 'Маржа %', key: 'margin', marginRow: true },
]

const PIE_COLORS = ['#eb671c','#1f2e1a','#f0a060','#3a5e30','#fdd8b8','#6a9e60','#c05010','#8b4513','#b8dba8','#9abe90']

// ─── Helpers ─────────────────────────────────────────────────────
const fmt = (n: number | undefined | null, short = false): string => {
  if (n == null) return '—'
  if (n === 0) return '—'
  if (short && Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (short && Math.abs(n) >= 1000) return (n / 1000).toFixed(0) + 'к'
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n)
}
const pct = (p: number, t: number) => t > 0 ? (p / t * 100).toFixed(0) + '%' : ''

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const [w, setW] = useState(0)
  useEffect(() => { setTimeout(() => setW(max > 0 ? Math.min(value / max * 100, 100) : 0), 200) }, [value, max])
  return <div className="pbar"><div className="pfill" style={{ width: `${w}%`, background: color }} /></div>
}

// ─── Form helpers ─────────────────────────────────────────────────
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="flabel">{label}</label>{children}</div>
}

// ─── Expense Form ─────────────────────────────────────────────────
function ExpenseForm({ onDone }: { onDone: () => void }) {
  const today = new Date().toISOString().split('T')[0]
  const [f, setF] = useState({ date: today, amount: '', category: '', type: '', property: PROPERTIES[0], house: '', comment: '', created_by: '' })
  const [st, setSt] = useState<'idle'|'loading'|'ok'|'err'>('idle')
  const [warn, setWarn] = useState<string|null>(null)
  const [err, setErr] = useState('')
  const up = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setWarn(null); setErr('')
    const amt = parseFloat(f.amount)
    // Rule 4: large expense
    const from4 = new Date(); from4.setDate(from4.getDate() - 28)
    const r4 = await fetch(`/api/expenses?from=${from4.toISOString().split('T')[0]}&to=${today}&property=${f.property}`)
    if (r4.ok) {
      const d: {amount:number}[] = await r4.json()
      if (Array.isArray(d) && d.length) {
        const avg = d.reduce((a, r) => a + Number(r.amount), 0) / 4
        if (avg > 0 && amt > avg * 0.2 && !window.confirm('Расход значительно выше среднего. Подтвердите.')) return
      }
    }
    // Rule 1: deferrable + below plan
    if (f.type === 'переносимый') {
      const dash = await fetch(`/api/dashboard?property=${f.property}`).then(r => r.json()).catch(() => null)
      if (dash?.plan?.profit_fact < dash?.plan?.profit_plan) setWarn('Прибыль ниже плана. Рекомендуется перенести этот расход.')
    }
    setSt('loading')
    const res = await fetch('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, amount: amt, house: f.house || null }) })
    if (res.ok) { setSt('ok'); onDone(); setF({ date: today, amount: '', category: '', type: '', property: PROPERTIES[0], house: '', comment: '', created_by: '' }) }
    else { const d = await res.json(); setErr(d.error || 'Ошибка'); setSt('err') }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {warn && <div className="alert aw">⚠️ {warn}</div>}
      {st === 'ok' && <div className="alert aok">✓ Расход сохранён</div>}
      {st === 'err' && <div className="alert ae">✗ {err}</div>}
      <div className="fgrid2">
        <F label="Дата"><input type="date" required value={f.date} onChange={e => up('date', e.target.value)} className="input" /></F>
        <F label="Сумма, ₽"><input type="number" required min="0.01" step="0.01" placeholder="0" value={f.amount} onChange={e => up('amount', e.target.value)} className="input" /></F>
      </div>
      <F label="Категория">
        <select required value={f.category} onChange={e => up('category', e.target.value)} className="input">
          <option value="">— выберите —</option>
          {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </F>
      <F label="Тип">
        <select required value={f.type} onChange={e => up('type', e.target.value)} className="input">
          <option value="">— выберите —</option>
          {EXPENSE_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </F>
      <div className="fgrid2">
        <F label="Объект"><select value={f.property} onChange={e => up('property', e.target.value)} className="input">{PROPERTIES.map(p => <option key={p}>{p}</option>)}</select></F>
        <F label="Дом"><select value={f.house} onChange={e => up('house', e.target.value)} className="input"><option value="">Общий</option>{HOUSES.map(h => <option key={h}>{h}</option>)}</select></F>
      </div>
      <F label="Кто вносит">
        <select required value={f.created_by} onChange={e => up('created_by', e.target.value)} className="input">
          <option value="">— выберите —</option>
          {CREATED_BY_OPTIONS.map(o => <option key={o}>{o}</option>)}
        </select>
      </F>
      <F label="Комментарий"><input type="text" placeholder="Необязательно" value={f.comment} onChange={e => up('comment', e.target.value)} className="input" /></F>
      <button type="submit" disabled={st === 'loading'} className="btn btn-orange" style={{ marginTop: 4 }}>{st === 'loading' ? 'Сохранение...' : 'Сохранить расход'}</button>
    </form>
  )
}

// ─── Revenue Form ─────────────────────────────────────────────────
function RevenueForm({ onDone }: { onDone: () => void }) {
  const today = new Date().toISOString().split('T')[0]
  const [f, setF] = useState({ date: today, amount: '', property: PROPERTIES[0], house: '', source: '' })
  const [st, setSt] = useState<'idle'|'loading'|'ok'|'err'>('idle')
  const [err, setErr] = useState('')
  const up = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSt('loading'); setErr('')
    const res = await fetch('/api/revenue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, amount: parseFloat(f.amount) }) })
    if (res.ok) { setSt('ok'); onDone(); setF({ date: today, amount: '', property: PROPERTIES[0], house: '', source: '' }) }
    else { const d = await res.json(); setErr(d.error || 'Ошибка'); setSt('err') }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {st === 'ok' && <div className="alert aok">✓ Выручка сохранена</div>}
      {st === 'err' && <div className="alert ae">✗ {err}</div>}
      <div className="fgrid2">
        <F label="Дата"><input type="date" required value={f.date} onChange={e => up('date', e.target.value)} className="input" /></F>
        <F label="Сумма, ₽"><input type="number" required min="0.01" step="0.01" placeholder="0" value={f.amount} onChange={e => up('amount', e.target.value)} className="input" /></F>
      </div>
      <div className="fgrid2">
        <F label="Объект"><select value={f.property} onChange={e => up('property', e.target.value)} className="input">{PROPERTIES.map(p => <option key={p}>{p}</option>)}</select></F>
        <F label="Дом"><select required value={f.house} onChange={e => up('house', e.target.value)} className="input"><option value="">— выберите —</option>{HOUSES.map(h => <option key={h}>{h}</option>)}</select></F>
      </div>
      <F label="Источник">
        <select required value={f.source} onChange={e => up('source', e.target.value)} className="input">
          <option value="">— выберите —</option>
          {REVENUE_SOURCES.map(s => <option key={s}>{s}</option>)}
        </select>
      </F>
      <button type="submit" disabled={st === 'loading'} className="btn btn-orange" style={{ marginTop: 4 }}>{st === 'loading' ? 'Сохранение...' : 'Сохранить выручку'}</button>
    </form>
  )
}

// ─── Plan Form ────────────────────────────────────────────────────
function PlanForm() {
  const [f, setF] = useState({ month: new Date().toISOString().slice(0, 7), property: PROPERTIES[0], revenue_plan: '', profit_plan: '' })
  const [st, setSt] = useState<'idle'|'loading'|'ok'|'err'>('idle')
  const [err, setErr] = useState('')
  const up = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSt('loading'); setErr('')
    const res = await fetch('/api/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, month: f.month + '-01', revenue_plan: parseFloat(f.revenue_plan), profit_plan: parseFloat(f.profit_plan) }) })
    if (res.ok) setSt('ok')
    else { const d = await res.json(); setErr(d.error || 'Ошибка'); setSt('err') }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {st === 'ok' && <div className="alert aok">✓ План сохранён</div>}
      {st === 'err' && <div className="alert ae">✗ {err}</div>}
      <div className="fgrid2">
        <F label="Месяц"><input type="month" required value={f.month} onChange={e => up('month', e.target.value)} className="input" /></F>
        <F label="Объект"><select value={f.property} onChange={e => up('property', e.target.value)} className="input">{PROPERTIES.map(p => <option key={p}>{p}</option>)}</select></F>
      </div>
      <div className="fgrid2">
        <F label="План выручки, ₽"><input type="number" required min="0" placeholder="0" value={f.revenue_plan} onChange={e => up('revenue_plan', e.target.value)} className="input" /></F>
        <F label="План прибыли, ₽"><input type="number" required min="0" placeholder="0" value={f.profit_plan} onChange={e => up('profit_plan', e.target.value)} className="input" /></F>
      </div>
      <button type="submit" disabled={st === 'loading'} className="btn btn-orange" style={{ marginTop: 4 }}>{st === 'loading' ? 'Сохранение...' : 'Сохранить план'}</button>
    </form>
  )
}

// ─── Add Sheet ────────────────────────────────────────────────────
function AddSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [tab, setTab] = useState<'expense'|'revenue'|'plan'>('expense')
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="handle" />
        <div style={{ padding: '14px 16px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--brown)' }}>Новая запись</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--muted)', padding: '2px 6px' }}>✕</button>
          </div>
          <div className="tabs" style={{ marginBottom: 16 }}>
            {(['expense','revenue','plan'] as const).map(t => (
              <button key={t} className={`tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
                {t === 'expense' ? '📤 Расход' : t === 'revenue' ? '💰 Выручка' : '🎯 План'}
              </button>
            ))}
          </div>
          {tab === 'expense' && <ExpenseForm onDone={onDone} />}
          {tab === 'revenue' && <RevenueForm onDone={onDone} />}
          {tab === 'plan' && <PlanForm />}
          <div style={{ height: 20 }} />
        </div>
      </div>
    </div>
  )
}

// ─── P&L Table ────────────────────────────────────────────────────
function PnlTable() {
  const [rows, setRows] = useState<(PnlMonth|null)[]>(Array(PNL_MONTHS.length).fill(null))
  const [done, setDone] = useState(false)

  useEffect(() => {
    Promise.all(PNL_MONTHS.map(async m => {
      const [rr, er] = await Promise.all([
        fetch(`/api/revenue?from=${m.from}&to=${m.to}`),
        fetch(`/api/expenses?from=${m.from}&to=${m.to}`)
      ])
      const rd: {amount:number; source:string; house:string}[] = await rr.json()
      const ed: {amount:number; category:string; comment:string}[] = await er.json()
      if (!Array.isArray(rd)) return null
      const revenue = rd.reduce((s, r) => s + Number(r.amount), 0)
      const expenses = ed.reduce((s, r) => s + Number(r.amount), 0)
      const byCategory: Record<string,number> = {}
      ed.forEach(r => { byCategory[r.category] = (byCategory[r.category]||0) + Number(r.amount) })
      // Revenue split: бронирование=дома, доп.услуга=бани+доп
      const revHouse = rd.filter(r => r.source === 'бронирование').reduce((s,r) => s+Number(r.amount), 0)
      const revBath = rd.filter(r => r.source === 'доп. услуга' && r.house !== 'Общее').reduce((s,r) => s+Number(r.amount), 0)
      const revExtra = rd.filter(r => r.source === 'доп. услуга' && r.house === 'Общее').reduce((s,r) => s+Number(r.amount), 0)
      // Separate хозтовары sub-items from comment
      const расходники = ed.filter(r => r.comment?.includes('Расходники') || r.comment?.includes('дрова')).reduce((s,r) => s+Number(r.amount), 0)
      const эквайринг = ed.filter(r => r.comment?.includes('Эквайринг') || r.comment?.includes('комисси')).reduce((s,r) => s+Number(r.amount), 0)
      byCategory['расходники'] = расходники
      byCategory['эквайринг'] = эквайринг
      return { revenue, expenses, profit: revenue - expenses, byCategory, revHouse, revBath, revExtra }
    })).then(d => { setRows(d); setDone(true) })
  }, [])

  const tot = rows.reduce<PnlMonth>((a, d) => {
    if (!d) return a
    a.revenue += d.revenue; a.expenses += d.expenses; a.profit += d.profit
    a.revHouse += d.revHouse; a.revBath += d.revBath; a.revExtra += d.revExtra
    Object.entries(d.byCategory).forEach(([k,v]) => { a.byCategory[k] = (a.byCategory[k]||0)+v })
    return a
  }, { revenue: 0, expenses: 0, profit: 0, byCategory: {}, revHouse: 0, revBath: 0, revExtra: 0 })

  const g = (d: PnlMonth|null, key: string): number => {
    if (!d) return 0
    if (key === 'revenue') return d.revenue
    if (key === 'expenses') return d.expenses
    if (key === 'profit') return d.profit
    if (key === 'rev_house') return d.revHouse
    if (key === 'rev_bath') return d.revBath
    if (key === 'rev_extra') return d.revExtra
    if (key === 'margin') return d.revenue > 0 ? Math.round(d.profit / d.revenue * 100) : 0
    return d.byCategory[key] || 0
  }

  if (!done) return <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '.82rem' }}>Загрузка P&L...</div>

  return (
    <div className="pnl-wrap">
      <table className="pnl">
        <thead>
          <tr>
            <th>Показатель</th>
            {PNL_MONTHS.map(m => <th key={m.label}>{m.label}</th>)}
            <th style={{ background: 'var(--green2)' }}>Итого</th>
          </tr>
        </thead>
        <tbody>
          {PNL_ROWS.map(row => {
            if (row.group) return (
              <tr key={row.key} className="pnl-g"><td colSpan={PNL_MONTHS.length + 2}>{row.label}</td></tr>
            )
            if (row.profit) return (
              <tr key={row.key} className="pnl-profit">
                <td>{row.label}</td>
                {rows.map((d, i) => {
                  const v = g(d, 'profit')
                  return <td key={i} className={v > 0 ? 'ppos' : v < 0 ? 'pneg' : ''}>{v !== 0 ? fmt(v)+' ₽' : '—'}</td>
                })}
                <td className={tot.profit > 0 ? 'ppos' : 'pneg'}>{fmt(tot.profit)} ₽</td>
              </tr>
            )
            if ((row as {marginRow?:boolean}).marginRow) return (
              <tr key={row.key} style={{ background: '#f8f4ed' }}>
                <td style={{ fontSize: '.72rem', color: 'var(--muted)', paddingLeft: 14 }}>Маржа %</td>
                {rows.map((d, i) => {
                  const v = g(d, 'margin')
                  return <td key={i} style={{ fontSize: '.72rem', fontWeight: 700, color: v > 0 ? 'var(--green-pos)' : 'var(--red)' }}>{v !== 0 ? v+'%' : '—'}</td>
                })}
                <td style={{ fontSize: '.72rem', fontWeight: 700, color: tot.revenue > 0 && tot.profit > 0 ? 'var(--green-pos)' : 'var(--red)' }}>
                  {tot.revenue > 0 ? Math.round(tot.profit/tot.revenue*100)+'%' : '—'}
                </td>
              </tr>
            )
            if (row.total) return (
              <tr key={row.key} className="pnl-tot">
                <td>{row.label}</td>
                {rows.map((d, i) => { const v = g(d, row.key); return <td key={i}>{v ? fmt(v)+' ₽' : '—'}</td> })}
                <td>{fmt(g(tot, row.key))} ₽</td>
              </tr>
            )
            const anyData = rows.some(d => g(d, row.key) > 0)
            if (!anyData) return null
            const isRevSub = (row as {revSub?:boolean}).revSub
            return (
              <tr key={row.key} className={row.sub || isRevSub ? 'pnl-sub' : ''}>
                <td>{row.label}</td>
                {rows.map((d, i) => {
                  const v = g(d, row.key)
                  const base = isRevSub ? g(d, 'revenue') : g(d, 'revenue')
                  return (
                    <td key={i}>
                      {v > 0 ? <>{fmt(v)} ₽{base > 0 && <><br/><span className="smol">{pct(v,base)}</span></>}</> : '—'}
                    </td>
                  )
                })}
                <td>{g(tot, row.key) > 0 ? fmt(g(tot, row.key))+' ₽' : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── AI Insights ──────────────────────────────────────────────────
function AiInsights({ data }: { data: DashData }) {
  const [insights, setInsights] = useState<AiInsight[]|null>(null)
  const [loading, setLoading] = useState(false)
  const [hasKey, setHasKey] = useState(false)

  useEffect(() => {
    fetch('/api/ai/status').then(r => r.json()).then(d => setHasKey(d.enabled)).catch(() => {})
  }, [])

  async function analyze() {
    setLoading(true)
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revenue_month: data.revenue.month,
          expenses_month: data.expenses.month,
          profit_month: data.profit.month,
          revenue_week: data.revenue.week,
          expenses_week: data.expenses.week,
          revenue_plan: data.plan.revenue_plan,
          profit_plan: data.plan.profit_plan,
          revenue_diff_pct: data.plan.revenue_diff_pct,
          profit_diff_pct: data.plan.profit_diff_pct,
          categories: data.categories,
        })
      })
      if (res.ok) {
        const d = await res.json()
        setInsights(d.insights)
      }
    } finally {
      setLoading(false)
    }
  }

  const colorMap = { warning: '#eb671c', info: '#3b82f6', good: '#22c55e' }

  return (
    <div className="ai-card fu s7">
      <div className="ai-card-head">
        <div className="ai-card-title">
          ✨ ИИ-аналитика
          {hasKey && <span className="ai-badge">GPT-4o</span>}
          {!hasKey && <span style={{ fontSize: '.65rem', color: 'rgba(248,238,212,.4)', fontWeight: 400 }}>Powered by ChatGPT</span>}
        </div>
        {hasKey && (
          <button className="ai-connect-btn" onClick={analyze} disabled={loading}>
            {loading ? '⏳ Анализирую...' : insights ? '↻ Обновить' : '▶ Запустить анализ'}
          </button>
        )}
      </div>
      <div className="ai-body">
        {!hasKey && (
          <div className="ai-placeholder">
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>🤖</div>
            <div>Подключите ChatGPT для автоматического анализа показателей,<br/>выявления аномалий и рекомендаций по управлению</div>
            <div style={{ marginTop: 14, fontSize: '.72rem', color: 'rgba(248,238,212,.3)' }}>
              Нужен OpenAI API ключ → добавьте OPENAI_API_KEY в .env.local
            </div>
          </div>
        )}
        {hasKey && !insights && !loading && (
          <div className="ai-placeholder">
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>📊</div>
            <div>Нажмите «Запустить анализ» — ИИ проанализирует данные<br/>за неделю и месяц и даст рекомендации</div>
          </div>
        )}
        {loading && (
          <div className="ai-placeholder">
            <div style={{ fontSize: '1.4rem', marginBottom: 8 }}>⏳</div>
            <div>Анализирую данные...</div>
          </div>
        )}
        {insights && insights.map((ins, i) => (
          <div key={i} className="ai-insight" style={{ borderLeftColor: colorMap[ins.type] }}>
            <div className="ai-insight-label">{ins.label}</div>
            <div className="ai-insight-text">{ins.text}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Transaction History ──────────────────────────────────────────
interface TxExpense { id: string; date: string; amount: number; category: string; comment: string|null; created_by: string; type: string }
interface TxRevenue { id: string; date: string; amount: number; house: string; source: string }

function TransactionHistory() {
  const [expenses, setExpenses] = useState<TxExpense[]>([])
  const [revenues, setRevenues] = useState<TxRevenue[]>([])
  const [tab, setTab] = useState<'all'|'expenses'|'revenue'>('all')
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const from = new Date(); from.setDate(from.getDate() - 7)
    const fromStr = from.toISOString().split('T')[0]
    const [er, rr] = await Promise.all([
      fetch(`/api/expenses?from=${fromStr}`).then(r => r.json()),
      fetch(`/api/revenue?from=${fromStr}`).then(r => r.json()),
    ])
    if (Array.isArray(er)) setExpenses(er)
    if (Array.isArray(rr)) setRevenues(rr)
    setLoaded(true)
  }, [])

  useEffect(() => { load() }, [load])

  async function deleteExpense(id: string) {
    if (!confirm('Удалить расход?')) return
    await fetch(`/api/expenses/${id}`, { method: 'DELETE' })
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  async function deleteRevenue(id: string) {
    if (!confirm('Удалить запись о выручке?')) return
    await fetch(`/api/revenue/${id}`, { method: 'DELETE' })
    setRevenues(prev => prev.filter(r => r.id !== id))
  }

  type TxItem =
    | { kind: 'expense'; item: TxExpense }
    | { kind: 'revenue'; item: TxRevenue }

  const allItems: TxItem[] = [
    ...expenses.map(e => ({ kind: 'expense' as const, item: e })),
    ...revenues.map(r => ({ kind: 'revenue' as const, item: r })),
  ].sort((a, b) => b.item.date.localeCompare(a.item.date)).slice(0, 40)

  const shown = tab === 'all' ? allItems
    : tab === 'expenses' ? allItems.filter(x => x.kind === 'expense')
    : allItems.filter(x => x.kind === 'revenue')

  return (
    <div className="card fu s8">
      <div className="ch">
        <span className="ch-title">📋 История · последние 7 дней</span>
        <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{expenses.length + revenues.length} записей</span>
      </div>
      <div style={{ padding: '8px 10px 4px' }}>
        <div className="tabs">
          {(['all','expenses','revenue'] as const).map(t => (
            <button key={t} className={`tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
              {t === 'all' ? 'Все' : t === 'expenses' ? `📤 Расходы (${expenses.length})` : `💰 Выручка (${revenues.length})`}
            </button>
          ))}
        </div>
      </div>
      {!loaded
        ? <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: '.82rem' }}>Загрузка...</div>
        : shown.length === 0
          ? <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: '.82rem' }}>Нет записей за последние 7 дней</div>
          : <div style={{ padding: '4px 0 8px' }}>
              {shown.map(x => (
                x.kind === 'expense'
                  ? <div key={x.item.id} className="divrow" style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: '.72rem', background: '#f3ede0', borderRadius: 4, padding: '1px 6px', fontWeight: 600, color: 'var(--brown)', whiteSpace: 'nowrap' }}>{x.item.category}</span>
                          <span style={{ fontSize: '.72rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{x.item.date.slice(5).replace('-','.')}</span>
                          <span style={{ fontSize: '.7rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.item.comment || ''}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                          <span style={{ fontWeight: 700, fontSize: '.88rem', color: 'var(--red)' }}>−{fmt(x.item.amount)} ₽</span>
                          <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>{x.item.created_by} · {x.item.type}</span>
                        </div>
                      </div>
                      <button onClick={() => deleteExpense(x.item.id)}
                        style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: 6, padding: '4px 8px', fontSize: '.72rem', color: '#ef4444', cursor: 'pointer', flexShrink: 0 }}>
                        ✕
                      </button>
                    </div>
                  : <div key={x.item.id} className="divrow" style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: '.72rem', background: '#dcfce7', borderRadius: 4, padding: '1px 6px', fontWeight: 600, color: '#166534', whiteSpace: 'nowrap' }}>{x.item.source}</span>
                          <span style={{ fontSize: '.72rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{x.item.date.slice(5).replace('-','.')}</span>
                          <span style={{ fontSize: '.7rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.item.house}</span>
                        </div>
                        <span style={{ fontWeight: 700, fontSize: '.88rem', color: 'var(--green-pos)' }}>+{fmt(x.item.amount)} ₽</span>
                      </div>
                      <button onClick={() => deleteRevenue(x.item.id)}
                        style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: 6, padding: '4px 8px', fontSize: '.72rem', color: '#ef4444', cursor: 'pointer', flexShrink: 0 }}>
                        ✕
                      </button>
                    </div>
              ))}
            </div>
      }
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────
export default function Home() {
  const [data, setData] = useState<DashData|null>(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => {
    setLoading(true)
    fetch('/api/dashboard').then(r => r.json()).then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  useEffect(() => { reload() }, [reload, tick])

  const [monthLabel, setMonthLabel] = useState('')
  const [dateLabel, setDateLabel] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string|null>(null)
  useEffect(() => {
    const now = new Date()
    setMonthLabel(now.toLocaleString('ru', { month: 'long', year: 'numeric' }))
    setDateLabel(now.toLocaleDateString('ru', { day: 'numeric', month: 'short' }))
  }, [])

  async function syncBnovo() {
    setSyncing(true); setSyncMsg(null)
    try {
      const res = await fetch('/api/sync/bnovo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const d = await res.json()
      if (d.errors?.length) setSyncMsg(`⚠ ${d.errors[0]}`)
      else setSyncMsg(`✓ Синхронизировано: ${d.synced} записей`)
      setTick(t => t + 1)
    } catch { setSyncMsg('Ошибка синхронизации') }
    finally { setSyncing(false); setTimeout(() => setSyncMsg(null), 5000) }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--muted)' }}>
      <div style={{ fontSize: '2.5rem' }}>🔥</div>
      <p style={{ fontSize: '.88rem' }}>Загрузка данных...</p>
    </div>
  )

  if (!data) return (
    <div style={{ padding: '40px 12px', textAlign: 'center', color: 'var(--red)' }}>
      Ошибка загрузки. Проверь подключение к Supabase.
    </div>
  )

  const profitPos = data.profit.month >= 0
  const marginPct = data.revenue.month > 0 ? (data.profit.month / data.revenue.month * 100) : 0
  const expPct = data.revenue.month > 0 ? Math.round(data.expenses.month / data.revenue.month * 100) : 0
  const pieData = Object.entries(data.categories).sort((a,b) => b[1]-a[1]).map(([name,value]) => ({ name, value }))

  const revDiff = data.plan.revenue_diff
  const profitDiff = data.plan.profit_diff

  return (
    <>
      {showAdd && <AddSheet onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); setTick(t => t+1) }} />}

      {/* NAV */}
      <nav className="nav">
        <span className="nav-logo">🔥 ОГОНЁК</span>
        <div className="nav-right">
          <span className="nav-tag" style={{ background: 'rgba(255,255,255,.12)', color: 'var(--cream)' }}>{dateLabel}</span>
          <span className="nav-tag ai-badge" style={{ cursor: 'default' }}>✨ ИИ-аналитика</span>
          <button onClick={syncBnovo} disabled={syncing}
            style={{ background: syncing ? 'rgba(255,255,255,.1)' : 'rgba(235,103,28,.8)', border: 'none', borderRadius: 8, padding: '5px 10px', color: '#fff', cursor: syncing ? 'not-allowed' : 'pointer', fontSize: '.78rem', fontWeight: 700 }}>
            {syncing ? '⏳' : '⟳ Bnovo'}
          </button>
          <button onClick={() => setTick(t => t+1)}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,.25)', borderRadius: 8, padding: '5px 10px', color: 'rgba(248,238,212,.7)', cursor: 'pointer', fontSize: '.8rem' }}>
            ↻
          </button>
        </div>
      </nav>

      <div className="page-wrap">

        {syncMsg && (
          <div className={`alert ${syncMsg.startsWith('✓') ? 'aok' : syncMsg.startsWith('⚠') ? 'aw' : 'ae'}`}>
            {syncMsg}
          </div>
        )}

        {/* Alerts */}
        {data.alerts.length > 0 && (
          <div className="fu" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.alerts.map((a, i) => (
              <div key={i} className={`alert ${a.type === 'warning' ? 'aw' : 'ai'}`}>
                {a.type === 'warning' ? '⚠️' : 'ℹ️'} {a.message}
              </div>
            ))}
          </div>
        )}

        {/* ── KPI — тройка с планом/отклонением ── */}
        <div className="dash-row dash-row-3">
          {/* Выручка */}
          <div className="card fu s1" style={{ borderTop: '3px solid var(--orange)' }}>
            <div className="card-p">
              <div className="kpi-label">Выручка · месяц</div>
              <div className="kpi-val">{fmt(data.revenue.month, true)} ₽</div>
              {data.plan.revenue_plan > 0 && (
                <>
                  <div className="kpi-plan">план: {fmt(data.plan.revenue_plan, true)} ₽</div>
                  <div className={`kpi-dev ${revDiff >= 0 ? 'kpi-dev-pos' : 'kpi-dev-neg'}`}>
                    {revDiff >= 0 ? '▲ +' : '▼ '}{data.plan.revenue_diff_pct}%&nbsp;
                    ({revDiff >= 0 ? '+' : ''}{fmt(revDiff, true)} ₽)
                  </div>
                  <ProgressBar value={data.plan.revenue_fact} max={data.plan.revenue_plan} color={revDiff >= 0 ? '#1a7a3a' : '#eb671c'} />
                </>
              )}
              <div style={{ marginTop: 8, display: 'flex', gap: 14, fontSize: '.72rem' }}>
                <span style={{ color: 'var(--muted)' }}>Сег.&nbsp;<b style={{ color: 'var(--text)' }}>{fmt(data.revenue.today, true) || '—'}</b></span>
                <span style={{ color: 'var(--muted)' }}>7 дн.&nbsp;<b style={{ color: 'var(--text)' }}>{fmt(data.revenue.week, true) || '—'}</b></span>
              </div>
            </div>
          </div>

          {/* Расходы */}
          <div className="card fu s2" style={{ borderTop: '3px solid var(--green)' }}>
            <div className="card-p">
              <div className="kpi-label">Расходы · месяц</div>
              <div className="kpi-val">{fmt(data.expenses.month, true)} ₽</div>
              <div className="kpi-plan">{expPct}% от выручки</div>
              <div className="kpi-dev kpi-dev-neu">{expPct > 60 ? '⚠ высокая нагрузка' : expPct > 0 ? '✓ в норме' : '—'}</div>
              <div style={{ marginTop: 8, display: 'flex', gap: 14, fontSize: '.72rem' }}>
                <span style={{ color: 'var(--muted)' }}>Сег.&nbsp;<b style={{ color: 'var(--text)' }}>{fmt(data.expenses.today, true) || '—'}</b></span>
                <span style={{ color: 'var(--muted)' }}>7 дн.&nbsp;<b style={{ color: 'var(--text)' }}>{fmt(data.expenses.week, true) || '—'}</b></span>
              </div>
            </div>
          </div>

          {/* Прибыль */}
          <div className="card fu s3" style={{ borderTop: `3px solid ${profitPos ? 'var(--green-pos)' : 'var(--red)'}` }}>
            <div className="card-p">
              <div className="kpi-label">Прибыль · месяц</div>
              <div className="kpi-val" style={{ color: profitPos ? 'var(--green-pos)' : 'var(--red)' }}>
                {fmt(data.profit.month, true)} ₽
              </div>
              {data.plan.profit_plan > 0 && (
                <>
                  <div className="kpi-plan">план: {fmt(data.plan.profit_plan, true)} ₽</div>
                  <div className={`kpi-dev ${profitDiff >= 0 ? 'kpi-dev-pos' : 'kpi-dev-neg'}`}>
                    {profitDiff >= 0 ? '▲ +' : '▼ '}{data.plan.profit_diff_pct}%&nbsp;
                    ({profitDiff >= 0 ? '+' : ''}{fmt(profitDiff, true)} ₽)
                  </div>
                  <ProgressBar value={data.plan.profit_fact} max={data.plan.profit_plan} color={profitDiff >= 0 ? '#1a7a3a' : '#eb671c'} />
                </>
              )}
              <div className={`badge ${profitPos ? 'bp' : 'bn'}`} style={{ marginTop: 8 }}>
                {profitPos ? '▲' : '▼'} маржа {Math.abs(marginPct).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>

        {/* ── 2-col: График + Расходы по статьям ── */}
        <div className="dash-row dash-row-62">
          {/* График динамики */}
          <div className="card fu s4">
            <div className="ch">
              <span className="ch-title">📈 Динамика · месяц</span>
              <div style={{ display: 'flex', gap: 10 }}>
                {[['#eb671c','Выручка'],['#1f2e1a','Расходы']].map(([c,l]) => (
                  <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '.68rem', color: 'var(--muted)' }}>
                    <span style={{ width: 14, height: 3, background: c, borderRadius: 2, display: 'inline-block' }} />{l}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ padding: '10px 6px 8px' }}>
              {data.chart.length === 0
                ? <div style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)', fontSize: '.82rem' }}>Нет данных за текущий месяц</div>
                : <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={data.chart} margin={{ top: 4, right: 10, bottom: 0, left: 0 }}>
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9a8a75' }} tickFormatter={d => d.slice(5)} />
                      <YAxis tick={{ fontSize: 10, fill: '#9a8a75' }} tickFormatter={v => v >= 1000 ? (v/1000).toFixed(0)+'к' : String(v)} width={36} />
                      <Tooltip contentStyle={{ border: '1px solid var(--border)', borderRadius: 9, fontSize: '.78rem' }} formatter={(v: unknown) => [fmt(Number(v))+' ₽']} labelFormatter={l => 'Дата: '+l} />
                      <Line type="monotone" dataKey="revenue" stroke="#eb671c" dot={false} strokeWidth={2.5} />
                      <Line type="monotone" dataKey="expenses" stroke="#1f2e1a" dot={false} strokeWidth={2} strokeDasharray="5 3" />
                    </LineChart>
                  </ResponsiveContainer>
              }
            </div>
          </div>

          {/* Расходы по статьям */}
          {pieData.length > 0 ? (
            <div className="card fu s4">
              <div className="ch">
                <span className="ch-title">Расходы по статьям</span>
                <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{fmt(data.expenses.month, true)} ₽</span>
              </div>
              <div style={{ padding: '10px 16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.entries(data.categories).sort((a,b) => b[1]-a[1]).map(([cat, val]) => (
                  <div key={cat}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: '.82rem', fontWeight: 500 }}>{cat}</span>
                      <span style={{ fontSize: '.82rem', fontWeight: 700 }}>
                        {fmt(val, true)} ₽ <span style={{ fontWeight: 400, color: 'var(--muted)' }}>· {pct(val, data.expenses.month)}</span>
                      </span>
                    </div>
                    <ProgressBar value={val} max={data.expenses.month}
                      color={cat === 'персонал' ? '#1f2e1a' : cat === 'реклама' ? '#eb671c' : cat === 'коммуналка' ? '#f0a060' : '#9abe90'} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="card fu s4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)', fontSize: '.82rem' }}>Нет данных о расходах за текущий месяц</div>
            </div>
          )}
        </div>

        {/* ── 2-col: Структура расходов (pie) + Итоги по P&L ── */}
        {pieData.length > 0 && (
          <div className="dash-row dash-row-26">
            <div className="card fu s5">
              <div className="ch"><span className="ch-title">🗂 Структура расходов</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 0 }}>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={60} innerRadius={30}>
                      {pieData.map((_,i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ border: '1px solid var(--border)', borderRadius: 9, fontSize: '.75rem' }} formatter={(v:unknown) => [fmt(Number(v))+' ₽']} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ padding: '14px 14px 14px 4px', display: 'flex', flexDirection: 'column', gap: 5, justifyContent: 'center' }}>
                  {pieData.map((item, i) => (
                    <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: '.73rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                      <b style={{ fontSize: '.73rem', color: 'var(--brown)' }}>{pct(item.value, data.expenses.month)}</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Краткие итоги */}
            <div className="card fu s5">
              <div className="ch">
                <span className="ch-title">📊 Итоги · {monthLabel || '...'}</span>
                {data.plan.revenue_plan > 0 && <span style={{ fontSize: '.68rem', color: 'var(--muted)' }}>план задан</span>}
              </div>
              <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: 'Выручка', fact: data.plan.revenue_fact, plan: data.plan.revenue_plan, diff: revDiff, p: data.plan.revenue_diff_pct },
                  { label: 'Расходы', fact: data.expenses.month, plan: 0, diff: 0, p: null },
                  { label: 'Прибыль', fact: data.plan.profit_fact, plan: data.plan.profit_plan, diff: profitDiff, p: data.plan.profit_diff_pct },
                ].map(({ label, fact, plan, diff, p }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: '.8rem', color: 'var(--muted)', minWidth: 70 }}>{label}</span>
                    <span style={{ fontWeight: 700, fontSize: '.88rem' }}>{fact ? fmt(fact)+' ₽' : '—'}</span>
                    {plan > 0 && <span style={{ fontSize: '.72rem', color: 'var(--muted)', flexShrink: 0 }}>/ {fmt(plan)}</span>}
                    {p && (
                      <span style={{ fontSize: '.75rem', fontWeight: 700, color: diff >= 0 ? 'var(--green-pos)' : 'var(--red)', flexShrink: 0 }}>
                        {diff >= 0 ? '+' : ''}{p}%
                      </span>
                    )}
                  </div>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Маржа</span>
                  <span style={{ fontWeight: 900, fontSize: '1.1rem', color: profitPos ? 'var(--green-pos)' : 'var(--red)' }}>{Math.abs(marginPct).toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── P&L Table ── */}
        <div className="card fu s6">
          <div className="ch">
            <span className="ch-title">P&amp;L · Авг 2025 — {PNL_MONTHS[PNL_MONTHS.length-1].label}</span>
            <span style={{ fontSize: '.68rem', color: 'var(--muted)' }}>← листайте</span>
          </div>
          <PnlTable />
          <div style={{ padding: '8px 14px', background: 'var(--cream)', fontSize: '.68rem', color: 'var(--muted)', borderTop: '1px solid var(--border)' }}>
            * % считается от выручки месяца
          </div>
        </div>

        {/* ── ИИ-аналитика ── */}
        <AiInsights data={data} />

        {/* ── История транзакций ── */}
        <TransactionHistory key={tick} />

      </div>

      {/* FAB */}
      <button className="fab" onClick={() => setShowAdd(true)}>+</button>
    </>
  )
}
