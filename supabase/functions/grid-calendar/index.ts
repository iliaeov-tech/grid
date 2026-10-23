// Grid — календарь задач для подписки из Google Календаря, Outlook и других.
//
// Приложение календаря периодически забирает ссылку
//   https://<проект>.supabase.co/functions/v1/grid-calendar?token=<токен>
// Токен — строка таблицы feeds: чья ссылка (user_id) и какие задачи (scope).
// В календарь попадают задачи только из проектов, где этот человек участник,
// и ничего из корзины. Функция развёрнута без проверки JWT: приложения
// календаря не умеют входить, доступ к задачам даёт только сам токен.

const BOARD = Deno.env.get("GRID_URL") ?? "https://iliaeov-tech.github.io/grid/grid.html";

type Row = Record<string, any>;

// ключ, который обходит RLS: прежний service_role или новый секретный ключ
function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  return Object.values(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"))[0] as string;
}

async function rest(path: string): Promise<Row[]> {
  const key = serviceKey();
  const headers: Record<string, string> = { apikey: key };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/${path}`, { headers });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return await res.json();
}

// текст в iCalendar: экранирование и перенос строк длиннее 75 байт (RFC 5545, 3.1 и 3.3.11)
const text = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function fold(line: string): string {
  const enc = new TextEncoder();
  let out = "", size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > 75) { out += "\r\n "; size = 1; }
    out += ch; size += n;
  }
  return out;
}
// дата задачи — событие на весь день; конец в iCalendar не включается
function day(iso: string, plus = 0): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + plus);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");

function calendar(name: string, cards: Row[], projects: Row[], columns: Row[], now = new Date()): string {
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const columnName = new Map(columns.map((c) => [c.id, c.title]));
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Grid//Tasks//RU", "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH", `X-WR-CALNAME:${text(name)}`, "X-PUBLISHED-TTL:PT1H",
  ];
  for (const c of cards) {
    let start = c.start_on || c.due, end = c.due || c.start_on;
    if (start > end) [start, end] = [end, start];
    const link = `${BOARD}#task=${encodeURIComponent(c.id)}`;
    const where = `${projectName.get(c.project_id) ?? ""} » ${columnName.get(c.column_id) ?? ""}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${c.id}@grid`,
      `DTSTAMP:${stamp(now)}`,
      `LAST-MODIFIED:${stamp(new Date(c.updated_at ?? now))}`,
      `DTSTART;VALUE=DATE:${day(start)}`,
      `DTEND;VALUE=DATE:${day(end, 1)}`,
      `SUMMARY:${text((c.done ? "✓ " : "") + c.title)}`,
      `DESCRIPTION:${text(where + (c.descr ? "\n\n" + c.descr : "") + "\n\n" + link)}`,
      `URL:${link}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const missing = () => new Response("Ссылка календаря не найдена или отключена.", { status: 404 });
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) return missing();
  try {
    const [feed] = await rest(`feeds?select=user_id,scope&id=eq.${token}`);
    if (!feed) return missing();
    const mine = feed.scope === "mine", who = encodeURIComponent(feed.user_id);
    const [memberships, people] = await Promise.all([
      rest(`project_members?select=project_id&user_id=eq.${who}`),
      rest(`profiles?select=name&id=eq.${who}`),
    ]);
    const ids = memberships.map((m) => `"${String(m.project_id).replace(/"/g, "")}"`).join(",");
    const among = encodeURIComponent(`(${ids})`);
    const [cards, projects, columns] = ids ? await Promise.all([
      rest("cards?select=id,title,descr,done,start_on,due,project_id,column_id,updated_at" +
        `&project_id=in.${among}&archived=is.false&deleted_at=is.null&or=(due.not.is.null,start_on.not.is.null)` +
        (mine ? `&assignee=eq.${who}` : "")),
      rest(`projects?select=id,name&id=in.${among}&deleted_at=is.null`),
      rest(`columns?select=id,title&project_id=in.${among}&deleted_at=is.null`),
    ]) : [[], [], []];
    // задачи из колонок и проектов в корзине тоже не показываем
    const alive = new Set(columns.map((c) => c.id)), live = new Set(projects.map((p) => p.id));
    const shown = cards.filter((c) => alive.has(c.column_id) && live.has(c.project_id));
    const name = mine ? `Grid — задачи: ${people[0]?.name ?? ""}` : "Grid — все задачи";
    return new Response(calendar(name, shown, projects, columns), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="grid.ics"',
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    console.error(e);
    return new Response("Не удалось собрать календарь.", { status: 500 });
  }
});
