// Grid — push-уведомления Grid Work и напоминания Grid Life (Web Push).
//
// Раз в минуту функцию вызывает задание pg_cron (тело {"run": true} и
// заголовок x-grid-cron с секретом из Vault — его знает только задание): она
// забирает из базы то, что пора отправить (grid_push_take, grid_life_take),
// и рассылает.
//
// Из приложения:
//   GET                                  — открытый ключ VAPID для подписки
//   {test: true} + вход пользователя      — пробное уведомление Grid Work
//   {life: "save", token, sub, items}     — устройство Grid Life заменяет свои напоминания
//   {life: "test" | "off", token}         — пробное напоминание / забыть устройство
// Grid Life работает без аккаунта: устройство узнаётся по случайному ключу,
// в базе — только его отпечаток. Поэтому функция развёрнута без проверки JWT,
// а частоту запросов ограничивает сама (grid_rate_hit) — с одного адреса,
// от одного устройства и человека.
//
// Секреты (Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT (mailto: адрес для связи с push-сервисами).
import webpush from "npm:web-push@3.6.7";

type Row = Record<string, any>;
type Target = { endpoint: string; p256dh: string; auth: string };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ключ, который обходит RLS: прежний service_role или новый секретный ключ
function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  return Object.values(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"))[0] as string;
}
async function rest(path: string, init: RequestInit = {}): Promise<any> {
  const key = serviceKey();
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : await res.json();
}
const rpc = (name: string, args: Row = {}) => rest(`rpc/${name}`, { method: "POST", body: JSON.stringify(args) });

// только настоящие push-сервисы браузеров: чужие адреса функция не трогает
const PUSH_HOST = /^https:\/\/([a-z0-9-]+\.)*(push\.apple\.com|googleapis\.com|mozilla\.com|notify\.windows\.com)\//;
const B64U = /^[A-Za-z0-9_-]{16,200}$/;
const validTarget = (t: Target) => PUSH_HOST.test(t.endpoint) && B64U.test(t.p256dh) && B64U.test(t.auth);

let vapidSet = false;
function vapid(): boolean {
  const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return false;
  if (!vapidSet) {
    webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:grid@example.com", pub, priv);
    vapidSet = true;
  }
  return true;
}

// Отправить всем; подписку, которой больше нет (404/410), забываем и в
// Grid Work, и в Grid Life — у одного браузера она общая.
async function send(list: { to: Target; msg: Row; ttl: number; urgency: "normal" | "high" }[]): Promise<number> {
  let sent = 0;
  await Promise.all(list.map(async ({ to, msg, ttl, urgency }) => {
    if (!validTarget(to)) return;
    try {
      await webpush.sendNotification({ endpoint: to.endpoint, keys: { p256dh: to.p256dh, auth: to.auth } },
        JSON.stringify(msg), { TTL: ttl, urgency });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        const at = encodeURIComponent(to.endpoint);
        await Promise.all([rest(`push_subscriptions?endpoint=eq.${at}`, { method: "DELETE" }),
          rest(`life_devices?endpoint=eq.${at}`, { method: "DELETE" })]).catch(console.error);
      } else console.error("push", code, (e as Error).message);
    }
  }));
  return sent;
}

async function run(): Promise<number> {
  const [work, life]: [Row[], Row[]] = await Promise.all([rpc("grid_push_take"), rpc("grid_life_take")]);
  return await send([
    ...work.map((n) => ({
      to: n as Target, ttl: 12 * 3600, urgency: "normal" as const,
      msg: { title: n.title || "Без названия", body: n.body, tag: `${n.kind}-${n.card_id}`, url: `grid.html#task=${encodeURIComponent(n.card_id)}` },
    })),
    ...life.map((r) => ({ to: r as Target, ttl: 3600, urgency: "high" as const, msg: { life: 1, rid: r.rid } })),
  ]);
}

// кто вошёл в Grid Work — по его токену из приложения
async function user(req: Request): Promise<string | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: { apikey: serviceKey(), Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return (await res.json()).id ?? null;
}

