// The active flight shared by every app. Comes from a SimBrief OFP, or is
// entered by hand (great-circle route built from the airport database).
import { kv, settings } from "./store.js";
import { emit } from "./ui.js";
import { getAirport } from "./airports.js";
import { greatCircle, distNM } from "./geo.js";

let current = kv.get("flight");

export const getFlight = () => current;
export function setFlight(f) {
  current = f;
  if (f) kv.set("flight", f); else kv.del("flight");
  emit("flight", f);
}

const n = v => (v === "" || v == null || isNaN(+v) ? null : +v);
const t = v => (v ? Date.parse(v) : null);
const hms = s => {
  if (!s) return null;
  const [h, m, sec] = String(s).split(":").map(Number);
  return h * 3600 + m * 60 + (sec || 0);
};
const arr = v => (v == null ? [] : Array.isArray(v) ? v : [v]);

function apt(a, w) {
  if (!a) return null;
  return {
    icao: a.icao_code, iata: a.iata_code, name: a.name, rwy: a.plan_rwy,
    lat: n(a.pos_lat), lon: n(a.pos_long), elev: n(a.elevation), tz: n(a.timezone),
    transAlt: n(a.trans_alt), transLevel: n(a.trans_level),
    metar: (w?.metar || a.metar || "").replace(/\s*\n\s*/g, " "), taf: w?.taf || a.taf || "",
    metarCategory: a.metar_category,
  };
}

/** Normalise a SimBrief JSON (v2) OFP. */
export function fromSimbrief(o) {
  const g = o.general || {}, wx = o.weather || {};
  const altns = arr(o.alternate).map(a => apt(a, { metar: a.metar, taf: a.taf }));
  return {
    source: "simbrief",
    id: o.params?.request_id,
    generated: o.params?.time_generated,
    airac: o.params?.airac,
    units: (o.params?.units || "kgs").startsWith("lb") ? "lb" : "kg",
    callsign: o.atc?.callsign || `${g.icao_airline || ""}${g.flight_number || ""}`,
    airline: g.icao_airline, fltnum: g.flight_number,
    aircraft: { icao: o.aircraft?.icaocode, name: o.aircraft?.name, reg: o.aircraft?.reg, engines: o.aircraft?.engines },
    orig: apt(o.origin, { metar: wx.orig_metar, taf: wx.orig_taf }),
    dest: apt(o.destination, { metar: wx.dest_metar, taf: wx.dest_taf }),
    altn: altns[0] || null, altns,
    enrouteAlts: arr(o.enroute_altn).map(a => a.icao_code).filter(Boolean),
    route: g.route, routeIfps: g.route_ifps, atcRoute: o.atc?.route,
    sid: g.sid_ident, star: g.star_ident,
    cruiseAlt: n(g.initial_altitude), ci: g.costindex, cruise: g.cruise_profile,
    stepclimbs: g.stepclimb_string,
    distance: n(g.route_distance), airDistance: n(g.air_distance),
    avgWind: { dir: n(g.avg_wind_dir), spd: n(g.avg_wind_spd), comp: n(g.avg_wind_comp) },
    pax: n(g.passengers),
    times: {
      out: t(o.times?.sched_out), off: t(o.times?.est_off), on: t(o.times?.est_on), in: t(o.times?.est_in),
      ete: hms(o.times?.est_time_enroute), block: hms(o.times?.est_block), endurance: hms(o.times?.endurance),
    },
    fuel: Object.fromEntries(Object.entries(o.fuel || {}).map(([k, v]) => [k, n(v)])),
    weights: Object.fromEntries(Object.entries(o.weights || {}).map(([k, v]) => [k, n(v)])),
    navlog: arr(o.navlog?.fix ?? o.navlog).map(f => ({
      ident: f.ident, name: f.name, type: f.type, lat: n(f.pos_lat), lon: n(f.pos_long),
      alt: n(f.altitude_feet), via: f.via_airway, stage: f.stage, sidstar: f.is_sid_star === "1",
      freq: f.frequency, dist: n(f.distance), trk: n(f.track_mag), timeTotal: hms(f.time_total),
      fuelOnboard: n(f.fuel_plan_onboard), minFuel: n(f.fuel_min_onboard), wind: f.wind_dir && `${f.wind_dir}/${f.wind_spd}`, oat: n(f.oat),
      gs: n(f.groundspeed), fir: f.fir, mora: n(f.mora),
    })),
    firs: [o.atc?.fir_orig, ...arr(o.atc?.fir_enroute), o.atc?.fir_dest].filter(Boolean),
    fpl: o.atc?.flightplan_text,
    planHtml: o.text?.plan_html,
    pdf: o.files?.pdf?.link ? o.files.directory + o.files.pdf.link : null,
    maps: arr(o.images?.map).map(m => ({ name: m.name, url: o.images.directory + m.link })),
    tlr: o.tlr || null,
    crew: o.crew || null,
  };
}

