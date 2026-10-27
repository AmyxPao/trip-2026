// 離線：第一次打開就把整個 App（含行程資料與路線圖）存進快取，之後先用快取
const VERSION = 'hokuriku-v13';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/store.js', 'js/trip.js', 'js/ledger.js', 'js/ui.js', 'js/icons.js',
  'js/view-trip.js', 'js/view-ledger.js', 'js/view-misc.js', 'js/sync.js', 'js/xlsx.js', 'js/export-xlsx.js',
  'data/trip.json',
  'data/maps/overview.webp', 'data/maps/day1.webp', 'data/maps/day2.webp', 'data/maps/day3.webp', 'data/maps/day4.webp',
  'data/maps/day5.webp', 'data/maps/day6.webp', 'data/maps/day7.webp', 'data/maps/day8.webp',
  'fonts/barlow-condensed-600.woff2', 'fonts/barlow-condensed-700.woff2', 'fonts/yuji-syuku-stamps.woff2',
  'icons/icon-32.png', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// 同網域：先回快取，同時在背景更新；外部連結（Google Maps 等）不處理
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then((res) => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    return res || (e.request.mode === 'navigate' ? cache.match('index.html') : Response.error());
  }));
});
