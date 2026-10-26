-- ============================================================
--  Grid — схема для Supabase
--  Выполнить один раз в новом проекте: Supabase → SQL Editor → вставить → Run
--
--  Доступ — по ролям в проекте, и держат его правила базы (RLS), а не
--  интерфейс: владелец (owner) — всё; редактор (editor) — задачи, колонки,
--  заметки и файлы, без удаления колонок и проектов и без командных
--  настроек; наблюдатель (viewer) — только просмотр и комментарии.
--  Удалённые проекты, колонки и задачи 30 дней лежат в корзине (deleted_at).
--  Войти в Grid Work могут только почты, приглашённые в какой-либо проект,
--  и почты из списка доступа (grid_access), который ведёт владелец Grid.
-- ============================================================

-- Служебные функции правил доступа и триггеров живут в схеме private: API
-- Supabase её не показывает, вызвать их напрямую нельзя (Security Advisor 0028/0029).
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

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
create or replace function private.grid_new_user() returns trigger
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
  for each row execute function private.grid_new_user();

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
create or replace function private.grid_role(p text) returns text
language sql stable security definer set search_path = public as $$
  select role from public.project_members where project_id = p and user_id = auth.uid() limit 1
$$;
create or replace function private.grid_can_see(p text) returns boolean
language sql stable set search_path = public as $$ select private.grid_role(p) is not null $$;
create or replace function private.grid_can_edit(p text) returns boolean
language sql stable set search_path = public as $$ select coalesce(private.grid_role(p) in ('owner','editor'), false) $$;
create or replace function private.grid_is_owner(p text) returns boolean
language sql stable set search_path = public as $$ select coalesce(private.grid_role(p) = 'owner', false) $$;

-- ── Допуск в Grid Work ─────────────────────────────────────
-- Войти могут приглашённые в любой проект и почты из этого списка. Список
-- ведёт владелец Grid (admin) в настройках; самого владельца вписывают один
-- раз в панели Supabase (README). Строку admin через приложение не добавить
-- и не удалить.
create table if not exists public.grid_access (
  email      text primary key check (email = lower(trim(email)) and email like '_%@_%'),
  admin      boolean not null default false,
  added_by   uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create or replace function private.grid_allowed_email(mail text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.grid_access where email = lower(trim(mail)))
      or exists (select 1 from public.project_members where email = lower(trim(mail)))
$$;
-- почта входа берётся из токена Supabase Auth (Google её подтверждает)
create or replace function private.grid_allowed() returns boolean
language sql stable set search_path = public as $$
  select private.grid_allowed_email(coalesce(auth.jwt()->>'email', ''))
$$;
create or replace function private.grid_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.grid_access where admin and email = lower(coalesce(auth.jwt()->>'email', '')))
$$;
-- Supabase Auth зовёт перед созданием аккаунта (Authentication → Hooks →
-- Before User Created): чужой почте аккаунт не заводится вовсе
create or replace function public.grid_before_user_created(event jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if private.grid_allowed_email(coalesce(event->'user'->>'email', '')) then return '{}'::jsonb; end if;
  return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message',
    'Grid Work открыт только по приглашению. Попросите владельца проекта пригласить вашу почту.'));
end $$;

