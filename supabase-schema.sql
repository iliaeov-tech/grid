-- ============================================================
--  Grid — схема для Supabase
--  Выполнить один раз в новом проекте: Supabase → SQL Editor → вставить → Run
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

-- статусы общие для всех проектов; статус с is_done ставится выполненным задачам
create table if not exists public.statuses (
  id         text primary key,
  label      text not null,
  color      text not null default 'gray',
  pos        double precision not null default 1000,
  is_done    boolean not null default false,
  created_at timestamptz not null default now()
);

-- свои типы задач и заметок проекта; стандартные типы зашиты в интерфейс
create table if not exists public.kinds (
  id         text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  scope      text not null check (scope in ('task','note')),
  label      text not null,
  color      text not null default 'gray',
  icon       text not null default 'star',
  pos        double precision not null default 1000,
  created_at timestamptz not null default now()
);

create table if not exists public.columns (
  id          text primary key,
  project_id  text not null references public.projects(id) on delete cascade,
  title       text not null default 'Новая колонка',
  pos         double precision not null default 1000,
  hue         text not null default '',
  done_move   boolean not null default true,      -- переносить выполненные задачи
  done_target text references public.columns(id) on delete set null,  -- куда; пусто — в следующую
  created_at  timestamptz not null default now()
);

create table if not exists public.cards (
  id          text primary key,
  project_id  text not null references public.projects(id) on delete cascade,
  column_id   text not null references public.columns(id)  on delete cascade,
  parent_id   text references public.cards(id) on delete cascade,  -- у подзадачи — её задача
  pos         double precision not null default 1000,
  title       text not null default '',
  descr       text not null default '',
  done        boolean not null default false,
  start_on    date,                       -- дата начала, нужна диаграмме Ганта
  due         date,                       -- дедлайн
  priority    text not null default 'med' check (priority in ('low','med','high','urgent')),
  status      text references public.statuses(id) on delete set null,
  kind        text not null default '',   -- стандартный тип или id из kinds
  assignee    text references public.members(id) on delete set null,
  archived    boolean not null default false,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
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

create table if not exists public.notes (
  id         text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  title      text not null default 'Новая заметка',
  body       text not null default '',
  color      text not null default '',
  kind       text not null default 'memo',  -- стандартный тип или id из kinds
  pos        double precision not null default 1000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ссылки на календарь для подписки (функция grid-calendar); id — секретный токен
create table if not exists public.feeds (
  id         text primary key,
  member_id  text not null references public.members(id) on delete cascade,
  scope      text not null default 'mine' check (scope in ('mine','all')),  -- мои задачи или все
  created_at timestamptz not null default now()
);

create index if not exists columns_project_idx  on public.columns  (project_id, pos);
create index if not exists cards_column_idx     on public.cards    (column_id, pos);
create index if not exists cards_project_idx    on public.cards    (project_id);
create index if not exists cards_parent_idx     on public.cards    (parent_id);
create index if not exists comments_card_idx    on public.comments (card_id, created_at);
create index if not exists files_project_idx    on public.files    (project_id);
create index if not exists notes_project_idx    on public.notes    (project_id, pos);
create index if not exists kinds_project_idx    on public.kinds    (project_id, pos);

-- ── Права доступа ──────────────────────────────────────────
-- Страница лежит на GitHub Pages и открыта всем вместе с anon-ключом,
-- поэтому данные закрыты здесь: читать и писать может ТОЛЬКО вошедший
-- пользователь. Неавторизованный не получит ни строки.
do $$
declare t text;
begin
  foreach t in array array['projects','members','statuses','kinds','columns','cards','comments','files','notes','feeds'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_rw', t);
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', t || '_rw', t);
  end loop;
end $$;

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
  foreach t in array array['projects','members','statuses','kinds','columns','cards','comments','files','notes','feeds'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ── Стартовое состояние ────────────────────────────────────
-- Один проект с колонками и пять стандартных статусов. Выдуманных людей
-- и задач в рабочую базу не добавляем — участников заведёте в интерфейсе.
insert into public.statuses (id, label, color, pos, is_done) values
  ('todo',    'Не начата',    'gray',   1000, false),
  ('doing',   'В работе',     'blue',   2000, false),
  ('blocked', 'Нужна помощь', 'red',    3000, false),
  ('review',  'На проверке',  'yellow', 4000, false),
  ('done',    'Готова',       'green',  5000, true)
  on conflict (id) do nothing;

insert into public.projects (id, name, pos) values ('p-main', 'Первый проект', 1000)
  on conflict (id) do nothing;

insert into public.columns (id, project_id, title, pos, hue) values
  ('c-backlog', 'p-main', 'Бэклог',      1000, ''),
  ('c-doing',   'p-main', 'В работе',    2000, 'blue'),
  ('c-review',  'p-main', 'На проверке', 3000, 'yellow'),
  ('c-done',    'p-main', 'Готово',      4000, 'green')
  on conflict (id) do nothing;
