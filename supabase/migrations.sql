-- =============================================
-- Миграция: Система управленческого учёта
-- База отдыха Ogonёk
-- =============================================

-- Включаем расширение для UUID
create extension if not exists "pgcrypto";

-- =============================================
-- Таблица: revenue (Выручка)
-- =============================================
create table if not exists revenue (
  id          uuid        primary key default gen_random_uuid(),
  date        date        not null,
  amount      numeric     not null check (amount > 0),
  property    text        not null,
  house       text        not null,
  source      text        not null check (source in ('бронирование', 'доп. услуга', 'прочее')),
  created_at  timestamptz not null default now()
);

create index if not exists revenue_date_idx      on revenue (date);
create index if not exists revenue_property_idx  on revenue (property);
create index if not exists revenue_house_idx     on revenue (house);

-- =============================================
-- Таблица: expenses (Расходы)
-- =============================================
create table if not exists expenses (
  id          uuid        primary key default gen_random_uuid(),
  date        date        not null,
  amount      numeric     not null check (amount > 0),
  category    text        not null check (category in (
    'продукты',
    'хозтовары',
    'ремонт',
    'закупка оборудования',
    'персонал',
    'коммуналка',
    'реклама',
    'транспорт',
    'налоги и сборы',
    'прочее'
  )),
  type        text        not null check (type in ('обязательный', 'переносимый', 'инвестиционный')),
  property    text        not null,
  house       text,
  comment     text,
  created_by  text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists expenses_date_idx      on expenses (date);
create index if not exists expenses_property_idx  on expenses (property);
create index if not exists expenses_category_idx  on expenses (category);
create index if not exists expenses_type_idx      on expenses (type);

-- =============================================
-- Таблица: plans (Планы)
-- =============================================
create table if not exists plans (
  id            uuid     primary key default gen_random_uuid(),
  month         date     not null,
  property      text     not null,
  revenue_plan  numeric  not null check (revenue_plan >= 0),
  profit_plan   numeric  not null check (profit_plan >= 0),
  unique (month, property)
);

create index if not exists plans_month_idx     on plans (month);
create index if not exists plans_property_idx  on plans (property);

-- =============================================
-- RLS (Row Level Security)
-- =============================================
alter table revenue  enable row level security;
alter table expenses enable row level security;
alter table plans    enable row level security;

-- Политики: полный доступ для аутентифицированных пользователей
create policy "revenue_all" on revenue
  for all to authenticated using (true) with check (true);

create policy "expenses_all" on expenses
  for all to authenticated using (true) with check (true);

create policy "plans_all" on plans
  for all to authenticated using (true) with check (true);

-- Политики: чтение для анонимных (если нужен публичный дашборд без логина)
-- Раскомментировать при необходимости:
-- create policy "revenue_read_anon" on revenue for select to anon using (true);
-- create policy "expenses_read_anon" on expenses for select to anon using (true);
-- create policy "plans_read_anon" on plans for select to anon using (true);
