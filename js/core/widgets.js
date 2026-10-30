// Home-screen widgets in the iPadOS layout: two small + one medium on the left,
// two large to the right, all on the same grid as the app icons.
import { $, esc, pad, secToHM, fmtNum } from "./ui.js";
import { settings } from "./store.js";
import { getFlight } from "./flight.js";
import { simState } from "./sim.js";
import { metar, decodeMetar, CAT_COLOR } from "./wx.js";
import { greatCircle } from "./geo.js";

export const widgetsHTML = () => `
  <div class="wg wg-s wg-clock" data-app="clock" style="grid-area:1/1/2/2"></div>
  <div class="wg wg-s wg-sim" data-open-sim style="grid-area:1/2/2/3"></div>
  <div class="wg wg-m wg-wx" data-app="weather" style="grid-area:2/1/3/3"></div>
  <div class="wg wg-l wg-route" data-app="enroute" style="grid-area:1/3/3/5"></div>
  <div class="wg wg-l wg-cal" data-app="briefing" style="grid-area:1/5/3/7"></div>`;

const z = ms => (ms ? `${pad(new Date(ms).getUTCHours())}${pad(new Date(ms).getUTCMinutes())}` : "----");

export const tickClock = () => clock();

export function updateWidgets() {
  clock(); sim(); weather(); route(); timeline();
}

// ---- small: analog UTC clock (like the Clock widget) ----------------------
function clock() {
  const el = $(".wg-clock");
  if (!el) return;
  if (!el.firstChild) {
    el.innerHTML = `<div class="face">${Array.from({ length: 12 }, (_, i) => `<i style="transform:rotate(${i * 30}deg)"><b style="transform:translateX(-50%) rotate(${-i * 30}deg)">${i === 0 ? 12 : i}</b></i>`).join("")}
      <span class="city">UTC</span><em class="h"></em><em class="m"></em><em class="s"></em><span class="dot"></span></div>`;
  }
  const d = new Date();
  const h = d.getUTCHours(), m = d.getUTCMinutes(), s = d.getUTCSeconds();
  el.querySelector(".h").style.transform = `rotate(${(h % 12) * 30 + m / 2}deg)`;
  el.querySelector(".m").style.transform = `rotate(${m * 6 + s / 10}deg)`;
  el.querySelector(".s").style.transform = `rotate(${s * 6}deg)`;
  el.querySelector(".face").classList.toggle("night", h < 6 || h >= 18);
}

// ---- small: simulator / aircraft (like Find My) ----------------------------
function sim() {
  const el = $(".wg-sim");
  if (!el) return;
  const s = simState(), f = getFlight();
  const r = v => (v == null ? "—" : Math.round(v).toLocaleString());
  el.classList.toggle("live", !!s.connected);
  el.innerHTML = `<div class="map"></div><span class="pin"><svg viewBox="0 0 24 24"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" fill="currentColor"/></svg></span>
    <div class="txt">${s.connected
      ? `<small>${esc(s.source || "Sim")} · Now</small><b>${esc(s.callsign || f?.callsign || "Aircraft")}</b><span>${s.onGround ? "On ground" : (s.alt >= 18000 ? "FL" + Math.round(s.alt / 100) : r(s.alt) + " ft")} · ${r(s.gs)} kt</span>`
      : `<small>Simulator</small><b>Not connected</b><span>${settings().simDemo ? "Demo idle" : "Tap to set up"}</span>`}</div>`;
}

