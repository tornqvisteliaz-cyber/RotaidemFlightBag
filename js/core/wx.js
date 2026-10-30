// Weather: METAR (VATSIM mirror, CORS friendly), TAF / SIGMET through the optional
// PHP proxy (api/wx.php) when the app is hosted with PHP, and a METAR decoder.
import { getFlight } from "./flight.js";

const cache = new Map();
const fresh = (k, ms) => { const c = cache.get(k); return c && Date.now() - c.t < ms ? c.v : null; };

export async function metar(icao) {
  icao = icao.toUpperCase();
  const hit = fresh("m" + icao, 5 * 60e3);
  if (hit) return hit;
  let txt = "";
  try {
    const r = await fetch(`https://metar.vatsim.net/${icao}`);
    txt = (await r.text()).trim();
  } catch { /* offline */ }
  if (!txt || /no metar/i.test(txt)) {
    const f = getFlight();
    txt = [f?.orig, f?.dest, ...(f?.altns || [])].find(a => a?.icao === icao)?.metar || "";
  }
  cache.set("m" + icao, { t: Date.now(), v: txt });
  return txt;
}

/** Try the PHP proxy (same origin). Returns null when not available (e.g. GitHub Pages). */
async function proxy(kind, params) {
  try {
    const r = await fetch(`api/wx.php?type=${kind}&${new URLSearchParams(params)}`);
    if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) return null;
    return await r.json();
  } catch { return null; }
}

export async function taf(icao) {
  icao = icao.toUpperCase();
  const hit = fresh("t" + icao, 15 * 60e3);
  if (hit != null) return hit;
  let txt = "";
  const j = await proxy("taf", { ids: icao });
  if (Array.isArray(j) && j[0]?.rawTAF) txt = j[0].rawTAF;
  if (!txt) {
    const f = getFlight();
    txt = [f?.orig, f?.dest, ...(f?.altns || [])].find(a => a?.icao === icao)?.taf || "";
  }
  cache.set("t" + icao, { t: Date.now(), v: txt });
  return txt;
}

/** International SIGMETs as GeoJSON-ish objects, or null when no source is reachable. */
export async function sigmets() {
  const hit = fresh("sig", 10 * 60e3);
  if (hit) return hit;
  let j = null;
  try {
    const r = await fetch("https://aviationweather.gov/api/data/isigmet?format=json");
    j = await r.json();
  } catch { j = await proxy("isigmet", {}); }
  if (!Array.isArray(j)) return null;
  const v = j.filter(s => Array.isArray(s.coords) && s.coords.length > 2).map(s => ({
    fir: s.firId, name: s.firName, hazard: s.hazard, qualifier: s.qualifier,
    top: s.top, base: s.base, from: s.validTimeFrom * 1000, to: s.validTimeTo * 1000,
    raw: s.rawSigmet, coords: s.coords.map(c => [c.lat, c.lon]),
  }));
  cache.set("sig", { t: Date.now(), v });
  return v;
}

// ---- METAR decoding -------------------------------------------------------
export function decodeMetar(raw) {
  if (!raw) return null;
  const s = " " + raw.replace(/\s+/g, " ") + " ";
  const d = { raw: raw.trim() };
  let m;
  if ((m = s.match(/ (\d{2})(\d{2})(\d{2})Z /))) d.time = { day: +m[1], h: +m[2], m: +m[3] };
  if ((m = s.match(/ (VRB|\d{3})(\d{2,3})(?:G(\d{2,3}))?(KT|MPS) /))) {
    const k = m[4] === "MPS" ? 1.944 : 1;
    d.wind = { dir: m[1] === "VRB" ? null : +m[1], spd: Math.round(+m[2] * k), gust: m[3] ? Math.round(+m[3] * k) : null, vrb: m[1] === "VRB" };
  }
  if ((m = s.match(/ (\d{4}|CAVOK) /))) d.visM = m[1] === "CAVOK" ? 9999 : +m[1];
  else if ((m = s.match(/ (?:(\d+) )?(\d+)(?:\/(\d+))?SM /))) d.visM = Math.round(((m[1] ? +m[1] : 0) + (m[3] ? +m[2] / +m[3] : +m[2])) * 1609);
  if (/ P6SM /.test(s)) d.visM = 9999;
  const layers = [...s.matchAll(/ (FEW|SCT|BKN|OVC|VV)(\d{3})/g)].map(x => ({ cover: x[1], ft: +x[2] * 100 }));
  d.layers = layers;
  const ceil = layers.find(l => l.cover === "BKN" || l.cover === "OVC" || l.cover === "VV");
  d.ceiling = ceil ? ceil.ft : null;
  if ((m = s.match(/ (M?\d{2})\/(M?\d{2})? /))) {
    const c = v => (v ? (v[0] === "M" ? -v.slice(1) : +v) : null);
    d.temp = c(m[1]); d.dew = c(m[2]);
  }
  if ((m = s.match(/ Q(\d{4}) /))) d.qnh = +m[1];
  else if ((m = s.match(/ A(\d{4}) /))) d.qnh = Math.round(+m[1] / 100 * 33.8639);
  if (/ CAVOK /.test(s)) d.cavok = true;
  const vis = d.visM ?? 9999, c = d.ceiling ?? 99999;
  d.cat = c < 500 || vis < 1600 ? "LIFR" : c < 1000 || vis < 5000 ? "IFR" : c <= 3000 || vis <= 8000 ? "MVFR" : "VFR";
  d.wx = (s.match(/ ([+-]|VC)?(TS|SH|FZ|BL|DR|MI|BC|PR)?(RA|DZ|SN|SG|GR|GS|PL|IC|UP|FG|BR|HZ|FU|SA|DU|VA|SQ|FC|SS|DS)+ /g) || []).map(x => x.trim());
  return d;
}

export const CAT_COLOR = { VFR: "#2fbf4a", MVFR: "#2f7cf6", IFR: "#e5383b", LIFR: "#c03cd1" };
