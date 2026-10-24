-- ============================================================
--  Grid — схема для Supabase
--  Выполнить один раз в новом проекте: Supabase → SQL Editor → вставить → Run
--
--  Доступ — по ролям в проекте, и держат его правила базы (RLS), а не
--  интерфейс: владелец (owner) — всё; редактор (editor) — задачи, колонки,
--  заметки и файлы, без удаления колонок и проектов и без командных
--  настроек; наблюдатель (viewer) — только просмотр и комментарии.
--  Удалённые проекты, колонки и задачи 30 дней лежат в корзине (deleted_at).
-- ============================================================

-- ── Профили: один на аккаунт ───────────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null default '',
  name       text not null default '',
  color      text not null default '#2F8FD4',
  -- фото 160×160 как data:URL (JPEG, ~10 КБ); пусто — инициалы
  avatar     text not null default '' check (length(avatar) <= 100000),
  settings   jsonb not null default '{}',   -- личные настройки отображения
  created_at timestamptz not null default now()
);

-- профиль заводится при первом входе
create or replace function public.grid_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, coalesce(new.email, ''),
          coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, ''), '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists grid_new_user on auth.users;
create trigger grid_new_user after insert on auth.users
  for each row execute function public.grid_new_user();

-- ── Проекты и участники ────────────────────────────────────
create table if not exists public.projects (
  id                text primary key,
  name              text not null default 'Новый проект',
  descr             text not null default '',
  pos               double precision not null default 1000,
  done_move_default boolean not null default true,   -- перенос выполненных у новых колонок
  created_by        uuid default auth.uid(),
  deleted_at        timestamptz,                      -- в корзине
  created_at        timestamptz not null default now()
);

