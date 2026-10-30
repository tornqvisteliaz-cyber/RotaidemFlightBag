// Airport moving map (AMM) in the style of Lido airport charts: runways with
// markings, taxiways with yellow guidelines, aprons, terminals, stands and
// holding points, taxiway sign labels and taxiway search. Ground data comes
// from OpenStreetMap (Overpass API), so coverage depends on OSM mapping.
/* global L */
import { esc } from "./ui.js";

const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const mem = new Map();

const PALETTE = {
  day: { bg: "#f1f0eb", apron: "#dcdcd6", apronLine: "#c9c9c2", twy: "#c3c3bd", twyEdge: "#a9a9a2", guide: "#e2b100", rwy: "#3d3f42", rwyMark: "#ffffff", bldg: "#b9b3a5", bldgLine: "#9d978a", stand: "#2d2f33", hold: "#e0362c", grass: "#e4e8da" },
  night: { bg: "#17191c", apron: "#2c2f34", apronLine: "#3b3f45", twy: "#44484f", twyEdge: "#565a61", guide: "#d6a800", rwy: "#0b0c0d", rwyMark: "#d9d9d9", bldg: "#3a3d42", bldgLine: "#4b4f55", stand: "#d0d3d8", hold: "#ff5a4e", grass: "#1d211b" },
};

/** Fetch OSM aeroway features around an airport (cached in memory and Cache Storage). */
export async function fetchGround(icao, lat, lon, radius = 4000) {
  if (mem.has(icao)) return mem.get(icao);
  const key = `https://efb.local/amm/${icao}`;
  try {
    const c = await caches.open("rfb-amm");
    const hit = await c.match(key);
    if (hit) { const j = await hit.json(); mem.set(icao, j); return j; }
  } catch { /* Cache Storage unavailable */ }
  const q = `[out:json][timeout:30];(
    way["aeroway"~"^(runway|taxiway|taxilane|apron|parking_position|holding_position|stopway)$"](around:${radius},${lat},${lon});
    way["aeroway"~"^(terminal|hangar)$"](around:${radius},${lat},${lon});
    node["aeroway"~"^(parking_position|gate|holding_position)$"](around:${radius},${lat},${lon});
  );out geom tags;`;
  let data = null, lastErr;
  for (const url of OVERPASS) {
    try {
      const r = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
      if (!r.ok) throw new Error(`Overpass ${r.status}`);
      data = await r.json();
      break;
    } catch (e) { lastErr = e; }
  }
  if (!data) throw lastErr || new Error("Ground data unavailable");
  mem.set(icao, data);
  try { (await caches.open("rfb-amm")).put(key, new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } })); } catch { /* ignore */ }
  return data;
}

const ll = g => g.map(p => [p.lat, p.lon]);
const closed = g => g.length > 3 && g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon;
const widthM = (t, d) => { const w = parseFloat(t.width); return isFinite(w) && w > 3 && w < 120 ? w : d; };

/**
 * Build the ground layer. Returns a layer group with .setTheme(), .search(ref),
 * .bounds and .refs (list of taxiway names).
 */
