/* ============================================================
   Grid — настройки сайта.

   collab — совместная работа через сервер (Supabase): вход, команда
   с ролями, приглашения, push-уведомления, подписка на календари,
   push-напоминания Grid Life. Пока false, Grid работает только на
   этом устройстве: ничего не отправляет на сервер и не загружает
   ничего, кроме файлов самого сайта.

   url и anonKey нужны только при collab: true — из Supabase,
   Project Settings → API. Ключ anon не секретный и рассчитан на
   публикацию в браузере: доску защищают вход и правила RLS в
   supabase-schema.sql. Ключ service_role сюда вставлять НЕЛЬЗЯ.
   ============================================================ */
window.GRID_CONFIG = {
  collab:  false,
  url:     "",   // https://xxxxxxxx.supabase.co
  anonKey: "",   // eyJhbGciOiJIUzI1NiIs...
  auth:    "google",  // "google" | "github" | "email"
  // имя в Telegram для кнопки «Сотрудничество и отзывы» в «О Grid» (без @);
  // пусто — кнопки нет
  telegram: "iliaeov"
};