-- приглашение — строка с почтой; user_id заполняется, когда человек входит
create table if not exists public.project_members (
  id         text primary key default gen_random_uuid()::text,
  project_id text not null references public.projects(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete cascade,
  email      text not null,
  role       text not null check (role in ('owner','editor','viewer')),
  created_at timestamptz not null default now(),
  unique (project_id, email)
);

-- роль текущего пользователя в проекте; security definer — чтобы правила
-- других таблиц могли спросить о членстве, не упираясь в правила этой
create or replace function public.grid_role(p text) returns text
language sql stable security definer set search_path = public as $$
  select role from public.project_members where project_id = p and user_id = auth.uid() limit 1
$$;
create or replace function public.grid_can_see(p text) returns boolean
language sql stable as $$ select public.grid_role(p) is not null $$;
create or replace function public.grid_can_edit(p text) returns boolean
language sql stable as $$ select coalesce(public.grid_role(p) in ('owner','editor'), false) $$;
create or replace function public.grid_is_owner(p text) returns boolean
language sql stable as $$ select coalesce(public.grid_role(p) = 'owner', false) $$;

-- профиль видят его хозяин и те, с кем он в одном проекте
create or replace function public.grid_sees_profile(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select u = auth.uid() or exists (
    select 1 from public.project_members a join public.project_members b on a.project_id = b.project_id
    where a.user_id = auth.uid() and b.user_id = u)
$$;

-- при каждом входе: завести профиль, если его ещё нет (аккаунт мог появиться
-- раньше схемы), и принять приглашения, отправленные на почту этого аккаунта
drop function if exists public.grid_claim_invites();
create or replace function public.grid_after_login() returns void
language plpgsql security definer set search_path = public as $$
declare mail text := lower(coalesce(auth.jwt()->>'email', ''));
begin
  insert into public.profiles (id, email, name)
  values (auth.uid(), mail, coalesce(auth.jwt()->'user_metadata'->>'full_name', split_part(mail, '@', 1)))
  on conflict (id) do nothing;
  update public.project_members set user_id = auth.uid() where user_id is null and email = mail;
end $$;

-- приглашение человека, который уже входил в Grid, действует сразу
create or replace function public.grid_member_link() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.email := lower(trim(new.email));
  if new.user_id is null then
    select id into new.user_id from public.profiles where lower(email) = new.email limit 1;
  end if;
  return new;
end $$;
drop trigger if exists grid_member_link on public.project_members;
create trigger grid_member_link before insert on public.project_members
  for each row execute function public.grid_member_link();

-- создатель проекта становится его владельцем
create or replace function public.grid_project_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    insert into public.project_members (project_id, user_id, email, role)
    values (new.id, auth.uid(), lower(coalesce(auth.jwt()->>'email', '')), 'owner')
    on conflict (project_id, email) do update set user_id = excluded.user_id, role = 'owner';
  end if;
  return new;
end $$;
drop trigger if exists grid_project_owner on public.projects;
create trigger grid_project_owner after insert on public.projects
  for each row execute function public.grid_project_owner();

-- у проекта всегда остаётся хотя бы один владелец
create or replace function public.grid_keep_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.projects where id = old.project_id)
     and not exists (select 1 from public.project_members
                     where project_id = old.project_id and role = 'owner' and id <> old.id) then
    raise exception 'У проекта должен остаться хотя бы один владелец';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists grid_keep_owner on public.project_members;
create trigger grid_keep_owner before update or delete on public.project_members
  for each row execute function public.grid_keep_owner();

-- ── Статусы и типы проекта ─────────────────────────────────
-- статус с is_done ставится выполненным задачам
create table if not exists public.statuses (
  id         text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  label      text not null,
  color      text not null default 'gray',
  pos        double precision not null default 1000,
  is_done    boolean not null default false,
  created_at timestamptz not null default now()
);

-- свои типы задач и заметок; стандартные типы зашиты в интерфейс
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

-- ── Доска ──────────────────────────────────────────────────
create table if not exists public.columns (
  id          text primary key,
  project_id  text not null references public.projects(id) on delete cascade,
  title       text not null default 'Новая колонка',
  pos         double precision not null default 1000,
  hue         text not null default '',
  done_move   boolean not null default true,      -- переносить выполненные задачи
  done_target text references public.columns(id) on delete set null,  -- куда; пусто — в следующую
  deleted_at  timestamptz,                         -- в корзине
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
  assignee    uuid references public.profiles(id) on delete set null,
  archived    boolean not null default false,
  archived_at timestamptz,
  deleted_at  timestamptz,                -- в корзине
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- проект комментария — проект его задачи: при переносе задачи комментарии едут с ней
create table if not exists public.comments (
  id         text primary key,
  card_id    text not null references public.cards(id) on delete cascade,
  author_id  uuid default auth.uid() references public.profiles(id) on delete set null,
  author     text not null default '',
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
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  scope      text not null default 'mine' check (scope in ('mine','all')),  -- мои задачи или все
  created_at timestamptz not null default now()
);

create index if not exists members_project_idx  on public.project_members (project_id);
create index if not exists members_user_idx     on public.project_members (user_id);
create index if not exists statuses_project_idx on public.statuses (project_id, pos);
create index if not exists columns_project_idx  on public.columns  (project_id, pos);
create index if not exists cards_column_idx     on public.cards    (column_id, pos);
create index if not exists cards_project_idx    on public.cards    (project_id);
create index if not exists cards_parent_idx     on public.cards    (parent_id);
create index if not exists comments_card_idx    on public.comments (card_id, created_at);
create index if not exists files_project_idx    on public.files    (project_id);
create index if not exists files_path_idx       on public.files    (path);
create index if not exists notes_project_idx    on public.notes    (project_id, pos);
create index if not exists kinds_project_idx    on public.kinds    (project_id, pos);

-- в корзину колонку отправляет и из неё возвращает только владелец
-- (запросы без пользователя — из панели Supabase или ключом сервиса — не ограничиваем)
create or replace function public.grid_column_trash() returns trigger
language plpgsql as $$
begin
  if new.deleted_at is distinct from old.deleted_at and auth.uid() is not null
     and not public.grid_is_owner(new.project_id) then
    raise exception 'Удалять и восстанавливать колонки может только владелец проекта';
  end if;
  return new;
end $$;
drop trigger if exists grid_column_trash on public.columns;
create trigger grid_column_trash before update on public.columns
  for each row execute function public.grid_column_trash();

create or replace function public.grid_card_project(c text) returns text
language sql stable security definer set search_path = public as $$
  select project_id from public.cards where id = c
$$;
-- проект файла в хранилище берём из его строки в files: файл остаётся в папке
-- проекта, где его загрузили, а задача с ним может переехать в другой проект
create or replace function public.grid_object_project(obj text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select project_id from public.files where path = obj limit 1), (storage.foldername(obj))[1])
$$;

-- сколько места занимают все файлы Grid — для шкалы из 1 ГБ в настройках
create or replace function public.grid_storage_used() returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(size), 0)::bigint from public.files
$$;

