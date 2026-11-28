// FORGED service worker: offline app shell + data, and reminder/crew notifications.
// Bump VERSION on every deploy so clients pick up new files.
const VERSION = 'forged-v3-3';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/tokens.css', 'css/app.css',
  'js/app.js', 'js/config.js', 'js/core/plan.js', 'js/core/store.js', 'js/core/bible.js', 'js/core/ui.js', 'js/core/cloud.js', 'js/core/data.js',
  'js/screens/today.js', 'js/screens/reader.js', 'js/screens/journey.js', 'js/screens/memory.js', 'js/screens/achievements.js', 'js/screens/journal.js',
  'js/screens/study.js', 'js/screens/brotherhood.js', 'js/screens/profile.js', 'js/screens/word.js', 'js/screens/landing.js', 'js/screens/onboarding.js',
  'data/plans.json', 'data/curriculum.json', 'data/recap.json', 'data/wordcount.json', 'data/study.json', 'data/audio.json',
  'assets/logo.webp', 'assets/icon.png', 'assets/icon-512.png'];
const LATER = ['data/web.json']; // large: cached after install, not blocking it
const CDN = /^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('install', (e) => e.waitUntil((async () => {
  const c = await caches.open(VERSION);
  await c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
  c.addAll(LATER).catch(() => {});
  self.skipWaiting();
})()));
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', (e) => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    if (u.pathname.endsWith('.mp3')) return;
    // network first for the page itself so updates land; cache first for everything else
    if (r.mode === 'navigate') { e.respondWith(fetch(r).then((res) => { caches.open(VERSION).then((c) => c.put('index.html', res.clone())); return res; }).catch(() => caches.match('index.html'))); return; }
    e.respondWith(caches.match(r, { ignoreSearch: true }).then((hit) => hit || fetch(r).then((res) => { if (res.ok) { const cl = res.clone(); caches.open(VERSION).then((c) => c.put(r, cl)); } return res; })));
    return;
  }
  if (CDN.test(r.url)) e.respondWith(caches.match(r).then((hit) => hit || fetch(r).then((res) => { if (res.ok || res.type === 'opaque') { const cl = res.clone(); caches.open(VERSION).then((c) => c.put(r, cl)); } return res; })));
  // Supabase, NLT API and narration audio always go to the network (never cached: NLT license).
});
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'FORGED52', {
    body: d.body || "Today's reading is waiting.", tag: d.tag || undefined,
    icon: 'assets/icon.png', badge: 'assets/icon-32.png', data: { url: d.url || '/#today' }
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/#today';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
