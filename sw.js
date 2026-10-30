// Offline cache: app shell + airport database are cached on install; CDN libraries,
// map land data and chart libraries are cached the first time they are used.
const VERSION = "rfb-v1";
const SHELL = [
  "./", "index.html", "manifest.webmanifest",
  "css/ios.css", "css/apps.css", "css/enroute.css", "css/tools.css",
  "js/main.js", "js/core/ui.js", "js/core/store.js", "js/core/icons.js", "js/core/flight.js", "js/core/airports.js",
  "js/core/geo.js", "js/core/wx.js", "js/core/map.js", "js/core/navigraph.js", "js/core/genchart.js", "js/core/perf.js",
  "js/core/registry.js", "js/core/wallpapers.js", "js/core/pair.js",
  "js/apps/charts.js", "js/apps/enroute.js", "js/apps/opt.js", "js/apps/briefing.js", "js/apps/weather.js", "js/apps/checklist.js",
  "js/apps/scratchpad.js", "js/apps/library.js", "js/apps/clock.js", "js/apps/settings.js", "js/apps/appstore.js",
  "js/apps/converter.js", "js/apps/logbook.js",
  "data/airports.json", "data/navaids.json", "assets/apple-touch-icon.png", "assets/icon-192.png",
];
const RUNTIME = ["cdnjs.cloudflare.com", "cdn.jsdelivr.net", "raw.githubusercontent.com", "server.arcgisonline.com", "basemaps.cartocdn.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Live data (SimBrief, weather, VATSIM, Navigraph API) always goes to the network.
  if (url.origin === location.origin) {
    if (url.pathname.includes("/api/") || url.pathname.endsWith("lan.json")) return;
    // Network first for the app itself so updates arrive, cache as fallback.
    e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
    return;
  }
  if (RUNTIME.some(h => url.hostname.endsWith(h))) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok || r.type === "opaque") { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); } return r; })));
  }
});