export async function fetchSimbrief(username = settings().simbriefUser) {
  if (!username) throw new Error("Set your SimBrief username in Settings first.");
  const isId = /^\d+$/.test(username.trim());
  const url = `https://www.simbrief.com/api/xml.fetcher.php?${isId ? "userid" : "username"}=${encodeURIComponent(username.trim())}&json=v2`;
  const r = await fetch(url);
  const j = await r.json().catch(() => null);
  if (!j || j.fetch?.status !== "Success") throw new Error(j?.fetch?.status || `SimBrief request failed (${r.status})`);
  const f = fromSimbrief(j);
  setFlight(f);
  return f;
}

/** Build a flight by hand (no SimBrief). Route is a great circle between the airports. */
export async function manualFlight({ callsign, orig, dest, altn, type = "B738", reg = "", cruiseAlt = 35000 }) {
  const [o, d, a] = await Promise.all([getAirport(orig), getAirport(dest), altn ? getAirport(altn) : null]);
  if (!o) throw new Error(`Unknown airport ${orig}`);
  if (!d) throw new Error(`Unknown airport ${dest}`);
  const mk = x => x && ({ icao: x.icao, iata: x.iata, name: x.name, rwy: "", lat: x.lat, lon: x.lon, elev: x.elev, metar: "", taf: "" });
  const dist = distNM(o.lat, o.lon, d.lat, d.lon);
  const pts = greatCircle(o.lat, o.lon, d.lat, d.lon, Math.max(2, Math.round(dist / 150)));
  const gs = 450;
  const navlog = pts.slice(1, -1).map(([lat, lon], i) => {
    const along = distNM(o.lat, o.lon, lat, lon);
    return { ident: `GC${String(i + 1).padStart(2, "0")}`, name: "Great-circle point", type: "ltlg", lat, lon, alt: cruiseAlt, via: "DCT", stage: "CRZ", dist: along, timeTotal: (along / gs) * 3600 };
  });
  navlog.push({ ident: d.icao, name: d.name, type: "apt", lat: d.lat, lon: d.lon, alt: d.elev, via: "DCT", stage: "DSC", dist, timeTotal: (dist / gs) * 3600 });
  const now = Date.now();
  const f = {
    source: "manual", callsign: callsign || "", aircraft: { icao: type, name: type, reg },
    orig: mk(o), dest: mk(d), altn: mk(a), altns: a ? [mk(a)] : [], enrouteAlts: [],
    route: "DCT", cruiseAlt, distance: Math.round(dist), units: settings().units,
    times: { out: now, off: now + 15 * 60e3, on: now + 15 * 60e3 + (dist / gs) * 3600e3, ete: (dist / gs) * 3600 },
    fuel: {}, weights: {}, navlog, firs: [], maps: [],
  };
  setFlight(f);
  return f;
}

export function dispatchUrl(p) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== "" && v != null) q.set(k, v);
  return `https://dispatch.simbrief.com/options/custom?${q}`;
}
