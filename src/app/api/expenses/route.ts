import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const category = searchParams.get('category')
  const property = searchParams.get('property')
  const house = searchParams.get('house')
  const groupBy = searchParams.get('groupBy')

  let query = supabase.from('expenses').select('*').order('date', { ascending: false })

  if (from) query = query.gte('date', from)
  if (to) query = query.lte('date', to)
  if (category) query = query.eq('category', category)
  if (property) query = query.eq('property', property)
  if (house) query = query.eq('house', house)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (groupBy === 'category' && data) {
    const grouped = data.reduce((acc: Record<string, number>, row) => {
      acc[row.category] = (acc[row.category] || 0) + Number(row.amount)
      return acc
    }, {})
    return NextResponse.json(grouped)
  }

  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { date, amount, category, type, property, house, comment, created_by } = body

  if (!date || !amount || !category || !type || !property || !created_by) {
    return NextResponse.json({ error: 'Заполните обязательные поля' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('expenses')
    .insert({ date, amount, category, type, property, house: house || null, comment: comment || null, created_by })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}
