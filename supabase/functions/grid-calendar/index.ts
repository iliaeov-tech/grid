// Grid — календарь задач для подписки из Google Календаря, Outlook и других.
//
// Приложение календаря периодически забирает ссылку
//   https://<проект>.supabase.co/functions/v1/grid-calendar?token=<токен>
// Токен — строка таблицы feeds: чьи задачи (member_id) и какие (scope).
// Функция развёрнута без проверки JWT: приложения календаря не умеют
// входить, доступ к задачам даёт только сам токен.

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
    const [feed] = await rest(`feeds?select=member_id,scope&id=eq.${token}`);
    if (!feed) return missing();
    const mine = feed.scope === "mine";
    const [cards, projects, columns, members] = await Promise.all([
      rest("cards?select=id,title,descr,done,start_on,due,project_id,column_id,updated_at" +
        "&archived=is.false&or=(due.not.is.null,start_on.not.is.null)" +
        (mine ? `&assignee=eq.${encodeURIComponent(feed.member_id)}` : "")),
      rest("projects?select=id,name"),
      rest("columns?select=id,title"),
      mine ? rest(`members?select=name&id=eq.${encodeURIComponent(feed.member_id)}`) : Promise.resolve([]),
    ]);
    const name = mine ? `Grid — задачи: ${members[0]?.name ?? ""}` : "Grid — все задачи";
    return new Response(calendar(name, cards, projects, columns), {
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
