-- ============================================================
--  Grid — схема доски для Supabase
--  Выполнить один раз: Supabase → SQL Editor → вставить → Run
-- ============================================================

-- ── Таблицы ────────────────────────────────────────────────
create table if not exists public.board (
  id   text primary key,
  name text not null default 'Доска команды'
);

create table if not exists public.members (
  id         text primary key,
  name       text not null,
  color      text not null default '#7F8C8D',
  created_at timestamptz not null default now()
);

create table if not exists public.columns (
  id         text primary key,
  title      text not null default 'Новая колонка',
  pos        double precision not null default 1000,
  created_at timestamptz not null default now()
);

create table if not exists public.cards (
  id         text primary key,
  column_id  text not null references public.columns(id) on delete cascade,
  pos        double precision not null default 1000,
  title      text not null default '',
  descr      text not null default '',
  done       boolean not null default false,
  due        date,
  priority   text not null default 'med'  check (priority in ('low','med','high','urgent')),
  status     text not null default 'todo' check (status in ('todo','doing','blocked','review','done')),
  assignee   text references public.members(id) on delete set null,
  subtasks   jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists cards_column_idx on public.cards (column_id);
create index if not exists cards_pos_idx    on public.cards (column_id, pos);

-- ── Права доступа ──────────────────────────────────────────
-- Страница доски лежит на GitHub Pages и открыта всем, вместе с anon-ключом.
-- Поэтому данные закрыты здесь: читать и писать может ТОЛЬКО вошедший
-- пользователь. Неавторизованный не получит ни строки.
alter table public.board   enable row level security;
alter table public.members enable row level security;
alter table public.columns enable row level security;
alter table public.cards   enable row level security;

drop policy if exists board_rw   on public.board;
drop policy if exists members_rw on public.members;
drop policy if exists columns_rw on public.columns;
drop policy if exists cards_rw   on public.cards;

create policy board_rw   on public.board   for all to authenticated using (true) with check (true);
create policy members_rw on public.members for all to authenticated using (true) with check (true);
create policy columns_rw on public.columns for all to authenticated using (true) with check (true);
create policy cards_rw   on public.cards   for all to authenticated using (true) with check (true);

-- ── Живые обновления (правки коллег видны без перезагрузки) ─
do $$
begin
  begin alter publication supabase_realtime add table public.board;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.members; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.columns; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.cards;   exception when duplicate_object then null; end;
end $$;

-- ── Стартовое состояние ────────────────────────────────────
-- Только колонки и название. Выдуманных людей и задач в вашу
-- рабочую базу не добавляем — участников заведёте сами в интерфейсе.
insert into public.board (id, name) values ('meta', 'Доска команды')
  on conflict (id) do nothing;

insert into public.columns (id, title, pos) values
  ('c-backlog', 'Бэклог',      1000),
  ('c-doing',   'В работе',    2000),
  ('c-review',  'На проверке', 3000),
  ('c-done',    'Готово',      4000)
  on conflict (id) do nothing;