async function sha256(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

/* лимит частоты: не больше limit запросов за seconds секунд на ключ bucket */
const allowed = (bucket: string, limit: number, seconds: number): Promise<boolean> =>
  rpc("grid_rate_hit", { p_bucket: bucket, p_limit: limit, p_seconds: seconds });
const tooOften = () => json({ error: "Слишком часто — попробуйте через несколько минут" }, 429);
/* адрес отправителя; его можно подделать, поэтому есть и лимиты по устройству, и общий потолок в базе */
const ipOf = (req: Request) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "?";
const LIFE_LIMITS: Row = { save: 60, test: 5, off: 10 };

async function life(body: Row, req: Request): Promise<Response> {
  if (typeof body.token !== "string" || !/^[A-Za-z0-9_-]{32,64}$/.test(body.token)) return json({ error: "token" }, 400);
  if (!LIFE_LIMITS[body.life]) return json({ error: "action" }, 400);
  const hash = await sha256(body.token);
  if (!(await allowed(`life-ip:${ipOf(req)}`, 200, 600)) || !(await allowed(`life-${body.life}:${hash}`, LIFE_LIMITS[body.life], 600))) return tooOften();
  if (body.life === "off") {
    await rest(`life_devices?token_hash=eq.${hash}`, { method: "DELETE" });
    return json({ ok: true });
  }
  if (body.life === "test") {
    const [d] = await rest(`life_devices?select=endpoint,p256dh,auth&token_hash=eq.${hash}`);
    if (!d) return json({ error: "device" }, 404);
    return json({ sent: await send([{ to: d, ttl: 600, urgency: "high", msg: { life: 1, rid: "test" } }]) });
  }
  const sub = body.sub ?? {}, to = { endpoint: String(sub.endpoint ?? ""), p256dh: String(sub.keys?.p256dh ?? ""), auth: String(sub.keys?.auth ?? "") };
  if (!validTarget(to)) return json({ error: "subscription" }, 400);
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 300)
    .filter((x: Row) => typeof x?.rid === "string" && /^[A-Za-z0-9_-]{8,40}$/.test(x.rid) && !isNaN(Date.parse(x.at)))
    .map((x: Row) => ({ rid: x.rid, at: new Date(x.at).toISOString() }));
  try {
    await rpc("grid_life_save", { p_hash: hash, p_endpoint: to.endpoint, p_key: to.p256dh, p_auth: to.auth, p_items: items });
  } catch (e) {
    if (String((e as Error).message).includes("too many new devices"))
      return json({ error: "Сейчас подключается слишком много новых устройств — попробуйте позже" }, 429);
    throw e;
  }
  return json({ ok: true, saved: items.length });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (!vapid()) return json({ error: "Уведомления не настроены: нет ключей VAPID в секретах функции" }, 503);
  if (req.method === "GET") return json({ key: Deno.env.get("VAPID_PUBLIC_KEY") });
  try {
    const body: Row = await req.json().catch(() => ({}));
    if (body.run) {
      if (!(await rpc("grid_cron_ok", { p_secret: req.headers.get("x-grid-cron") ?? "" }))) return json({ error: "Нет доступа" }, 403);
      return json({ sent: await run() });
    }
    if (body.life) return await life(body, req);
    if (body.test) {
      const id = await user(req);
      if (!id) return json({ error: "Нужно войти в Grid Work" }, 401);
      if (!(await allowed(`work-test:${id}`, 5, 600))) return tooOften();
      const subs: Target[] = await rest(`push_subscriptions?select=endpoint,p256dh,auth&user_id=eq.${id}`);
      const sent = await send(subs.map((to) => ({
        to, ttl: 600, urgency: "high" as const,
        msg: { title: "Grid Work", body: "Пробное уведомление: всё работает", tag: "test", url: "grid.html" },
      })));
      return json({ sent });
    }
    return json({ error: "Неизвестный запрос" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "Не удалось отправить уведомления" }, 500);
  }
});
