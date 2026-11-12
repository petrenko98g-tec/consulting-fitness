// Службові файли репозиторію не віддаються відвідувачам (лише 404).
// Функції запускаються тільки для шляхів із _routes.json, тож звичайні сторінки й картинки сюди не потрапляють.
const HIDDEN = new Set(['/.htaccess', '/.gitignore', '/.nojekyll', '/CNAME']);

export async function onRequest({ request, next }) {
  const path = new URL(request.url).pathname;
  if (HIDDEN.has(path)) return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  return next();
}