// ---- medium: weather (like the Weather widget) ----------------------------
let wxBusy = false;
async function weather() {
  const el = $(".wg-wx");
  if (!el || wxBusy) return;
  const f = getFlight();
  const aps = f ? [f.orig, f.dest, ...(f.altns || [])].filter(Boolean).slice(0, 5) : [];
  if (!aps.length) {
    el.innerHTML = `<div class="top"><div><b class="loc">Weather</b><div class="temp">--°</div></div><div class="cond"><span>Load a flight to see</span><span>airport weather</span></div></div>`;
    return;
  }
  wxBusy = true;
  try {
    const rows = await Promise.all(aps.map(async a => ({ a, m: decodeMetar(await metar(a.icao)) })));
    const main = rows[0];
    const m = main.m;
    el.style.setProperty("--sky", m ? (m.cat === "VFR" ? "#3d7fd6" : m.cat === "MVFR" ? "#4a6fa8" : "#5a5f73") : "#3d7fd6");
    el.innerHTML = `<div class="top"><div><b class="loc">${esc(main.a.icao)} <small>${esc(shortCity(main.a.name))}</small></b><div class="temp">${m?.temp ?? "--"}°</div></div>
      <div class="cond">${m ? `<i style="background:${CAT_COLOR[m.cat]}">${m.cat}</i><span>${m.wind ? (m.wind.vrb ? "VRB" : pad(m.wind.dir, 3)) + "/" + m.wind.spd + "kt" : "Calm"}</span><span>Q${m.qnh ?? "—"}${m.ceiling != null ? " · " + fmtNum(m.ceiling) + "ft" : ""}</span>` : `<span>No METAR</span>`}</div></div>
      <div class="row">${rows.map(({ a, m: x }) => `<div><span>${esc(a.icao)}</span><i style="background:${x ? CAT_COLOR[x.cat] : "#888"}"></i><b>${x?.temp ?? "--"}°</b></div>`).join("")}</div>`;
  } finally { wxBusy = false; }
}
const shortCity = n => (n || "").split(/[\s/-]+/).slice(0, 2).join(" ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

// ---- large: route "photo" ---------------------------------------------------
function route() {
  const el = $(".wg-route");
  if (!el) return;
  const f = getFlight();
  if (!f?.orig || !f?.dest) {
    el.innerHTML = `<div class="cap"><small>ENROUTE</small><b>No route loaded</b></div>`;
    return;
  }
  const pts = [[f.orig.lat, f.orig.lon], ...(f.navlog || []).filter(n => n.lat != null).map(n => [n.lat, n.lon])];
  if (pts.length < 3) pts.push(...greatCircle(f.orig.lat, f.orig.lon, f.dest.lat, f.dest.lon, 24).slice(1));
  let lon0 = pts[0][1];
  const P = pts.map(([la, lo]) => { while (lo - lon0 > 180) lo -= 360; while (lo - lon0 < -180) lo += 360; lon0 = lo; return [la, lo]; });
  const lats = P.map(p => p[0]), lons = P.map(p => p[1]);
  const cx = (Math.min(...lons) + Math.max(...lons)) / 2, cy = (Math.min(...lats) + Math.max(...lats)) / 2;
  const k = Math.cos((cy * Math.PI) / 180);
  const span = Math.max((Math.max(...lons) - Math.min(...lons)) * k, Math.max(...lats) - Math.min(...lats), 1);
  const S = 220 / span;
  const xy = ([la, lo]) => [160 + (lo - cx) * k * S, 140 - (la - cy) * S];
  const path = P.map(xy).map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  const [a, b] = [xy(P[0]), xy(P[P.length - 1])];
  const s = simState();
  let own = "";
  if (s.connected && s.lat != null) {
    let lo = s.lon; while (lo - cx > 180) lo -= 360; while (lo - cx < -180) lo += 360;
    const [x, y] = xy([s.lat, lo]);
    if (x > -20 && x < 340 && y > -20 && y < 300) own = `<g transform="translate(${x} ${y}) rotate(${s.trk ?? s.hdg ?? 0})"><path d="M0 -9 L6 6 L0 3 L-6 6Z" fill="#fff"/></g>`;
  }
  el.innerHTML = `<svg viewBox="0 0 320 320" preserveAspectRatio="xMidYMid slice">
      <defs><radialGradient id="wg-sky" cx="30%" cy="20%" r="90%"><stop offset="0" stop-color="#2d5fb0"/><stop offset=".55" stop-color="#14254f"/><stop offset="1" stop-color="#070b1a"/></radialGradient>
      <pattern id="wg-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="rgba(255,255,255,.06)"/></pattern></defs>
      <rect width="320" height="320" fill="url(#wg-sky)"/><rect width="320" height="320" fill="url(#wg-grid)"/>
      <path d="${path}" fill="none" stroke="rgba(255,75,216,.35)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${path}" fill="none" stroke="#ff6be0" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${a[0]}" cy="${a[1]}" r="5" fill="#fff"/><circle cx="${b[0]}" cy="${b[1]}" r="5" fill="#fff"/>
      <text x="${a[0]}" y="${a[1] - 11}" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">${esc(f.orig.icao)}</text>
      <text x="${b[0]}" y="${b[1] - 11}" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">${esc(f.dest.icao)}</text>${own}</svg>
    <div class="cap"><small>${esc(f.callsign || "FLIGHT")}${f.aircraft?.icao ? " · " + esc(f.aircraft.icao) : ""}</small><b>${esc(f.orig.icao)} → ${esc(f.dest.icao)}</b><span>${fmtNum(f.distance)} NM${f.cruiseAlt ? " · FL" + Math.round(f.cruiseAlt / 100) : ""}${f.times?.ete ? " · " + secToHM(f.times.ete) : ""}</span></div>`;
}

// ---- large: flight timeline (like the Calendar widget) ----------------------
function timeline() {
  const el = $(".wg-cal");
  if (!el) return;
  const f = getFlight(), now = new Date();
  const day = (f?.times?.out ? new Date(f.times.out) : now);
  const head = `<div class="hd"><small>${day.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" }).toUpperCase()}</small><b>${day.getUTCDate()}</b></div>`;
  if (!f) {
    el.innerHTML = `<div class="col">${head}<p class="none">No flight planned</p></div>
      <div class="col"><small class="up">UTC ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}</small><button class="ios-btn small" data-fetch>${settings().simbriefUser ? "Import OFP" : "Plan a Flight"}</button></div>`;
    return;
  }
  const t = f.times || {};
  const ev = [
    ["#34c759", "Block out", t.out, f.orig.icao],
    ["#0a84ff", "Takeoff", t.off, f.orig.rwy ? "RWY " + f.orig.rwy : f.orig.icao],
    ["#ff9f0a", "Landing", t.on, f.dest.rwy ? "RWY " + f.dest.rwy : f.dest.icao],
    ["#af52de", "Block in", t.in, f.dest.icao],
  ];
  const next = ev.find(e => e[2] && e[2] > now.getTime());
  el.innerHTML = `<div class="col">${head}${ev.slice(0, 2).map(evHTML).join("")}</div>
    <div class="col"><small class="up">${next ? `NEXT · ${esc(next[1].toUpperCase())}` : "UTC NOW"}</small><div class="now">${next ? z(next[2]) + "Z" : `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}Z`}</div>${ev.slice(2).map(evHTML).join("")}
    <div class="ev gray"><b>${esc(f.callsign || "Flight")}</b><span>ETE ${secToHM(t.ete)}</span></div></div>`;
}
const evHTML = ([c, l, t, sub]) => `<div class="ev" style="--c:${c}"><b>${l}</b><span>${z(t)}Z · ${esc(sub || "")}</span></div>`;
