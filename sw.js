// FitPlanner service worker (v4)
// Network first, but with a safety net: if the network is slow (4 s), fails, or returns an
// error page (404/5xx), the last good saved copy of the app is used instead.
// Only good responses (status 200) are ever saved.
const V = 'fitplanner-v4';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
const TIMEOUT = 4000;

self.addEventListener('install', e => {
  // best effort: one missing file must not block the whole install
  e.waitUntil(caches.open(V).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(V);
    const fresh = (async () => {
      const res = await fetch(r);
      if (res.ok && res.type === 'basic') await cache.put(r, res.clone());
      return res;
    })();
    e.waitUntil(fresh.catch(() => {}));
    try {
      const res = await Promise.race([fresh, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), TIMEOUT))]);
      if (res.ok || res.type === 'opaqueredirect') return res;
      throw new Error('bad status ' + res.status);
    } catch (err) {
      const hit = (await cache.match(r, { ignoreSearch: true })) ||
                  (r.mode === 'navigate' ? await cache.match('index.html') : undefined);
      if (hit) return hit;
      return fresh; // nothing saved yet: show whatever the network gives
    }
  })());
});