export function groundLayer(map, data, { theme = "day" } = {}) {
  for (const p of ["amm-area", "amm-twy", "amm-rwy", "amm-lbl"]) {
    if (!map.getPane(p)) { map.createPane(p); }
  }
  map.getPane("amm-area").style.zIndex = 330;
  map.getPane("amm-twy").style.zIndex = 340;
  map.getPane("amm-rwy").style.zIndex = 350;
  map.getPane("amm-lbl").style.zIndex = 620;
  const g = L.layerGroup();
  const metered = []; // [layer, metres, extraPx]
  const els = data.elements || [];
  const ways = els.filter(e => e.type === "way" && e.geometry?.length > 1);
  const nodes = els.filter(e => e.type === "node");
  const refs = new Map();
  let c = PALETTE[theme];
  const styled = [];
  const add = (layer, styleFn) => { styled.push([layer, styleFn]); layer.setStyle?.(styleFn(c)); g.addLayer(layer); return layer; };

  // Areas: aprons, buildings
  for (const w of ways) {
    const a = w.tags.aeroway;
    if (a === "apron" && closed(w.geometry)) add(L.polygon(ll(w.geometry), { pane: "amm-area", interactive: false }), p => ({ color: p.apronLine, weight: 1, fillColor: p.apron, fillOpacity: 1 }));
    if ((a === "terminal" || a === "hangar") && closed(w.geometry)) add(L.polygon(ll(w.geometry), { pane: "amm-area", interactive: false }), p => ({ color: p.bldgLine, weight: 1, fillColor: p.bldg, fillOpacity: 1 }));
  }
  // Taxiways: edge casing, surface, yellow guideline
  for (const w of ways) {
    const a = w.tags.aeroway;
    if (a !== "taxiway" && a !== "taxilane" && a !== "parking_position") continue;
    const pts = ll(w.geometry);
    if (a === "parking_position") {
      add(L.polyline(pts, { pane: "amm-twy", interactive: false }), p => ({ color: p.guide, weight: 1.2, opacity: .9 }));
      continue;
    }
    const wm = widthM(w.tags, a === "taxilane" ? 15 : 23);
    metered.push([add(L.polyline(pts, { pane: "amm-twy", interactive: false, lineCap: "round", lineJoin: "round" }), p => ({ color: p.twyEdge, opacity: 1 })), wm, 2]);
    metered.push([add(L.polyline(pts, { pane: "amm-twy", interactive: false, lineCap: "round", lineJoin: "round" }), p => ({ color: p.twy, opacity: 1 })), wm, 0]);
    const guide = add(L.polyline(pts, { pane: "amm-twy", interactive: false }), p => ({ color: p.guide, weight: 1.6, opacity: 1 }));
    const ref = (w.tags.ref || w.tags.name || "").trim();
    if (ref && ref.length <= 6) {
      if (!refs.has(ref)) refs.set(ref, []);
      refs.get(ref).push({ guide, pts });
    }
  }
  // Runways: surface, centreline, designators at each end
  for (const w of ways) {
    if (w.tags.aeroway !== "runway") continue;
    const pts = ll(w.geometry);
    if (closed(w.geometry)) { add(L.polygon(pts, { pane: "amm-rwy", interactive: false }), p => ({ color: p.rwy, weight: 1, fillColor: p.rwy, fillOpacity: 1 })); continue; }
    metered.push([add(L.polyline(pts, { pane: "amm-rwy", interactive: false, lineCap: "butt" }), p => ({ color: p.rwy, opacity: 1 })), widthM(w.tags, 45), 0]);
    add(L.polyline(pts, { pane: "amm-rwy", interactive: false, dashArray: "14 10" }), p => ({ color: p.rwyMark, weight: 1.4, opacity: .95 }));
    const ref = (w.tags.ref || "").split("/");
    const ends = [pts[0], pts[pts.length - 1]];
    ref.forEach((r, i) => {
      if (!r || !ends[i]) return;
      g.addLayer(L.marker(ends[i], { pane: "amm-lbl", interactive: false, icon: L.divIcon({ className: "amm-rwy", html: `<span>${esc(r.trim())}</span>`, iconSize: null }) }));
    });
  }
  // Holding positions
  for (const w of ways) if (w.tags.aeroway === "holding_position") add(L.polyline(ll(w.geometry), { pane: "amm-rwy", interactive: false }), p => ({ color: p.hold, weight: 3.5, opacity: 1 }));
  for (const n of nodes) {
    const a = n.tags?.aeroway;
    if (a === "holding_position") g.addLayer(L.marker([n.lat, n.lon], { pane: "amm-lbl", interactive: false, icon: L.divIcon({ className: "amm-hold", html: "<i></i>", iconSize: [10, 10], iconAnchor: [5, 5] }) }));
    if ((a === "parking_position" || a === "gate") && n.tags.ref) {
      g.addLayer(L.marker([n.lat, n.lon], { pane: "amm-lbl", interactive: false, icon: L.divIcon({ className: `amm-stand ${a}`, html: `<span>${esc(n.tags.ref)}</span>`, iconSize: null }) }));
    }
  }
  // Taxiway sign labels (one per segment cluster)
  const labels = L.layerGroup();
  for (const [ref, segs] of refs) {
    let lastPt = null;
    for (const s of segs) {
      const mid = s.pts[Math.floor(s.pts.length / 2)];
      if (lastPt && map.distance(mid, lastPt) < 350) continue;
      lastPt = mid;
      labels.addLayer(L.marker(mid, { pane: "amm-lbl", interactive: false, icon: L.divIcon({ className: "amm-twy-lbl", html: `<span>${esc(ref)}</span>`, iconSize: null }) }));
    }
  }
  g.addLayer(labels);

  const scale = () => {
    const z = map.getZoom(), lat = map.getCenter().lat;
    const mpp = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, z + 8);
    for (const [layer, m, extra] of metered) layer.setStyle({ weight: Math.max(1.5, m / mpp + extra) });
    const el = map.getPane("amm-lbl");
    el.classList.toggle("amm-hide-twy", z < 13.5);
    el.classList.toggle("amm-hide-hold", z < 14.5);
    el.classList.toggle("amm-hide-stand", z < 15.5);
    el.classList.toggle("amm-z-hi", z >= 16.5);
  };
  map.on("zoomend", scale);
  g.on("add", scale);
  g.on("remove", () => map.off("zoomend", scale));

  const all = ways.flatMap(w => ll(w.geometry));
  g.bounds = all.length ? L.latLngBounds(all) : null;
  // Lettered taxiways first (A, A1, B…), then numbered lanes.
  g.refs = [...refs.keys()].sort((a, b) => (/^\d/.test(a) - /^\d/.test(b)) || a.localeCompare(b, undefined, { numeric: true }));
  g.empty = !ways.some(w => w.tags.aeroway === "taxiway");
  g.setTheme = t => { c = PALETTE[t]; for (const [l, fn] of styled) l.setStyle(fn(c)); map.getContainer().style.background = c.bg; scale(); };
  g.background = () => c.bg;
  let hl = null;
  g.search = ref => {
    hl?.remove(); hl = null;
    const s = refs.get(ref);
    if (!s) return null;
    hl = L.layerGroup(s.map(x => L.polyline(x.pts, { pane: "amm-rwy", color: "#d22fc9", weight: 6, opacity: .85, interactive: false }))).addTo(map);
    return L.latLngBounds(s.flatMap(x => x.pts));
  };
  g.clearSearch = () => { hl?.remove(); hl = null; };
  map.getContainer().style.background = c.bg;
  return g;
}
