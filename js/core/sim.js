// Live aircraft position. Receives data from the PC bridge (serve.py + sim_bridge.py:
// MSFS SimConnect / X-Plane 12) over Server-Sent Events, or runs a demo flight along
// the loaded route when no simulator is available.
import { emit, listen } from "./ui.js";
import { settings, setSetting } from "./store.js";
import { getFlight } from "./flight.js";
import { getAirport, runwayEnds } from "./airports.js";
import { distNM, bearing, destination } from "./geo.js";

let st = { connected: false, status: "Not connected" };
let es = null, pollT = null, demoT = null;
export const simState = () => st;
export const onSim = fn => listen("sim", fn);

function push(s) {
  st = s;
  emit("sim", s);
}

export function startSim() {
  stopSim();
  if (settings().simDemo) return startDemo();
  if (!window.EventSource) return poll();
  es = new EventSource("sim/stream");
  es.onmessage = e => { try { push(JSON.parse(e.data)); } catch { /* ignore */ } };
  es.onerror = () => {
    es?.close(); es = null;
    // No bridge (static hosting) or server restarting: fall back to slow polling.
    push({ connected: false, status: "No simulator bridge – start the EFB with Start EFB.bat on the sim PC", bridge: false });
    pollT = setTimeout(poll, 5000);
  };
}
async function poll() {
  try {
    const r = await fetch("sim/state", { cache: "no-store" });
    if (!r.ok) throw new Error();
    push({ ...(await r.json()), bridge: true });
    pollT = setTimeout(() => (window.EventSource ? startSim() : poll()), 1000);
  } catch {
    push({ connected: false, status: "No simulator bridge – start the EFB with Start EFB.bat on the sim PC", bridge: false });
    pollT = setTimeout(poll, 10000);
  }
}
export function stopSim() {
  es?.close(); es = null;
  clearTimeout(pollT); clearInterval(demoT);
}
export function setDemo(on) {
  setSetting("simDemo", !!on);
  startSim();
}

// ---- demo flight: taxi, take off and fly the loaded route (time-compressed) ----
async function startDemo() {
  const f = getFlight();
  if (!f?.orig) { push({ connected: false, status: "Demo needs a loaded flight", demo: true }); return; }
  const ap = await getAirport(f.orig.icao);
  const ends = ap ? runwayEnds(ap).filter(e => e.hasCoords) : [];
  const rwy = ends.find(e => e.id === f.orig.rwy) || ends[0];
  const path = [];
  if (rwy) {
    const far = ends.find(e => e.rwy === rwy.rwy && e.id !== rwy.id);
    const start = destination(rwy.lat, rwy.lon, (rwy.hdg + 180) % 360, 0.25);
    path.push({ lat: start[0], lon: start[1], alt: ap.elev, gs: 15 }, { lat: rwy.lat, lon: rwy.lon, alt: ap.elev, gs: 15 });
    if (far) path.push({ lat: far.lat, lon: far.lon, alt: ap.elev, gs: 160 });
  } else path.push({ lat: f.orig.lat, lon: f.orig.lon, alt: f.orig.elev || 0, gs: 15 });
  for (const n of f.navlog || []) if (n.lat != null) path.push({ lat: n.lat, lon: n.lon, alt: n.alt ?? f.cruiseAlt ?? 35000, gs: n.stage === "CRZ" ? 460 : 300 });
  const groundUntil = rwy ? 3 : 1;
  let i = 0, frac = 0, prev = null;
  const tick = 0.25, speedup = 30;
  demoT = setInterval(() => {
    const a = path[i], b = path[i + 1];
    if (!b) { clearInterval(demoT); push({ ...st, gs: 0, status: "Demo finished" }); return; }
    const leg = distNM(a.lat, a.lon, b.lat, b.lon) || 0.001;
    const ground = i + 1 < groundUntil;
    const gs = ground ? (i === 0 ? 15 : 60 + frac * 100) : b.gs;
    frac += (gs * tick * (ground ? 4 : speedup)) / 3600 / leg;
    if (frac >= 1) { i++; frac = 0; return; }
    const brg = bearing(a.lat, a.lon, b.lat, b.lon);
    const [lat, lon] = destination(a.lat, a.lon, brg, leg * frac);
    const alt = ground ? a.alt : a.alt + (b.alt - a.alt) * frac;
    const vs = prev ? ((alt - prev.alt) / (tick * speedup)) * 60 : 0;
    prev = { alt };
    push({ connected: true, demo: true, source: "Demo", status: "Demo flight (no simulator)", lat, lon, alt, agl: ground ? 0 : alt - (f.orig.elev || 0), hdg: brg, trk: brg, gs, ias: ground ? gs : Math.min(gs, 290), vs: ground ? 0 : vs, onGround: ground, callsign: f.callsign, ts: Date.now() / 1000 });
  }, tick * 1000);
}
