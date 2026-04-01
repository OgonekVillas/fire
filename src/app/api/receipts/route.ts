import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { EXPENSE_CATEGORIES } from '@/lib/types'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OpenAI not configured' }, { status: 403 })
  }

  try {
    const form = await req.formData()
    const file = form.get('image') as File | null
    if (!file) return NextResponse.json({ error: 'No image' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mime = file.type || 'image/jpeg'

    const today = new Date().toISOString().split('T')[0]
    const categories = EXPENSE_CATEGORIES.join(', ')

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Это фото чека. Извлеки данные и верни JSON без markdown.

Поля:
- amount: число (сумма итого в рублях, без копеек)
- date: "YYYY-MM-DD" (дата чека, если нет — "${today}")
- category: одна из категорий: ${categories}
- comment: краткое описание (магазин + что куплено, до 60 символов)

Правила выбора категории:
- хозтовары: магазины типа Леруа, OBI, стройматериалы, хозяйственные товары, моющие средства
- расходники: дрова, уголь, газ, топливо
- персонал: зарплата, аванс
- коммуналка: электричество, вода, интернет, ЖКХ
- реклама: реклама, маркетинг, продвижение
- ремонт: ремонт, мастера, стройка
- прочее: всё остальное

Верни только JSON, без пояснений.`,
          },
          {
            type: 'image_url',
            image_url: { url: `data:${mime};base64,${base64}`, detail: 'low' },
          },
        ],
      }],
    })

    const text = response.choices[0]?.message?.content?.trim() || ''
    const json = JSON.parse(text.replace(/```json?\n?/g, '').replace(/```/g, '').trim())

    return NextResponse.json({
      amount: String(Math.round(Number(json.amount) || 0)),
      date: json.date || today,
      category: json.category || '',
      comment: json.comment || '',
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
