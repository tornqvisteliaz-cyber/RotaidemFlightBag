// ChartFox (free flight-sim charts) through its API (api.chartfox.org/v2, Bearer token).
// The API sends CORS headers, so the browser calls it directly; the token is the user's own
// (ChartFox account › developer access) and is only ever sent to api.chartfox.org.
import { settings } from "./store.js";

const API = "https://api.chartfox.org/v2";
export const chartfoxToken = () => (settings().chartfoxToken || "").trim();

async function get(path) {
  const r = await fetch(API + path, { headers: { Accept: "application/json", Authorization: `Bearer ${chartfoxToken()}` } });
  if (r.status === 401 || r.status === 403) throw new Error("ChartFox did not accept the token – check Settings › ChartFox");
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`ChartFox error ${r.status}`);
  return r.json();
}

/** EFB category (GEN / SID / STAR / APPR / TAXI) from ChartFox's type/group and the chart name. */
export function cfCategory(hint, name = "") {
  const t = `${hint ?? ""} ${name}`.toUpperCase();
  if (/\b(SID|DEP|DEPARTURE)/.test(t)) return "SID";
  if (/\b(STAR|ARR|ARRIVAL|TRANSITION)/.test(t)) return "STAR";
  if (/\b(APP|APPROACH|IAC|ILS|RNAV|RNP|VOR|NDB|LOC|GLS|VISUAL|VAC)\b/.test(t)) return "APPR";
  if (/\b(GND|GROUND|TAXI|ADC|APD|AGC|AFC|PARKING|STAND|AERODROME CHART|AIRPORT DIAGRAM|DOCKING)/.test(t)) return "TAXI";
  return "GEN";
}

// The API's response layout isn't publicly documented: accept a plain list, a Laravel
// { data: [...] } envelope, or charts grouped by type ({ data: { "SID": [...] } }).
export function parseCharts(json, icao) {
  const out = [];
  const walk = (v, group) => {
    if (Array.isArray(v)) return v.forEach(x => walk(x, group));
    if (!v || typeof v !== "object") return;
    const name = v.name ?? v.title;
    if (typeof name === "string" && (v.id != null || v.url || v.source_url)) {
      const hint = v.type_key ?? v.category ?? v.type_name ?? (typeof v.type === "string" ? v.type : null) ?? group;
      const code = v.code ?? v.ident ?? v.index ?? "";
      out.push({
        source: "chartfox", id: `cf-${v.id ?? v.uuid ?? out.length}`, icao, cat: cfCategory(hint, name),
        index: String(code || "CF"), name: name.toUpperCase(), procs: [],
        runways: [...new Set((name.toUpperCase().match(/\b(?:RWY|RUNWAY)S?\s*([0-3]?\d[LRC]?)/g) || []).map(m => m.replace(/\D*(\d+[LRC]?)$/, "$1").padStart(2, "0")))],
        cf: { id: v.id ?? v.uuid, url: v.url ?? v.source_url ?? v.download_url ?? v.view_url ?? null },
      });
      return;
    }
    // Object keys name the group ("SID": [...]), except envelope keys like "data" or numeric ids.
    for (const [k, x] of Object.entries(v)) if (x && typeof x === "object") walk(x, k === "data" || /^\d+$/.test(k) ? group : k);
  };
  walk(json, null);
  return out;
}

/** ChartFox charts for an airport ([] without a token or when ChartFox has none). */
export async function chartfoxIndex(icao) {
  if (!chartfoxToken()) return [];
  const json = await get(`/airports/${encodeURIComponent(icao)}/charts`);
  return json ? parseCharts(json, icao) : [];
}

/** URL of a chart's file (PDF or image); looks the chart up when the list did not include it. */
export async function chartfoxFileUrl(chart) {
  if (chart.cf?.url) return chart.cf.url;
  const j = await get(`/charts/${encodeURIComponent(chart.cf?.id)}`);
  const c = j?.data ?? j;
  const url = c?.url ?? c?.source_url ?? c?.download_url ?? c?.view_url;
  if (!url) throw new Error("ChartFox returned no file for this chart");
  return url;
}

/** Quick check for Settings: does the token work? */
export async function chartfoxTest() {
  const j = await get("/airports/EGLL");
  return !!j;
}
