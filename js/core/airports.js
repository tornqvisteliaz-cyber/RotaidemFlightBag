// Airport / runway / navaid database built from OurAirports (see tools/build-data.mjs).
let dbPromise, navPromise;
const byIcao = new Map();
const byIata = new Map();

function runway(r) {
  const [le, he, len, wid, surf, leLat, leLon, leElev, leHdg, leDisp, heLat, heLon, heElev, heHdg, heDisp] = r;
  return { le, he, len, wid, surf, leLat, leLon, leElev, leHdg, leDisp: leDisp || 0, heLat, heLon, heElev, heHdg, heDisp: heDisp || 0 };
}

function airport(a) {
  const [icao, iata, name, city, country, lat, lon, elev, size, rwys, freqs] = a;
  return {
    icao, iata, name, city, country, lat, lon, elev, size,
    runways: rwys.map(runway),
    freqs: freqs.map(([type, desc, mhz]) => ({ type, desc, mhz })),
  };
}

export function loadAirports() {
  dbPromise ??= fetch("data/airports.json").then(r => r.json()).then(d => {
    for (const a of d.airports) {
      byIcao.set(a[0], a);
      if (a[1]) byIata.set(a[1], a);
    }
    return d;
  });
  return dbPromise;
}

const cache = new Map();
export async function getAirport(code) {
  if (!code) return null;
  await loadAirports();
  code = code.toUpperCase().trim();
  const raw = byIcao.get(code) || byIata.get(code);
  if (!raw) return null;
  if (!cache.has(raw[0])) cache.set(raw[0], airport(raw));
  return cache.get(raw[0]);
}

export async function searchAirports(q, limit = 30) {
  await loadAirports();
  q = q.trim().toUpperCase();
  if (!q) return [];
  const out = [];
  const exact = byIcao.get(q) || byIata.get(q);
  if (exact) out.push(exact);
  for (const a of byIcao.values()) {
    if (out.length >= limit) break;
    if (a === exact) continue;
    if (a[0].startsWith(q) || a[1] === q || a[2].toUpperCase().includes(q) || a[3].toUpperCase().includes(q)) out.push(a);
  }
  return out.map(a => getAirportSync(a[0]));
}

export function getAirportSync(icao) {
  const raw = byIcao.get(icao);
  if (!raw) return null;
  if (!cache.has(icao)) cache.set(icao, airport(raw));
  return cache.get(icao);
}

/** All airports (raw arrays) – for map layers. */
export async function allAirports() {
  const d = await loadAirports();
  return d.airports;
}

/** Both runway ends as separate "takeoff/landing runways" with their own data. */
export function runwayEnds(ap) {
  const ends = [];
  for (const r of ap.runways) {
    const hasCoords = r.leLat != null && r.heLat != null;
    const hdgLe = r.leHdg ?? (r.heHdg != null ? (r.heHdg + 180) % 360 : identHdg(r.le));
    const hdgHe = r.heHdg ?? (hdgLe + 180) % 360;
    ends.push({ id: r.le, other: r.he, hdg: hdgLe, len: r.len, wid: r.wid, surf: r.surf, elev: r.leElev ?? ap.elev, disp: r.leDisp, lat: r.leLat, lon: r.leLon, hasCoords, rwy: r });
    if (r.he) ends.push({ id: r.he, other: r.le, hdg: hdgHe, len: r.len, wid: r.wid, surf: r.surf, elev: r.heElev ?? ap.elev, disp: r.heDisp, lat: r.heLat, lon: r.heLon, hasCoords, rwy: r });
  }
  return ends.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}
const identHdg = id => (parseInt(id, 10) || 36) * 10;

export const SURFACE = s => {
  s = (s || "").toUpperCase();
  if (/ASP|ASPH|BIT|PEM|ASPHALT/.test(s)) return "Asphalt";
  if (/CON|CONC|PEM/.test(s)) return "Concrete";
  if (/GRS|GRASS|TURF/.test(s)) return "Grass";
  if (/GRV|GRAVEL/.test(s)) return "Gravel";
  return s || "—";
};

export function loadNavaids() {
  navPromise ??= fetch("data/navaids.json").then(r => r.json()).then(d => d.navaids);
  return navPromise;
}