-- ── Правила доступа ────────────────────────────────────────
-- Страница лежит на GitHub Pages и открыта всем вместе с anon-ключом,
-- поэтому данные закрыты здесь: без входа не видно ни строки, а после
-- входа — только проекты, где человек участник, и только по его роли.
do $$
declare t text; p record;
begin
  foreach t in array array['profiles','projects','project_members','statuses','kinds',
                           'columns','cards','comments','files','notes','feeds'] loop
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;

create policy profiles_read   on public.profiles for select to authenticated using (public.grid_sees_profile(id));
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy projects_read   on public.projects for select to authenticated using (public.grid_can_see(id));
create policy projects_insert on public.projects for insert to authenticated with check (created_by = auth.uid());
create policy projects_update on public.projects for update to authenticated
  using (public.grid_is_owner(id)) with check (public.grid_is_owner(id));
create policy projects_delete on public.projects for delete to authenticated using (public.grid_is_owner(id));

create policy members_read   on public.project_members for select to authenticated using (public.grid_can_see(project_id));
create policy members_insert on public.project_members for insert to authenticated with check (public.grid_is_owner(project_id));
create policy members_update on public.project_members for update to authenticated
  using (public.grid_is_owner(project_id)) with check (public.grid_is_owner(project_id));
create policy members_delete on public.project_members for delete to authenticated using (public.grid_is_owner(project_id));

-- статусы и типы — командные настройки: меняет владелец
do $$
declare t text;
begin
  foreach t in array array['statuses','kinds'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.grid_can_see(project_id))', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.grid_is_owner(project_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.grid_is_owner(project_id)) with check (public.grid_is_owner(project_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.grid_is_owner(project_id))', t || '_delete', t);
  end loop;
end $$;

-- колонки, задачи, заметки, файлы — правят владелец и редакторы;
-- окончательно удаляет (очистка корзины) колонки и задачи только владелец
do $$
declare t text;
begin
  foreach t in array array['columns','cards','notes','files'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.grid_can_see(project_id))', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.grid_can_edit(project_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.grid_can_edit(project_id)) with check (public.grid_can_edit(project_id))', t || '_update', t);
  end loop;
end $$;
create policy columns_delete on public.columns for delete to authenticated using (public.grid_is_owner(project_id));
create policy cards_delete   on public.cards   for delete to authenticated using (public.grid_is_owner(project_id));
create policy notes_delete   on public.notes   for delete to authenticated using (public.grid_can_edit(project_id));
create policy files_delete   on public.files   for delete to authenticated using (public.grid_can_edit(project_id));

-- комментировать может любой участник, в том числе наблюдатель; без автора
-- (только имя — так восстанавливаются комментарии из резервной копии) пишет владелец
create policy comments_read   on public.comments for select to authenticated
  using (public.grid_can_see(public.grid_card_project(card_id)));
create policy comments_insert on public.comments for insert to authenticated
  with check (public.grid_can_see(public.grid_card_project(card_id)) and (author_id = auth.uid()
    or author_id is null and public.grid_is_owner(public.grid_card_project(card_id))));
create policy comments_update on public.comments for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = auth.uid() or public.grid_is_owner(public.grid_card_project(card_id)));

create policy feeds_own on public.feeds for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Хранилище файлов ───────────────────────────────────────
-- Приватный бакет: ссылки на скачивание выдаются на 2 минуты.
-- Один файл — не больше 10 МБ (тот же предел проверяет интерфейс).
-- Файл загружают в папку проекта.
insert into storage.buckets (id, name, public, file_size_limit)
  values ('grid-files', 'grid-files', false, 10485760)
  on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists grid_files_read   on storage.objects;
drop policy if exists grid_files_insert on storage.objects;
drop policy if exists grid_files_delete on storage.objects;

create policy grid_files_read on storage.objects for select to authenticated using (
  bucket_id = 'grid-files' and public.grid_can_see(public.grid_object_project(name)));
create policy grid_files_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'grid-files' and public.grid_can_edit((storage.foldername(name))[1]));
create policy grid_files_delete on storage.objects for delete to authenticated using (
  bucket_id = 'grid-files' and public.grid_can_edit(public.grid_object_project(name)));

-- ── Живые обновления (правки коллег видны без перезагрузки) ─
do $$
declare t text;
begin
  foreach t in array array['profiles','projects','project_members','statuses','kinds',
                           'columns','cards','comments','files','notes','feeds'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- Стартовых проектов в базе нет: первый проект создаёт первый вошедший —
-- он и становится владельцем, а дальше приглашает команду по почте.
