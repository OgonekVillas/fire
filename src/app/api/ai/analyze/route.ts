import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 403 })

  const body = await req.json()

  const fmt = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n)

  const prompt = `Ты финансовый аналитик базы отдыха "Огонёк" (6 домов в России).
Проанализируй данные и дай 3-4 конкретные рекомендации на русском языке.

Данные за текущий месяц:
- Выручка: ${fmt(body.revenue_month)} ₽ (план: ${body.revenue_plan ? fmt(body.revenue_plan) + ' ₽, отклонение: ' + body.revenue_diff_pct + '%' : 'не задан'})
- Расходы: ${fmt(body.expenses_month)} ₽ (${body.revenue_month > 0 ? Math.round(body.expenses_month / body.revenue_month * 100) : 0}% от выручки)
- Прибыль: ${fmt(body.profit_month)} ₽ (план: ${body.profit_plan ? fmt(body.profit_plan) + ' ₽, отклонение: ' + body.profit_diff_pct + '%' : 'не задан'})
- Маржа: ${body.revenue_month > 0 ? (body.profit_month / body.revenue_month * 100).toFixed(1) : 0}%

За последние 7 дней:
- Выручка: ${fmt(body.revenue_week)} ₽
- Расходы: ${fmt(body.expenses_week)} ₽

Структура расходов: ${Object.entries(body.categories as Record<string,number>).sort((a,b)=>b[1]-a[1]).map(([k,v]) => `${k}: ${fmt(v)} ₽`).join(', ')}

Верни JSON строго в формате:
{"insights": [{"label": "короткий заголовок", "text": "детальная рекомендация 1-2 предложения", "type": "warning|info|good"}]}`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 800,
        temperature: 0.4,
      })
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: err }, { status: res.status })
    }

    const data = await res.json()
    const content = data.choices[0].message.content
    return NextResponse.json(JSON.parse(content))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
