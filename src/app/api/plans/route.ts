import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const month = searchParams.get('month')
  const property = searchParams.get('property')

  let query = supabase.from('plans').select('*').order('month', { ascending: false })

  if (month) query = query.eq('month', month)
  if (property) query = query.eq('property', property)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { month, property, revenue_plan, profit_plan } = body

  if (!month || !property || revenue_plan == null || profit_plan == null) {
    return NextResponse.json({ error: 'Заполните обязательные поля' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('plans')
    .upsert({ month, property, revenue_plan, profit_plan }, { onConflict: 'month,property' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}