-- профиль видят его хозяин и те, с кем он в одном проекте
create or replace function private.grid_sees_profile(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select u = auth.uid() or exists (
    select 1 from public.project_members a join public.project_members b on a.project_id = b.project_id
    where a.user_id = auth.uid() and b.user_id = u)
$$;

-- При каждом входе: допущен ли человек; если да — завести профиль (аккаунт
-- мог появиться раньше схемы) и принять приглашения на почту этого аккаунта.
-- Недопущенному приложение показывает сообщение и выходит.
drop function if exists public.grid_claim_invites();
drop function if exists public.grid_after_login();
create or replace function public.grid_after_login() returns jsonb
language plpgsql security definer set search_path = public as $$
declare mail text := lower(coalesce(auth.jwt()->>'email', ''));
begin
  if auth.uid() is null or not private.grid_allowed_email(mail) then
    return jsonb_build_object('allowed', false, 'admin', false);
  end if;
  insert into public.profiles (id, email, name)
  values (auth.uid(), mail, coalesce(auth.jwt()->'user_metadata'->>'full_name', split_part(mail, '@', 1)))
  on conflict (id) do nothing;
  update public.project_members set user_id = auth.uid() where user_id is null and email = mail;
  return jsonb_build_object('allowed', true, 'admin', private.grid_is_admin());
end $$;

-- Приглашение человека, который уже входил в Grid, действует сразу. Почту
-- берём из аккаунта Supabase Auth, а не из профиля: профиль правит сам человек.
create or replace function private.grid_member_link() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.email := lower(trim(new.email));
  if new.user_id is null then
    select p.id into new.user_id from public.profiles p join auth.users u on u.id = p.id
    where lower(u.email) = new.email limit 1;
  end if;
  return new;
end $$;

-- почту в профиле человек не меняет: её пишет только вход (grid_after_login)
create or replace function private.grid_profile_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then new.email := old.email; end if;
  return new;
end $$;
drop trigger if exists grid_profile_guard on public.profiles;
create trigger grid_profile_guard before update on public.profiles
  for each row execute function private.grid_profile_guard();
drop trigger if exists grid_member_link on public.project_members;
create trigger grid_member_link before insert on public.project_members
  for each row execute function private.grid_member_link();

-- создатель проекта становится его владельцем
create or replace function private.grid_project_owner() returns trigger
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
  for each row execute function private.grid_project_owner();

-- у проекта всегда остаётся хотя бы один владелец
create or replace function private.grid_keep_owner() returns trigger
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
  for each row execute function private.grid_keep_owner();

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
-- путь в хранилище у каждого файла свой: по нему правила хранилища находят проект файла
drop index if exists public.files_path_idx;
create unique index if not exists files_path_key on public.files (path);

-- Поля, добавленные позже: через add column if not exists, чтобы повторный
-- запуск схемы обновлял и уже созданную базу.
alter table public.cards add column if not exists pinned boolean not null default false;   -- закреплена вверху колонки
alter table public.cards add column if not exists color  text    not null default '';      -- цвет карточки из палитры
alter table public.files add column if not exists note_id text references public.notes(id) on delete cascade;  -- файл заметки
create index if not exists files_note_idx on public.files (note_id);
create index if not exists notes_project_idx    on public.notes    (project_id, pos);
create index if not exists kinds_project_idx    on public.kinds    (project_id, pos);

-- в корзину колонку отправляет и из неё возвращает только владелец
-- (запросы без пользователя — из панели Supabase или ключом сервиса — не ограничиваем)
create or replace function private.grid_column_trash() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.deleted_at is distinct from old.deleted_at and auth.uid() is not null
     and not private.grid_is_owner(new.project_id) then
    raise exception 'Удалять и восстанавливать колонки может только владелец проекта';
  end if;
  return new;
end $$;
drop trigger if exists grid_column_trash on public.columns;
create trigger grid_column_trash before update on public.columns
  for each row execute function private.grid_column_trash();

create or replace function private.grid_card_project(c text) returns text
language sql stable security definer set search_path = public as $$
  select project_id from public.cards where id = c
$$;
-- проект файла в хранилище берём из его строки в files: файл остаётся в папке
-- проекта, где его загрузили, а задача с ним может переехать в другой проект
create or replace function private.grid_object_project(obj text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select project_id from public.files where path = obj), (storage.foldername(obj))[1])
$$;
-- Строка файла добавляется только с путём в папке своего проекта, и путь
-- потом не меняется: иначе строкой в своём проекте можно было бы сослаться
-- на чужой файл и скачать его. Панель Supabase и ключ сервиса не ограничиваем.
create or replace function private.grid_file_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' and (storage.foldername(new.path))[1] is distinct from new.project_id then
    raise exception 'Файл можно добавить только в папку своего проекта';
  end if;
  if tg_op = 'UPDATE' and new.path is distinct from old.path then
    raise exception 'Путь файла в хранилище менять нельзя';
  end if;
  return new;
end $$;
drop trigger if exists grid_file_guard on public.files;
create trigger grid_file_guard before insert or update on public.files
  for each row execute function private.grid_file_guard();
-- автор задачи не меняется: ему приходят уведомления о задаче без ответственного
create or replace function private.grid_card_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then new.created_by := old.created_by; end if;
  return new;
end $$;
drop trigger if exists grid_card_guard on public.cards;
create trigger grid_card_guard before update on public.cards
  for each row execute function private.grid_card_guard();

-- сколько места занимают все файлы Grid — для шкалы из 1 ГБ в настройках
create or replace function public.grid_storage_used() returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(size), 0)::bigint from public.files
$$;

