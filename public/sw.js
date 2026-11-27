// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
// Snowlog service worker: stores the web app itself (HTML, CSS, JS and icon) so it opens offline.
// It never stores anything from GitHub or the sign-in: offline notes come from the app's encrypted
// cache (IndexedDB), not from here.

const VERSION = 'snowlog-v12';
const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'css/sketch.css',
  'fonts/caveat.woff',
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
  'js/i18n.js',
  'js/i18n-ca.js',
  'js/i18n-es.js',
  'js/i18n-fr.js',
  'js/i18n-pt.js',
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
  'js/sketch-editor.js',
  'js/sketch-render.js',
  'js/sketch-scene.js',
  'js/sketch-stroke.js',
  'js/sketch-templates.js',
  'js/sketch-textdiagram.js',
  'js/templates.js',
  'js/vault.js',
  'js/welcome.js',
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

// Network first (to always have the latest version); if there is none, the stored copy.
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
      // Only the app's own page is kept as the offline shell: another page on the same host never replaces it.
      const scope = new URL(self.registration.scope).pathname;
      const isApp = url.pathname === scope || url.pathname === `${scope}index.html`;
      if (res.ok && res.type === 'basic' && (req.mode !== 'navigate' || isApp)) cache.put(req.mode === 'navigate' ? 'index.html' : req, res.clone());
      return res;
    } catch (e) {
      const hit = await cache.match(req.mode === 'navigate' ? 'index.html' : req, { ignoreSearch: true });
      if (hit) return hit;
      throw e;
    }
  })());
});
