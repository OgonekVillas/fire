import { NextResponse } from 'next/server'

// Координаты базы отдыха — задайте через RESORT_LAT / RESORT_LON в .env.local
const LAT = process.env.RESORT_LAT || '55.7558'
const LON = process.env.RESORT_LON || '37.6173'

export async function GET() {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&hourly=temperature_2m,precipitation_probability&timezone=Europe%2FMoscow&forecast_days=7&current_weather=true`
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return NextResponse.json({ error: 'Weather API error' }, { status: 502 })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
