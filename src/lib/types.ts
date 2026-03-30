export type RevenueSource = 'бронирование' | 'доп. услуга' | 'прочее'

export type ExpenseCategory =
  | 'продукты'
  | 'хозтовары'
  | 'ремонт'
  | 'закупка оборудования'
  | 'персонал'
  | 'коммуналка'
  | 'реклама'
  | 'транспорт'
  | 'налоги и сборы'
  | 'прочее'

export type ExpenseType = 'обязательный' | 'переносимый'

export interface Revenue {
  id: string
  date: string
  amount: number
  property: string
  house: string
  source: RevenueSource
  created_at: string
}

export interface Expense {
  id: string
  date: string
  amount: number
  category: ExpenseCategory
  type: ExpenseType
  property: string
  house: string | null
  comment: string | null
  created_by: string
  created_at: string
}

export interface Plan {
  id: string
  month: string
  property: string
  revenue_plan: number
  profit_plan: number
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'продукты',
  'хозтовары',
  'ремонт',
  'закупка оборудования',
  'персонал',
  'коммуналка',
  'реклама',
  'транспорт',
  'налоги и сборы',
  'прочее',
]

export const EXPENSE_TYPES: ExpenseType[] = [
  'обязательный',
  'переносимый',
]

export const CREATED_BY_OPTIONS = ['Роман', 'Никита']

export const REVENUE_SOURCES: RevenueSource[] = [
  'бронирование',
  'доп. услуга',
  'прочее',
]

export const PROPERTIES = ['Ogonek']

export const HOUSES = ['Дом 1', 'Дом 2', 'Дом 3', 'Дом 4', 'Дом 5', 'Дом 6']
