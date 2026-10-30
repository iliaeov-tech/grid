// Проверка перед публикацией: в файлах сайта нет внешних адресов, кроме разрешённых,
// и у страниц на месте политика безопасности (CSP). Запуск из корня: node .github/check-site.js
// Что-то не так — список проблем и код выхода 1: публикация не идёт.
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");

/* Разрешённые внешние адреса — и почему. Остальные запрещены. */
const ALLOWED = [
  ["t.me", "«Сотрудничество и отзывы» — ссылка, которую человек открывает сам"],
  ["calendar.google.com", "«Google Календарь» в задаче — ссылка, которую человек открывает сам"],
  ["cdn.jsdelivr.net", "совместная работа (collab): библиотека supabase-js"],
  ["*.supabase.co", "совместная работа (collab): сервер"],
];
/* файлы сайта — то, что грузит браузер; серверный код, документация и служебное не в счёт */
const SKIP_DIRS = new Set([".git", ".github", ".claude", "supabase", "node_modules"]);
const SITE_FILE = /\.(html|js|css|webmanifest|svg)$/;

const problems = [];
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : files(p);
    return SITE_FILE.test(e.name) ? [p] : [];
  });
}
function allowed(host) {
  host = host.toLowerCase();
  return ALLOWED.some(([a]) => a.startsWith("*.") ? host.endsWith(a.slice(1)) : host === a);
}

/* 1. Внешние адреса: https://, http://, wss://, ws:// и «//адрес» в src, href, url() */
const URL_RE = /(?:\b(?:https?|wss?):\/\/|(?:^|[\s"'(=])\/\/)([a-z0-9*-]+(?:\.[a-z0-9*-]+)+)/gi;
const list = files(ROOT);
for (const f of list) {
  const rel = path.relative(ROOT, f).replace(/\\/g, "/");
  fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    for (const m of line.matchAll(URL_RE)) {
      if (!allowed(m[1])) problems.push(`${rel}:${i + 1}: внешний адрес ${m[1]} не из разрешённого списка`);
    }
  });
}

/* 2. Политика безопасности у страниц: первой в <head>, скрипты и запросы — только с сайта, без встроенных скриптов */
function csp(file, rules) {
  const html = fs.readFileSync(path.join(ROOT, file), "utf8");
  const meta = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);
  if (!meta) { problems.push(`${file}: нет политики безопасности (meta Content-Security-Policy)`); return; }
  const first = html.search(/<(script|link|style)\b/i);
  if (first >= 0 && first < meta.index) problems.push(`${file}: политика безопасности стоит не первой — до неё браузер её не применяет`);
  const dir = {};
  meta[1].split(";").map(s => s.trim()).filter(Boolean).forEach(s => { const [k, ...v] = s.split(/\s+/); dir[k] = v.join(" "); });
  for (const [k, v] of Object.entries(rules)) {
    if (dir[k] !== v) problems.push(`${file}: в политике должно быть «${k} ${v}», сейчас «${k} ${dir[k] || "—"}»`);
  }
  if (/<script\b(?![^>]*\bsrc=)[^>]*>/i.test(html)) problems.push(`${file}: встроенный <script> — политика его заблокирует, код должен быть в файле`);
}
csp("grid.html", { "default-src": "'self'", "script-src": "'self'", "connect-src": "'self'", "object-src": "'none'", "base-uri": "'none'" });
csp("index.html", { "default-src": "'self'", "object-src": "'none'", "base-uri": "'none'" });

if (problems.length) {
  console.error("Проверка не пройдена — публикация остановлена:\n" + problems.map(p => "  • " + p).join("\n"));
  console.error("\nРазрешены только: " + ALLOWED.map(([a, why]) => `${a} (${why})`).join("; "));
  process.exit(1);
}
console.log(`Проверка пройдена: файлов сайта — ${list.length}, внешние адреса только из разрешённого списка, политика безопасности на месте.`);
