-- ============================================================
--  Grid — схема для Supabase
--  Выполнить один раз: Supabase → SQL Editor → вставить → Run
-- ============================================================

-- ── Таблицы ────────────────────────────────────────────────
create table if not exists public.projects (
  id         text primary key,
  name       text not null default 'Новый проект',
  pos        double precision not null default 1000,
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  id         text primary key,
  name       text not null,
  color      text not null default '#7F8C8D',
  created_at timestamptz not null default now()
);

create table if not exists public.columns (
  id         text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  title      text not null default 'Новая колонка',
  pos        double precision not null default 1000,
  hue        text,
  created_at timestamptz not null default now()
);

create table if not exists public.cards (
  id         text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  column_id  text not null references public.columns(id)  on delete cascade,
  pos        double precision not null default 1000,
  title      text not null default '',
  descr      text not null default '',
  done       boolean not null default false,
  start_on   date,                       -- дата начала, нужна диаграмме Ганта
  due        date,                       -- дедлайн
  priority   text not null default 'med'  check (priority in ('low','med','high','urgent')),
  status     text not null default 'todo' check (status in ('todo','doing','blocked','review','done')),
  kind       text check (kind in ('report','learn','improve','idea','note','urgent','other')),
  kind_other text,                       -- свой тип, когда kind = 'other'
  assignee   text references public.members(id) on delete set null,
  subtasks   jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.comments (
  id         text primary key,
  card_id    text not null references public.cards(id) on delete cascade,
  author     text not null default 'Гость',
  body       text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.files (
  id         text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  card_id    text references public.cards(id) on delete cascade,  -- пусто = файл проекта
  name       text not null,
  size       bigint not null default 0,
  mime       text,
  path       text not null,              -- ключ объекта в хранилище grid-files
  created_at timestamptz not null default now()
);

-- одна заметка на проект: id совпадает с project_id
create table if not exists public.notes (
  id         text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  body       text not null default '',
  updated_at timestamptz not null default now()
);

create index if not exists columns_project_idx  on public.columns  (project_id, pos);
create index if not exists cards_column_idx     on public.cards    (column_id, pos);
create index if not exists cards_project_idx    on public.cards    (project_id);
create index if not exists comments_card_idx    on public.comments (card_id, created_at);
create index if not exists files_project_idx    on public.files    (project_id);

-- ── Права доступа ──────────────────────────────────────────
-- Страница лежит на GitHub Pages и открыта всем вместе с anon-ключом,
-- поэтому данные закрыты здесь: читать и писать может ТОЛЬКО вошедший
-- пользователь. Неавторизованный не получит ни строки.
alter table public.projects enable row level security;
alter table public.members  enable row level security;
alter table public.columns  enable row level security;
alter table public.cards    enable row level security;
alter table public.comments enable row level security;
alter table public.files    enable row level security;
alter table public.notes    enable row level security;

drop policy if exists projects_rw on public.projects;
drop policy if exists members_rw  on public.members;
drop policy if exists columns_rw  on public.columns;
drop policy if exists cards_rw    on public.cards;
drop policy if exists comments_rw on public.comments;
drop policy if exists files_rw    on public.files;
drop policy if exists notes_rw    on public.notes;

create policy projects_rw on public.projects for all to authenticated using (true) with check (true);
create policy members_rw  on public.members  for all to authenticated using (true) with check (true);
create policy columns_rw  on public.columns  for all to authenticated using (true) with check (true);
create policy cards_rw    on public.cards    for all to authenticated using (true) with check (true);
create policy comments_rw on public.comments for all to authenticated using (true) with check (true);
create policy files_rw    on public.files    for all to authenticated using (true) with check (true);
create policy notes_rw    on public.notes    for all to authenticated using (true) with check (true);

-- ── Хранилище файлов ───────────────────────────────────────
-- Приватный бакет: ссылки на скачивание выдаются на 2 минуты.
insert into storage.buckets (id, name, public)
  values ('grid-files', 'grid-files', false)
  on conflict (id) do nothing;

drop policy if exists grid_files_read   on storage.objects;
drop policy if exists grid_files_insert on storage.objects;
drop policy if exists grid_files_delete on storage.objects;

create policy grid_files_read   on storage.objects for select to authenticated
  using (bucket_id = 'grid-files');
create policy grid_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'grid-files');
create policy grid_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'grid-files');

-- ── Живые обновления (правки коллег видны без перезагрузки) ─
do $$
declare t text;
begin
  foreach t in array array['projects','members','columns','cards','comments','files','notes'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ── Стартовое состояние ────────────────────────────────────
-- Только один проект с колонками. Выдуманных людей и задач в вашу
-- рабочую базу не добавляем — участников заведёте сами в интерфейсе.
insert into public.projects (id, name, pos) values ('p-main', 'Первый проект', 1000)
  on conflict (id) do nothing;

insert into public.columns (id, project_id, title, pos, hue) values
  ('c-backlog', 'p-main', 'Бэклог',      1000, null),
  ('c-doing',   'p-main', 'В работе',    2000, 'blue'),
  ('c-review',  'p-main', 'На проверке', 3000, 'yellow'),
  ('c-done',    'p-main', 'Готово',      4000, 'green')
  on conflict (id) do nothing;
