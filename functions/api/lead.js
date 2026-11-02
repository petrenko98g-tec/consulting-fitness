// Cloudflare Pages Function: копія заявки з сайту в Telegram.
// Секрети задаються в Cloudflare → Pages → проєкт → Settings → Variables and Secrets:
//   TG_TOKEN — токен бота від @BotFather
//   TG_CHAT  — chat_id того, хто натиснув Start у боті
// Без секретів функція нічого не надсилає (заявки все одно йдуть на пошту).

const ALLOWED = /^https:\/\/((www\.)?websites\.fitness|([\w-]+\.)?[\w-]+\.pages\.dev)$/;
const MAX_BODY = 4000;

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin') || '';
  if (!ALLOWED.test(origin)) return new Response('forbidden', { status: 403 });
  if (!env.TG_TOKEN || !env.TG_CHAT) return new Response(null, { status: 204 });

  const raw = await request.text();
  if (raw.length > MAX_BODY) return new Response('too large', { status: 413 });

  let data;
  try { data = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return new Response('bad data', { status: 400 });

  const lines = ['🔥 Нова заявка — Consulting Fitness', ''];
  for (const [k, v] of Object.entries(data).slice(0, 30)) {
    if (k.startsWith('_') || v == null || v === '') continue;
    lines.push(`${String(k).slice(0, 60)}: ${String(v).slice(0, 300)}`);
  }

  const tg = await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TG_CHAT, text: lines.join('\n'), disable_web_page_preview: true }),
  });
  return new Response(null, { status: tg.ok ? 204 : 502 });
}

export function onRequest() {
  return new Response('method not allowed', { status: 405, headers: { Allow: 'POST' } });
}
