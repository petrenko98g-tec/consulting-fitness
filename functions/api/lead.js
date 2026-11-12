// Cloudflare Pages Function: резервна доставка заявок з сайту.
// 1) Зберігає кожну заявку у сховищі Cloudflare KV (прив'язка LEADS) — заявка не губиться,
//    навіть якщо поштовий сервіс не відповідає. Дивитись: Cloudflare → Storage & databases → Workers KV → LEADS.
// 2) Якщо задані секрети TG_TOKEN і TG_CHAT — дублює заявку в Telegram.
// Налаштування: Pages → consulting-fitness → Settings → Bindings (KV: LEADS) і Variables and Secrets.

const ALLOWED = /^https:\/\/((www\.)?websites\.fitness|([\w-]+\.)?[\w-]+\.pages\.dev)$/;
const MAX_BODY = 4000;
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin') || '';
  if (!ALLOWED.test(origin)) return new Response('forbidden', { status: 403 });

  const raw = await request.text();
  if (raw.length > MAX_BODY) return new Response('too large', { status: 413 });

  let data;
  try { data = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return new Response('bad data', { status: 400 });

  // захист від спаму: не більше 5 заявок за хвилину з однієї IP (лічильник у кеші Cloudflare, безкоштовно)
  const ip = request.headers.get('CF-Connecting-IP') || 'x';
  const key = new Request(`https://rate.local/${encodeURIComponent(ip)}`);
  const cache = caches.default;
  const hit = await cache.match(key);
  const count = hit ? Number(await hit.text()) || 0 : 0;
  if (count >= 5) return json({ saved: false, telegram: false, limited: true }, 429);
  await cache.put(key, new Response(String(count + 1), { headers: { 'Cache-Control': 'max-age=60' } }));

  // пастка для ботів: справжня форма ніколи не заповнює це поле
  if (data._hp) return json({ saved: true, telegram: false });

  const clean = {};
  for (const [k, v] of Object.entries(data).slice(0, 30)) {
    if (k.startsWith('_') || v == null || v === '') continue;
    clean[String(k).slice(0, 60)] = String(v).slice(0, 300);
  }

  // заявка без контакту — не заявка
  const contact = Object.entries(clean).some(([k, v]) => /телефон|telegram|ім/i.test(k) && v.trim().length >= 2);
  if (!contact) return new Response('bad data', { status: 400 });

  let saved = false;
  if (env.LEADS) {
    const at = new Date().toISOString();
    const id = clean['ID заявки'] || crypto.randomUUID();
    try {
      await env.LEADS.put(`lead:${at}:${id}`, JSON.stringify({ at, ...clean }));
      saved = true;
    } catch (e) { /* не валимо відповідь — далі ще Telegram */ }
  }

  let telegram = false;
  if (env.TG_TOKEN && env.TG_CHAT) {
    const lines = ['🔥 Нова заявка — Consulting Fitness', ''];
    for (const [k, v] of Object.entries(clean)) lines.push(`${k}: ${v}`);
    try {
      const tg = await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: env.TG_CHAT, text: lines.join('\n'), disable_web_page_preview: true }),
      });
      telegram = tg.ok;
    } catch (e) { /* ignore */ }
  }

  return json({ saved, telegram });
}

export function onRequest() {
  return new Response('method not allowed', { status: 405, headers: { Allow: 'POST' } });
}
