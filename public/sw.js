// Service worker de Snowlog: guarda la propia web (HTML, CSS, JS e icono) para abrirla sin conexión.
// Nunca guarda nada de GitHub ni del login: las notas sin conexión salen de la caché cifrada
// de la app (IndexedDB), no de aquí.

const VERSION = 'snowlog-v1';
const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'icon.svg',
  'manifest.webmanifest',
  'js/app.js',
  'js/auth.js',
  'js/backup.js',
  'js/cache.js',
  'js/config.js',
  'js/crypto.js',
  'js/editor.js',
  'js/examples.js',
  'js/github.js',
  'js/graph.js',
  'js/import.js',
  'js/kanban.js',
  'js/kvdir.js',
  'js/links.js',
  'js/localvault.js',
  'js/markdown.js',
  'js/merge.js',
  'js/noteindex.js',
  'js/query.js',
  'js/search.js',
  'js/templates.js',
  'js/vault.js',
  'js/zip.js',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Primero la red (para tener siempre la última versión); si no hay, lo guardado.
self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/snowlog-portable.html')) return;
  ev.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await Promise.race([
        fetch(req),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ]);
      if (res.ok && res.type === 'basic') cache.put(req.mode === 'navigate' ? 'index.html' : req, res.clone());
      return res;
    } catch (e) {
      const hit = await cache.match(req.mode === 'navigate' ? 'index.html' : req, { ignoreSearch: true });
      if (hit) return hit;
      throw e;
    }
  })());
});
