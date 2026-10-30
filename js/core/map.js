// Shared Leaflet map building blocks used by the Charts ENR view and the Enroute app.
/* global L, topojson */
import { unwrap, greatCircle, distNM } from "./geo.js";
import { allAirports, loadNavaids } from "./airports.js";
import { sigmets } from "./wx.js";
import { esc } from "./ui.js";

const once = new Map();
const cached = (k, fn) => { if (!once.has(k)) once.set(k, fn().catch(e => { once.delete(k); throw e; })); return once.get(k); };

export const fetchLand = () => cached("land", async () => {
  const t = await (await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-50m.json")).json();
  return topojson.feature(t, t.objects.land);
});
export const fetchBorders = () => cached("borders", async () => {
  const t = await (await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json")).json();
  return topojson.mesh(t, t.objects.countries, (a, b) => a !== b);
});
export const fetchFIRs = () => cached("firs", async () =>
  (await fetch("https://raw.githubusercontent.com/vatsimnetwork/vatspy-data-project/master/Boundaries.geojson")).json());
export const fetchFIRNames = () => cached("firnames", async () => {
  const txt = await (await fetch("https://raw.githubusercontent.com/vatsimnetwork/vatspy-data-project/master/VATSpy.dat")).text();
  const sec = txt.split("[FIRs]")[1]?.split("[")[0] || "";
  const m = new Map();
  for (const line of sec.split("\n")) {
    const [icao, name, prefix, boundary] = line.trim().split("|");
    if (icao && name && !line.startsWith(";")) m.set(boundary || icao, { icao, name, prefix });
  }
  return m;
});

export function createMap(el, { center = [10, 100], zoom = 4, minZoom = 2, maxZoom = 12 } = {}) {
  // Canvas instead of SVG: thousands of FIR/coastline vertices redraw far faster while panning.
  const map = L.map(el, {
    center, zoom, minZoom, maxZoom, zoomControl: false, attributionControl: true,
    worldCopyJump: true, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 110, wheelDebounceTime: 30,
    preferCanvas: true, renderer: L.canvas({ padding: 0.35, tolerance: 3 }), fadeAnimation: true, markerZoomAnimation: true,
  });
  map.attributionControl.setPrefix("");
  return map;
}

/**
 * Shows only the markers inside the view, adding/removing the difference after each
 * move (no full rebuild), and creating each marker lazily the first time it is needed.
 * items: array of data; pos(item) -> [lat, lon]; want(item, zoom) -> bool;
 * make(item, zoom) -> L.Marker; key(item, zoom) -> string (variants, e.g. with/without label).
 */
export function viewportMarkers(map, items, { pos, want, make, key = (it, z, i) => String(i), pad = 0.15, max = 900 }) {
  const group = L.layerGroup();
  const cache = new Map();
  let shown = new Map();
  let raf = 0;
  const update = () => {
    raf = 0;
    if (!map.hasLayer(group)) return;
    const z = map.getZoom(), b = map.getBounds().pad(pad);
    const next = new Map();
    for (let i = 0; i < items.length && next.size < max; i++) {
      const it = items[i];
      if (!want(it, z)) continue;
      const [la, lo] = pos(it);
      if (!b.contains([la, lo])) continue;
      const k = key(it, z, i);
      let m = shown.get(k) || cache.get(k);
      if (!m) { m = make(it, z); cache.set(k, m); }
      next.set(k, m);
    }
    for (const [k, m] of shown) if (!next.has(k)) group.removeLayer(m);
    for (const [k, m] of next) if (!shown.has(k)) group.addLayer(m);
    shown = next;
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
  group.on("add", () => { map.on("moveend", schedule); schedule(); });
  group.on("remove", () => { map.off("moveend", schedule); group.clearLayers(); shown = new Map(); });
  group.refresh = () => { for (const m of shown.values()) group.removeLayer(m); shown = new Map(); cache.clear(); schedule(); };
  return group;
}

/** Vector land / border layer (Natural Earth via world-atlas). */
export async function addLand(map, { land = "#f4efdc", borders = "#9a9a9a", dash = "2 3", pane = "tilePane" } = {}) {
  if (!map.getPane("land")) { map.createPane("land"); map.getPane("land").style.zIndex = 150; }
  const geo = await fetchLand();
  const lyr = L.geoJSON(geo, { pane: "land", interactive: false, style: { stroke: false, fillColor: land, fillOpacity: 1 } }).addTo(map);
  let b = null;
  if (borders) {
    const mesh = await fetchBorders();
    b = L.geoJSON(mesh, { pane: "land", interactive: false, style: { color: borders, weight: 0.8, dashArray: dash, fill: false } }).addTo(map);
  }
  return L.layerGroup([lyr, ...(b ? [b] : [])]);
}

/** FIR boundaries (VATSpy data). style: "charts" (green dashed) or "fd" (black with ticks). */
export async function firLayer(map, style = "charts") {
  const [geo, names] = await Promise.all([fetchFIRs(), fetchFIRNames().catch(() => new Map())]);
  const g = L.layerGroup();
  const lineStyle = style === "fd"
    ? [{ color: "#2b2b2b", weight: 1.3, fill: false, interactive: false }, { color: "#2b2b2b", weight: 5, dashArray: "1.2 11", fill: false, opacity: .75, interactive: false }]
    : [{ color: "#6f9a52", weight: 1.6, dashArray: "7 5", fill: false, interactive: false }];
  for (const s of lineStyle) g.addLayer(L.geoJSON(geo, { style: { ...s, smoothFactor: 1.6 }, interactive: false }));
  const feats = geo.features.filter(f => f.properties.label_lat);
  const labels = viewportMarkers(map, feats, {
    pos: f => [+f.properties.label_lat, +f.properties.label_lon],
    want: (f, z) => z >= 3,
    make: f => L.marker([+f.properties.label_lat, +f.properties.label_lon], {
      interactive: false, keyboard: false,
      icon: L.divIcon({ className: `fir-label st-${style}`, html: `<span>${esc(f.properties.id)}${names.get(f.properties.id) && style === "fd" ? " FIR" : ""}</span>`, iconSize: null }),
    }),
    max: 250,
  });
  g.labels = labels;
  g.names = names;
  g.geo = geo;
  return g;
}

/** Airports as gear symbols. */
export async function airportLayer(map, { highlight = [], color = "#4c6b54", labels = true, minSize = 0 } = {}) {
  const all = await allAirports();
  const hl = new Set(highlight);
  const gear = c => `<svg viewBox="0 0 20 20" width="16" height="16"><g fill="none" stroke="${c}" stroke-width="2"><circle cx="10" cy="10" r="5"/>${[0, 45, 90, 135].map(a => `<line x1="10" y1="1.5" x2="10" y2="18.5" transform="rotate(${a} 10 10)"/>`).join("")}</g><circle cx="10" cy="10" r="3.4" fill="#fff" stroke="${c}" stroke-width="1.5"/></svg>`;
  const items = all.filter(a => a[8] >= minSize || hl.has(a[0]));
  const lg = viewportMarkers(map, items, {
    pos: a => [a[5], a[6]],
    // Only what fits the zoom level keeps the map light.
    want: (a, z) => hl.has(a[0]) || (a[8] === 2 && z >= 4) || (a[8] === 1 && z >= 6) || (a[8] === 0 && z >= 7.5),
    key: a => a[0],
    make: a => {
      const isHl = hl.has(a[0]);
      const m = L.marker([a[5], a[6]], {
        keyboard: false,
        icon: L.divIcon({ className: `apt-sym ${isHl ? "hl" : ""} s${a[8]}`, html: `${gear(isHl ? "#d22fc9" : color)}${labels ? `<b>${a[0]}</b>` : ""}`, iconSize: [16, 16], iconAnchor: [8, 8] }),
      });
      m.apt = a;
      return m;
    },
    pad: 0.2, max: 700,
  });
  return lg;
}

/** VOR / NDB symbols with frequency boxes at higher zooms. */
export async function navaidLayer(map, { ndb = false } = {}) {
  const nav = await loadNavaids();
  const vor = `<svg viewBox="0 0 20 20" width="14" height="14"><polygon points="5,1.5 15,1.5 19.5,10 15,18.5 5,18.5 0.5,10" fill="none" stroke="#2f8f4a" stroke-width="1.8"/><circle cx="10" cy="10" r="1.6" fill="#2f8f4a"/></svg>`;
  const ndbSym = `<svg viewBox="0 0 20 20" width="13" height="13"><circle cx="10" cy="10" r="8" fill="none" stroke="#a3507f" stroke-width="1.6" stroke-dasharray="1.5 1.5"/><circle cx="10" cy="10" r="2" fill="#a3507f"/></svg>`;
  const lg = viewportMarkers(map, nav, {
    pos: n => [n[4], n[5]],
    want: (n, z) => z >= 6 && (ndb || n[2] !== "NDB"),
    key: (n, z, i) => `${i}${z >= 7 ? "L" : ""}`,
    make: (n, z) => {
      const isNdb = n[2] === "NDB";
      const freq = isNdb ? `${n[3]}` : (n[3] / 1000).toFixed(1);
      return L.marker([n[4], n[5]], {
        interactive: false, keyboard: false,
        icon: L.divIcon({ className: "nav-sym", html: `${isNdb ? ndbSym : vor}${z >= 7 ? `<span class="${isNdb ? "ndb" : ""}">${isNdb ? "" : "D"}${freq} ${esc(n[0])}</span>` : ""}`, iconSize: [14, 14], iconAnchor: [7, 7] }),
      });
    },
    pad: 0.1, max: 500,
  });
  lg.setNdb = v => { ndb = v; lg.refresh(); };
  return lg;
}

/** Route line + waypoint symbols from a flight's navlog. */
export function routeLayer(flight, { color = "#d22fc9", weight = 3, labels = true, style = "charts" } = {}) {
  const g = L.layerGroup();
  if (!flight?.orig) return g;
  const pts = [[flight.orig.lat, flight.orig.lon]];
  for (const f of flight.navlog || []) if (f.lat != null) pts.push([f.lat, f.lon]);
  if (pts.length < 2 && flight.dest) pts.push([flight.dest.lat, flight.dest.lon]);
  // Densify legs along great circles so long legs curve correctly.
  let line = [];
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const seg = greatCircle(a[0], a[1], b[0], b[1], Math.max(1, Math.round(distNM(a[0], a[1], b[0], b[1]) / 60)));
    line.push(...(i > 1 ? seg.slice(1) : seg));
  }
  line = unwrap(line);
  if (style === "fd") g.addLayer(L.polyline(line, { color: "#fff", weight: weight + 4, opacity: .55, interactive: false }));
  g.addLayer(L.polyline(line, { color, weight, opacity: 1, interactive: false }));
  // Waypoints
  let lastLon = flight.orig.lon;
  for (const f of flight.navlog || []) {
    if (f.lat == null || f.type === "apt") continue;
    let lon = f.lon; while (lon - lastLon > 180) lon -= 360; while (lon - lastLon < -180) lon += 360; lastLon = lon;
    if (f.sidstar && style === "fd") continue;
    const sym = style === "fd"
      ? `<svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 1 L11 10 L1 10Z" fill="#fff" stroke="#1d1d1d" stroke-width="1.4"/></svg>`
      : `<svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 1 L11 10 L1 10Z" fill="none" stroke="${color}" stroke-width="1.6"/></svg>`;
    g.addLayer(L.marker([f.lat, lon], {
      interactive: false,
      icon: L.divIcon({ className: `wpt-sym st-${style}`, html: `${sym}${labels ? `<span>${esc(f.ident)}</span>` : ""}`, iconSize: [12, 12], iconAnchor: [6, 7] }),
    }));
  }
  g.bounds = L.latLngBounds(line);
  g.line = line;
  return g;
}

/** Leg labels (airway / FL) placed mid-leg, as on the FD Pro map. */
export function airwayLabels(flight) {
  const g = L.layerGroup();
  const nl = (flight?.navlog || []).filter(f => f.lat != null);
  let prev = flight?.orig && { lat: flight.orig.lat, lon: flight.orig.lon };
  let lastVia = null;
  for (const f of nl) {
    if (prev && f.via && f.via !== "DCT" && f.via !== lastVia && !f.sidstar && f.via.length <= 6) {
      const mid = [(prev.lat + f.lat) / 2, prev.lon + (((f.lon - prev.lon + 540) % 360) - 180) / 2];
      g.addLayer(L.marker(mid, {
        interactive: false,
        icon: L.divIcon({ className: "awy-label", html: `<b>${esc(f.via)}</b><span>FL${Math.round((f.alt || 0) / 100)}</span>`, iconSize: null }),
      }));
      lastVia = f.via;
    }
    prev = f;
  }
  return g;
}

/** RainViewer radar composite. Returns { layer, frames, setFrame(i) }. */
export async function radar(map, { opacity = 0.65 } = {}) {
  const meta = await (await fetch("https://api.rainviewer.com/public/weather-maps.json")).json();
  const frames = [...(meta.radar?.past || []), ...(meta.radar?.nowcast || [])].map(f => ({ ...f, nowcast: (meta.radar?.nowcast || []).includes(f) }));
  const layers = new Map();
  const group = L.layerGroup();
  let idx = (meta.radar?.past?.length || 1) - 1;
  const layerFor = i => {
    const f = frames[i];
    if (!layers.has(f.path)) layers.set(f.path, L.tileLayer(`${meta.host}${f.path}/256/{z}/{x}/{y}/4/1_1.png`, { opacity, maxNativeZoom: 7, maxZoom: 14, zIndex: 400, updateWhenZooming: false, keepBuffer: 1, attribution: "Radar © RainViewer" }));
    return layers.get(f.path);
  };
  const setFrame = i => {
    idx = Math.max(0, Math.min(frames.length - 1, i));
    const want = layerFor(idx);
    want.setOpacity(opacity);
    if (!group.hasLayer(want)) group.addLayer(want);
    // Keep only the visible frame on the map (hidden frames still cost GPU time);
    // drop the previous one once the new one has drawn, so playback doesn't flash.
    const old = [...layers.values()].filter(l => l !== want && group.hasLayer(l));
    if (old.length) want.once("load", () => old.forEach(l => group.removeLayer(l)));
    setTimeout(() => old.forEach(l => { if (group.hasLayer(l) && layerFor(idx) !== l) group.removeLayer(l); }), 1500);
  };
  group.on("add", () => setFrame(idx));
  return { layer: group, frames, setFrame, get index() { return idx; } };
}

/** SIGMET polygons (when a source is available). */
export async function sigmetLayer({ fd = true } = {}) {
  const list = await sigmets();
  const g = L.layerGroup();
  if (!list) { g.unavailable = true; return g; }
  for (const s of list) {
    const poly = L.polygon(unwrap(s.coords), { color: "#b52a3a", weight: 1.4, fillColor: "#c8394b", fillOpacity: 0.32 });
    poly.bindPopup(`<b>${esc(s.fir)} ${esc(s.qualifier || "")} ${esc(s.hazard)}</b><br>${s.base ? `FL${Math.round(s.base / 100)}–` : "SFC–"}FL${Math.round((s.top || 0) / 100)}<pre>${esc(s.raw)}</pre>`, { maxWidth: 380, className: "sig-pop" });
    g.addLayer(poly);
    if (fd && s.top) {
      const c = poly.getBounds().getCenter();
      g.addLayer(L.marker(c, { interactive: false, icon: L.divIcon({ className: "sig-tag", html: `${esc((s.qualifier || "OCNL").slice(0, 4))}<br>${Math.round(s.top / 100)}<br>${s.base ? Math.round(s.base / 100) : "SFC"}`, iconSize: null }) }));
    }
  }
  g.count = list.length;
  return g;
}

/** Live VATSIM controllers (frequency callouts) positioned on their FIR label. */
export async function vatsimAtc(firs) {
  const d = await (await fetch("https://data.vatsim.net/v3/vatsim-data.json")).json();
  const g = L.layerGroup();
  const byPrefix = new Map();
  for (const [boundary, f] of firs.names) byPrefix.set((f.prefix || f.icao).toUpperCase(), { ...f, boundary });
  const pos = new Map(firs.geo.features.map(f => [f.properties.id, [+f.properties.label_lat, +f.properties.label_lon]]));
  const grouped = new Map();
  for (const c of d.controllers || []) {
    if (!/_(CTR|FSS)$/.test(c.callsign)) continue;
    const prefix = c.callsign.split("_")[0].toUpperCase();
    const f = byPrefix.get(prefix) || [...byPrefix.values()].find(x => x.icao === prefix);
    if (!f || !pos.get(f.boundary)) continue;
    const k = f.boundary;
    if (!grouped.has(k)) grouped.set(k, { f, freqs: [] });
    grouped.get(k).freqs.push(c.frequency);
  }
  for (const [k, { f, freqs }] of grouped) {
    g.addLayer(L.marker(pos.get(k), {
      interactive: false,
      icon: L.divIcon({ className: "atc-box", html: `<div>${esc(f.name.toUpperCase())}</div><div>${freqs.join(",")}</div>`, iconSize: null }),
    }));
  }
  g.count = grouped.size;
  return g;
}

/** Own-ship symbol with trail. update(state) moves it; follow keeps it centred. */
export function ownship(map, { color = "#ffffff", outline = "#111", size = 34, trailColor = "#1f7ae0" } = {}) {
  const icon = () => L.divIcon({
    className: "ownship",
    html: `<svg viewBox="0 0 40 40" width="${size}" height="${size}"><path d="M20 2 C21.6 2 22.4 4 22.4 6.5 V15 L37 23.5 V27 L22.4 22.6 V31.5 L27 35 V37.6 L20 35.8 L13 37.6 V35 L17.6 31.5 V22.6 L3 27 V23.5 L17.6 15 V6.5 C17.6 4 18.4 2 20 2Z" fill="${color}" stroke="${outline}" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
    iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  });
  const marker = L.marker([0, 0], { icon: icon(), interactive: false, zIndexOffset: 2000, keyboard: false });
  const trail = L.polyline([], { color: trailColor, weight: 2.5, opacity: .7, dashArray: "2 5", interactive: false });
  let shown = false, last = null;
  const ctl = {
    follow: false,
    update(s) {
      if (!s?.connected || s.lat == null) { if (shown) { marker.remove(); trail.remove(); shown = false; } return; }
      const p = L.latLng(s.lat, s.lon);
      marker.setLatLng(p);
      const rot = (s.onGround ? s.hdg : s.trk ?? s.hdg) ?? 0;
      const el = marker.getElement()?.querySelector("svg");
      if (el) el.style.transform = `rotate(${rot}deg)`;
      if (!last || map.distance(last, p) > (s.onGround ? 8 : 400)) { trail.addLatLng(p); last = p; if (trail.getLatLngs().length > 4000) trail.setLatLngs(trail.getLatLngs().slice(-3000)); }
      if (!shown) { trail.addTo(map); marker.addTo(map); shown = true; const e2 = marker.getElement()?.querySelector("svg"); if (e2) e2.style.transform = `rotate(${rot}deg)`; }
      if (ctl.follow) map.panTo(p, { animate: true, duration: 0.25, noMoveStart: true });
    },
    get latlng() { return shown ? marker.getLatLng() : null; },
    clearTrail() { trail.setLatLngs([]); last = null; },
  };
  return ctl;
}

// ---------------------------------------------------------------- basemaps
// Esri basemaps work without an API key (attribution required).
const ESRI = svc => `https://server.arcgisonline.com/ArcGIS/rest/services/${svc}/MapServer/tile/{z}/{y}/{x}`;
const LAND_MAX = 7; // vector Natural Earth land below this zoom, detailed tiles above

/**
 * Detailed basemap that stays sharp at every zoom.
 * style "charts": Charts+-like cream land / grey-blue sea (vector) when zoomed out,
 *                 Esri light canvas when zoomed in.
 * style "fd":     Esri physical relief zoomed out, Esri topographic detail zoomed in.
 * Returns { group, labels, setLabels(bool), remove() }.
 */
export function basemap(map, style = "charts") {
  if (!map.getPane("base")) { map.createPane("base"); map.getPane("base").style.zIndex = 140; }
  if (!map.getPane("labels")) { map.createPane("labels"); map.getPane("labels").style.zIndex = 390; map.getPane("labels").style.pointerEvents = "none"; }
  const layers = [];
  let land = null;
  if (style === "fd") {
    layers.push(L.tileLayer(ESRI("World_Physical_Map"), { pane: "base", maxNativeZoom: 8, maxZoom: 8.99, updateWhenZooming: false, keepBuffer: 3, className: "bm-physical", attribution: "Terrain © Esri, US NPS" }));
    layers.push(L.tileLayer(ESRI("World_Topo_Map"), { pane: "base", minZoom: 9, maxNativeZoom: 19, maxZoom: 20, updateWhenZooming: false, keepBuffer: 3, className: "bm-fd-hi", attribution: "© Esri, HERE, Garmin, OpenStreetMap contributors" }));
  } else {
    layers.push(L.tileLayer(ESRI("Canvas/World_Light_Gray_Base"), { pane: "base", minZoom: LAND_MAX, maxNativeZoom: 16, maxZoom: 20, updateWhenZooming: false, keepBuffer: 3, className: "bm-charts", attribution: "© Esri, HERE, Garmin" }));
    // Charts+ look when zoomed out: flat cream land on grey-blue sea.
    addLand(map, { land: "#f3eed9", borders: "#9a9a9a" }).then(l => {
      land = l;
      const vis = () => { const p = map.getPane("land"); if (p) p.style.display = map.getZoom() < LAND_MAX ? "" : "none"; };
      map.on("zoomend", vis); vis();
    }).catch(() => {});
  }
  const labels = L.tileLayer(ESRI("Canvas/World_Light_Gray_Reference"), { pane: "labels", minZoom: 7, maxNativeZoom: 16, maxZoom: 20, opacity: 0.85, updateWhenZooming: false, className: "bm-labels" });
  const group = L.layerGroup(layers).addTo(map);
  return {
    group, labels,
    setLabels(on) { on ? labels.addTo(map) : labels.remove(); },
    remove() { group.remove(); labels.remove(); land?.remove(); },
  };
}

/** Navigraph enroute chart tiles (needs a Navigraph client with the "tiles" scope and a signed-in user). */
export async function navigraphTiles(map, source = "IFR HIGH", theme = "DAY") {
  const NG = await import("./navigraph.js");
  const n = await NG.navigraph();
  if (!n || !n.auth.getUser()) throw new Error("Sign in to Navigraph first (Settings › Navigraph)");
  const { NavigraphTileLayer } = await import("https://cdn.jsdelivr.net/npm/@navigraph/leaflet@2.2.1/+esm");
  const layer = new NavigraphTileLayer(n.auth, { type: "Navigraph", source, theme }, { pane: "base" });
  return layer;
}