-- ── Push-уведомления Grid Work ─────────────────────────────
-- Устройства (подписки браузера) и очередь уведомлений. Очередь пополняют
-- триггеры (назначили ответственным, комментарий к задаче) и раз в минуту
-- функция grid-push: дедлайны — за день и в день дедлайна в 9:00 по времени
-- человека. Она же рассылает накопленное, кроме тех, у кого сейчас тихие часы.
-- Уведомления о задаче получает ответственный, а если его нет — автор.
-- Клиенты к этим таблицам доступа не имеют: только функции ниже и grid-push.
create table if not exists public.push_subscriptions (
  endpoint   text primary key,              -- адрес подписки браузера: одно устройство — одна строка
  user_id    uuid not null references public.profiles(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table if not exists public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  card_id    text references public.cards(id) on delete cascade,
  kind       text not null check (kind in ('due_tomorrow','due_today','assigned','comment')),
  title      text not null,
  body       text not null default '',
  for_date   date,                          -- дедлайн, о котором напоминание: одно на каждый
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create unique index if not exists notifications_due_once on public.notifications (user_id, card_id, kind, for_date);
create index if not exists notifications_pending_idx on public.notifications (created_at) where sent_at is null;

-- устройство получает уведомления того, кто сейчас вошёл в Grid на нём
create or replace function public.grid_push_subscribe(p_endpoint text, p_key text, p_auth text) returns void
language sql security definer set search_path = public as $$
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  select p_endpoint, auth.uid(), p_key, p_auth where auth.uid() is not null and private.grid_allowed()
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth
$$;
create or replace function public.grid_push_unsubscribe(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid()
$$;

-- время на часах человека: пояс берём из его настроек (ставит приложение)
create or replace function private.grid_local_now(tz text) returns timestamp
language plpgsql stable set search_path = public as $$
begin
  return now() at time zone coalesce(nullif(tz, ''), 'UTC');
exception when others then
  return now() at time zone 'UTC';
end $$;
-- тихие часы из личных настроек; по умолчанию с 22:00 до 8:00
create or replace function private.grid_quiet(s jsonb) returns boolean
language plpgsql stable set search_path = public as $$
declare t time; a time; b time;
begin
  if coalesce((s->>'quiet')::boolean, true) = false then return false; end if;
  t := private.grid_local_now(s->>'tz')::time;
  a := coalesce(nullif(s->>'quietFrom', ''), '22:00')::time;
  b := coalesce(nullif(s->>'quietTo', ''), '08:00')::time;
  return case when a = b then false when a < b then t >= a and t < b else t >= a or t < b end;
exception when others then
  return false;
end $$;
-- какие уведомления человек хочет получать (все включены, пока не выключит)
create or replace function private.grid_push_wanted(s jsonb, k text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce((s->>case when k like 'due%' then 'pushDue' when k = 'assigned' then 'pushAssigned' else 'pushComment' end)::boolean, true)
$$;

create or replace function private.grid_notify_assigned() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assignee is not null and new.assignee is distinct from old.assignee and new.assignee is distinct from auth.uid()
     and not new.done and not new.archived and new.deleted_at is null
     and exists (select 1 from public.push_subscriptions where user_id = new.assignee) then
    insert into public.notifications (user_id, card_id, kind, title, body)
    values (new.assignee, new.id, 'assigned', new.title,
            'Вас назначили ответственным' || coalesce(' · ' || nullif((select name from public.profiles where id = auth.uid()), ''), ''));
  end if;
  return new;
end $$;
drop trigger if exists grid_notify_assigned on public.cards;
create trigger grid_notify_assigned after update of assignee on public.cards
  for each row execute function private.grid_notify_assigned();

-- комментарий без автора — это восстановление из копии: о нём не сообщаем
create or replace function private.grid_notify_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.cards; who uuid;
begin
  select * into c from public.cards where id = new.card_id;
  who := coalesce(c.assignee, c.created_by);
  if who is not null and new.author_id is not null and who <> new.author_id and c.deleted_at is null
     and exists (select 1 from public.project_members where project_id = c.project_id and user_id = who)
     and exists (select 1 from public.push_subscriptions where user_id = who) then
    insert into public.notifications (user_id, card_id, kind, title, body)
    values (who, c.id, 'comment', c.title,
            left(coalesce(nullif((select name from public.profiles where id = new.author_id), ''), 'Коллега') || ': ' || new.body, 200));
  end if;
  return new;
end $$;
drop trigger if exists grid_notify_comment on public.comments;
create trigger grid_notify_comment after insert on public.comments
  for each row execute function private.grid_notify_comment();

-- Раз в минуту (из grid-push): добавить напоминания о дедлайнах и забрать то,
-- что пора отправить. Отправленное помечается сразу, поэтому два вызова
-- подряд одно уведомление не повторят. Выключенные человеком уведомления,
-- выполненные и удалённые задачи пропускаются; старше суток — не досылаем.
create or replace function public.grid_push_take()
returns table (endpoint text, p256dh text, auth text, title text, body text, card_id text, kind text)
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, card_id, kind, title, body, for_date)
  select r.uid, c.id, k.kind, c.title,
         case k.kind when 'due_tomorrow' then 'Дедлайн завтра' else 'Дедлайн сегодня' end || ' · ' || pr.name, c.due
  from public.cards c
  join public.projects pr on pr.id = c.project_id and pr.deleted_at is null
  join public.columns col on col.id = c.column_id and col.deleted_at is null
  cross join lateral (select coalesce(c.assignee, c.created_by) as uid) r
  join public.profiles p on p.id = r.uid
  cross join lateral (select private.grid_local_now(p.settings->>'tz') as lt) t
  cross join lateral (values ('due_tomorrow', c.due - 1), ('due_today', c.due)) k(kind, day)
  where c.due between current_date - 1 and current_date + 2
    and not c.done and not c.archived and c.deleted_at is null
    and t.lt::date = k.day and t.lt::time >= time '09:00' and t.lt::time < time '10:00'
    and exists (select 1 from public.project_members m where m.project_id = c.project_id and m.user_id = r.uid)
    and exists (select 1 from public.push_subscriptions s where s.user_id = r.uid)
  on conflict do nothing;

  delete from public.notifications n where n.created_at < now() - interval '30 days';
  update public.notifications n set sent_at = now() where n.sent_at is null and n.created_at < now() - interval '1 day';

  return query
  with due as (
    select n.id from public.notifications n join public.profiles p on p.id = n.user_id
    where n.sent_at is null and not private.grid_quiet(p.settings)
    for update of n skip locked
  ), taken as (
    update public.notifications n set sent_at = now() from due where n.id = due.id returning n.*
  )
  select s.endpoint, s.p256dh, s.auth, x.title, x.body, x.card_id, x.kind
  from taken x
  join public.profiles p on p.id = x.user_id
  join public.cards c on c.id = x.card_id
  join public.push_subscriptions s on s.user_id = x.user_id
  where private.grid_push_wanted(p.settings, x.kind) and c.deleted_at is null
    and (x.kind not like 'due%' or not c.done and not c.archived);
end $$;

-- ── Напоминания Grid Life ──────────────────────────────────
-- Задачи Grid Life живут только на устройстве. Чтобы напомнить, когда
-- приложение закрыто, устройство присылает сюда время напоминаний и
-- случайные номера — без названий и текста задач; название телефон
-- подставляет сам. Аккаунт не нужен: устройство узнаётся по случайному
-- ключу, а здесь хранится только его отпечаток (SHA-256). Пишет и читает
-- эти таблицы только функция grid-push.
create table if not exists public.life_devices (
  id         uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  seen_at    timestamptz not null default now()
);
create table if not exists public.life_reminders (
  device_id uuid not null references public.life_devices(id) on delete cascade,
  rid       text not null,                  -- случайный номер: что за задача, знает только устройство
  fire_at   timestamptz not null,
  primary key (device_id, rid)
);
create index if not exists life_reminders_fire_idx on public.life_reminders (fire_at);
alter table public.life_devices add column if not exists created_at timestamptz not null default now();

-- Устройство заменяет весь свой список напоминаний (не больше 300, на год
-- вперёд). Новых устройств — не больше 300 в час и 5000 всего: Grid Life
-- работает без аккаунта, и так его нельзя завалить подделанными устройствами.
create or replace function public.grid_life_save(p_hash text, p_endpoint text, p_key text, p_auth text, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare dev uuid;
begin
  if not exists (select 1 from public.life_devices where token_hash = p_hash)
     and ((select count(*) from public.life_devices where created_at > now() - interval '1 hour') >= 300
          or (select count(*) from public.life_devices) >= 5000) then
    raise exception 'grid: too many new devices';
  end if;
  insert into public.life_devices (token_hash, endpoint, p256dh, auth) values (p_hash, p_endpoint, p_key, p_auth)
  on conflict (token_hash) do update set endpoint = excluded.endpoint, p256dh = excluded.p256dh,
    auth = excluded.auth, seen_at = now()
  returning id into dev;
  delete from public.life_reminders where device_id = dev;
  insert into public.life_reminders (device_id, rid, fire_at)
  select dev, x->>'rid', (x->>'at')::timestamptz
  from (select x from jsonb_array_elements(coalesce(p_items, '[]')) x limit 300) i
  where (x->>'at')::timestamptz between now() - interval '1 hour' and now() + interval '400 days'
  on conflict do nothing;
end $$;
-- наступившие напоминания; опоздавшие больше чем на час не шлём.
-- Устройство, которое не заходило 90 дней, забываем.
create or replace function public.grid_life_take()
returns table (rid text, endpoint text, p256dh text, auth text)
language plpgsql security definer set search_path = public as $$
begin
  delete from public.life_devices d where d.seen_at < now() - interval '90 days';
  delete from public.grid_rate g where g.window_start < now() - interval '1 day';
  return query
  with due as (delete from public.life_reminders r where r.fire_at <= now() returning r.*)
  select x.rid, d.endpoint, d.p256dh, d.auth
  from due x join public.life_devices d on d.id = x.device_id
  where x.fire_at > now() - interval '1 hour';
end $$;

-- ── Лимиты и секрет расписания (для grid-push) ─────────────
-- Счётчик запросов в окне: grid-push спрашивает, не слишком ли часто
-- (с одного адреса, от одного устройства или человека). true — можно.
create table if not exists public.grid_rate (
  bucket       text primary key,
  hits         int not null default 0,
  window_start timestamptz not null default now()
);
create or replace function public.grid_rate_hit(p_bucket text, p_limit int, p_seconds int) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.grid_rate as r (bucket, hits, window_start) values (p_bucket, 1, now())
  on conflict (bucket) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_seconds) then now() else r.window_start end
  returning hits into n;
  return n <= p_limit;
end $$;
-- Рассылку раз в минуту запускает только задание pg_cron: оно присылает
-- секрет, который знает только Vault (создаётся при настройке, README).
create or replace function public.grid_cron_ok(p_secret text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare s text;
begin
  select decrypted_secret into s from vault.decrypted_secrets where name = 'grid_cron_secret';
  return coalesce(s is not null and length(s) >= 32 and p_secret = s, false);
exception when others then
  return false;
end $$;

-- ── Правила доступа ────────────────────────────────────────
-- Страница лежит на GitHub Pages и открыта всем вместе с anon-ключом,
-- поэтому данные закрыты здесь: без входа не видно ни строки, а после
-- входа — только проекты, где человек участник, и только по его роли.
do $$
declare t text; p record;
begin
  foreach t in array array['profiles','projects','project_members','statuses','kinds',
                           'columns','cards','comments','files','notes','feeds','grid_access',
                           'push_subscriptions','notifications','life_devices','life_reminders','grid_rate'] loop
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;

-- писать что-либо своё (профиль, проекты, ссылки календаря) может только допущенный в Grid Work
create policy profiles_read   on public.profiles for select to authenticated using (private.grid_sees_profile(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and private.grid_allowed());

create policy projects_read   on public.projects for select to authenticated using (private.grid_can_see(id));
create policy projects_insert on public.projects for insert to authenticated
  with check (created_by = auth.uid() and private.grid_allowed());
create policy projects_update on public.projects for update to authenticated
  using (private.grid_is_owner(id)) with check (private.grid_is_owner(id));
create policy projects_delete on public.projects for delete to authenticated using (private.grid_is_owner(id));

create policy members_read   on public.project_members for select to authenticated using (private.grid_can_see(project_id));
create policy members_insert on public.project_members for insert to authenticated with check (private.grid_is_owner(project_id));
create policy members_update on public.project_members for update to authenticated
  using (private.grid_is_owner(project_id)) with check (private.grid_is_owner(project_id));
create policy members_delete on public.project_members for delete to authenticated using (private.grid_is_owner(project_id));

-- статусы и типы — командные настройки: меняет владелец
do $$
declare t text;
begin
  foreach t in array array['statuses','kinds'] loop
    execute format('create policy %I on public.%I for select to authenticated using (private.grid_can_see(project_id))', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.grid_is_owner(project_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (private.grid_is_owner(project_id)) with check (private.grid_is_owner(project_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (private.grid_is_owner(project_id))', t || '_delete', t);
  end loop;
end $$;

-- колонки, задачи, заметки, файлы — правят владелец и редакторы;
-- окончательно удаляет (очистка корзины) колонки и задачи только владелец
do $$
declare t text;
begin
  foreach t in array array['columns','cards','notes','files'] loop
    execute format('create policy %I on public.%I for select to authenticated using (private.grid_can_see(project_id))', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.grid_can_edit(project_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (private.grid_can_edit(project_id)) with check (private.grid_can_edit(project_id))', t || '_update', t);
  end loop;
end $$;
create policy columns_delete on public.columns for delete to authenticated using (private.grid_is_owner(project_id));
create policy cards_delete   on public.cards   for delete to authenticated using (private.grid_is_owner(project_id));
create policy notes_delete   on public.notes   for delete to authenticated using (private.grid_can_edit(project_id));
create policy files_delete   on public.files   for delete to authenticated using (private.grid_can_edit(project_id));

-- комментировать может любой участник, в том числе наблюдатель; без автора
-- (только имя — так восстанавливаются комментарии из резервной копии) пишет владелец
create policy comments_read   on public.comments for select to authenticated
  using (private.grid_can_see(private.grid_card_project(card_id)));
create policy comments_insert on public.comments for insert to authenticated
  with check (private.grid_can_see(private.grid_card_project(card_id)) and (author_id = auth.uid()
    or author_id is null and private.grid_is_owner(private.grid_card_project(card_id))));
-- свой комментарий можно поправить, но не перенести в задачу, которую не видишь
create policy comments_update on public.comments for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid() and private.grid_can_see(private.grid_card_project(card_id)));
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = auth.uid() or private.grid_is_owner(private.grid_card_project(card_id)));

create policy feeds_own on public.feeds for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and private.grid_allowed());

-- список доступа видит и ведёт только владелец Grid; строки admin — только в панели Supabase
create policy access_read   on public.grid_access for select to authenticated using (private.grid_is_admin());
create policy access_insert on public.grid_access for insert to authenticated with check (private.grid_is_admin() and not admin);
create policy access_delete on public.grid_access for delete to authenticated using (private.grid_is_admin() and not admin);

-- служебные таблицы рассылки и лимитов: из приложения — никак, только функции и grid-push
do $$
declare t text;
begin
  foreach t in array array['push_subscriptions','notifications','life_devices','life_reminders','grid_rate'] loop
    execute format('create policy %I on public.%I for all to anon, authenticated using (false) with check (false)', t || '_none', t);
  end loop;
end $$;

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
  bucket_id = 'grid-files' and private.grid_can_see(private.grid_object_project(name)));
create policy grid_files_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'grid-files' and private.grid_can_edit((storage.foldername(name))[1]));
create policy grid_files_delete on storage.objects for delete to authenticated using (
  bucket_id = 'grid-files' and private.grid_can_edit(private.grid_object_project(name)));

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

-- ── Права ролей API ────────────────────────────────────────
-- Без входа (anon) Grid Work базу не трогает: ни таблиц, ни функций.
-- Вошедшим — таблицы доски (их держат правила выше) и четыре функции,
-- которые зовёт приложение. Остальное — только grid-push (service_role) и
-- проверка при регистрации (supabase_auth_admin).
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on table public.push_subscriptions, public.notifications, public.life_devices,
  public.life_reminders, public.grid_rate from authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.grid_after_login(), public.grid_storage_used(),
  public.grid_push_subscribe(text, text, text), public.grid_push_unsubscribe(text) to authenticated;
grant execute on function public.grid_push_take(), public.grid_life_take(),
  public.grid_life_save(text, text, text, text, jsonb), public.grid_rate_hit(text, int, int),
  public.grid_cron_ok(text) to service_role;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.grid_before_user_created(jsonb) to supabase_auth_admin;
    grant usage on schema private to supabase_auth_admin;
  end if;
end $$;

-- прежние версии служебных функций в public (до переноса в private)
drop function if exists public.grid_new_user(), public.grid_role(text), public.grid_can_see(text),
  public.grid_can_edit(text), public.grid_is_owner(text), public.grid_sees_profile(uuid),
  public.grid_member_link(), public.grid_project_owner(), public.grid_keep_owner(),
  public.grid_column_trash(), public.grid_card_project(text), public.grid_object_project(text),
  public.grid_local_now(text), public.grid_quiet(jsonb), public.grid_push_wanted(jsonb, text),
  public.grid_notify_assigned(), public.grid_notify_comment();

-- Стартовых проектов в базе нет: владелец Grid вписывает себя в список
-- доступа (README), входит первым, создаёт проект и приглашает команду по почте.
