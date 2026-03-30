import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const property = searchParams.get('property')
  const house = searchParams.get('house')

  let query = supabase.from('revenue').select('*').order('date', { ascending: false })

  if (from) query = query.gte('date', from)
  if (to) query = query.lte('date', to)
  if (property) query = query.eq('property', property)
  if (house) query = query.eq('house', house)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { date, amount, property, house, source } = body

  if (!date || !amount || !property || !house || !source) {
    return NextResponse.json({ error: 'Заполните обязательные поля' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('revenue')
    .insert({ date, amount, property, house, source })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}
