// GA apps (Home Screen › GA folder): VFR Map, W&B and E6B. They pick up the GA
// aircraft loaded in the simulator. Simulation use only – not for real flights.
/* global L */
import { $, esc, on, toast, fmtNum } from "../core/ui.js";
import { kv } from "../core/store.js";
import { allAirports } from "../core/airports.js";
import { distNM, bearing, destination } from "../core/geo.js";
import { simState, onSim } from "../core/sim.js";
import { detectAircraft, onAircraft } from "../core/aircraft.js";
import * as M from "../core/map.js";

const n3 = v => String(Math.round(((v % 360) + 360) % 360) || 360).padStart(3, "0");

// ================================================================ VFR Map
export const vfrmap = { mount: root => new VfrMap(root) };

class VfrMap {
  constructor(root) {
    this.root = root;
    this.follow = true;
    root.innerHTML = `<div class="ga-map">
      <div class="gm-map"></div>
      <div class="gm-strip"><div><small>GS</small><b data-v="gs">—</b></div><div><small>ALT</small><b data-v="alt">—</b></div><div><small>TRK</small><b data-v="trk">—</b></div><div><small>VS</small><b data-v="vs">—</b></div><div><small>AGL</small><b data-v="agl">—</b></div></div>
      <div class="gm-near"><header>Nearest</header><div class="rows"></div></div>
      <div class="gm-btns"><button data-g="follow" class="on" title="Follow aircraft"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M20.5 3.5 L3.5 10.6 L11 12.9 L13.3 20.5Z" fill="currentColor"/></svg></button>
        <button data-g="in">+</button><button data-g="out">−</button></div>
      <div class="gm-src"></div>
    </div>`;
    this.unsub = [onSim(s => this.onSim(s))];
    requestAnimationFrame(() => this.init());
  }
  destroy() { this.unsub.forEach(u => u()); }

  async init() {
    const s = simState();
    this.map = M.createMap($(".gm-map", this.root), { center: s.connected ? [s.lat, s.lon] : [59.65, 17.92], zoom: 9, minZoom: 4, maxZoom: 16 });
    M.basemap(this.map, "fd");
    this.map.attributionControl.addAttribution("OurAirports");
    (await M.airportLayer(this.map, { color: "#7a2e8e" })).addTo(this.map);
    (await M.navaidLayer(this.map, { ndb: true })).addTo(this.map);
    this.vec = L.polyline([], { color: "#d22fc9", weight: 3, interactive: false }).addTo(this.map);
    this.ring = L.circle([0, 0], { radius: 1, color: "#1a7f37", weight: 2, dashArray: "6 5", fill: true, fillOpacity: 0.06, interactive: false });
    this.own = M.ownship(this.map, { color: "#ffffff", outline: "#d22fc9", size: 34, trailColor: "#d22fc9" });
    this.own.follow = this.follow;
    this.map.on("dragstart", () => this.setFollow(false));
    this.map.on("moveend", () => { if (!simState().connected) this.nearest(this.map.getCenter().lat, this.map.getCenter().lng); });
    on(this.root, "click", "[data-g]", (e, b) => {
      if (b.dataset.g === "in") this.map.zoomIn(1);
      if (b.dataset.g === "out") this.map.zoomOut(1);
      if (b.dataset.g === "follow") this.setFollow(!this.follow);
    });
    on(this.root, "click", "[data-apt]", (e, b) => { this.setFollow(false); this.map.setView([+b.dataset.lat, +b.dataset.lon], 13); });
    this.onSim(s);
    if (!s.connected) this.nearest(this.map.getCenter().lat, this.map.getCenter().lng);
  }
  setFollow(v) {
    this.follow = v; if (this.own) this.own.follow = v;
    $('[data-g="follow"]', this.root).classList.toggle("on", v);
    const s = simState();
    if (v && s.connected && this.map) this.map.setView([s.lat, s.lon], this.map.getZoom());
  }
  onSim(s) {
    if (!this.map) return;
    this.own.update(s);
    const set = (k, v) => { const el = $(`[data-v="${k}"]`, this.root); if (el) el.textContent = v; };
    const ac = detectAircraft(s);
    $(".gm-src", this.root).textContent = s.connected ? `${s.source} · ${ac?.name || s.title || ""}` : "No simulator – showing map centre";
    if (!s.connected) { this.vec.setLatLngs([]); this.ring.remove(); return; }
    const r = v => (v == null ? "—" : Math.round(v));
    set("gs", r(s.gs)); set("alt", s.alt == null ? "—" : fmtNum(Math.round(s.alt / 10) * 10)); set("trk", n3(s.trk ?? s.hdg ?? 0) + "°");
    set("vs", s.onGround ? "GND" : (s.vs > 0 ? "+" : "") + fmtNum(Math.round((s.vs || 0) / 10) * 10)); set("agl", s.agl == null ? "—" : fmtNum(Math.round(s.agl)));
    // Track vector: where you will be in 2 minutes at the current ground speed.
    const trk = s.trk ?? s.hdg ?? 0;
    this.vec.setLatLngs(s.gs > 30 ? [[s.lat, s.lon], destination(s.lat, s.lon, trk, (s.gs * 2) / 60)] : []);
    // Glide range ring: engine-out still-air range from height above ground (light single ~9:1).
    const glide = ac?.ga && !["BE20", "TBM9", "C208", "PC12"].includes(ac.ga) ? 9 : 12;
    if (!s.onGround && s.agl > 200) { this.ring.setLatLng([s.lat, s.lon]).setRadius(s.agl * glide * 0.3048); if (!this.map.hasLayer(this.ring)) this.ring.addTo(this.map); }
    else this.ring.remove();
    if (Date.now() - (this.nearAt || 0) > 5000) { this.nearAt = Date.now(); this.nearest(s.lat, s.lon); }
  }
  async nearest(lat, lon) {
    const all = await allAirports();
    const near = [];
    for (const a of all) {
      if (Math.abs(a[5] - lat) > 1.5) continue;
      const d = distNM(lat, lon, a[5], a[6]);
      if (d < 120) near.push([d, a]);
    }
    near.sort((x, y) => x[0] - y[0]);
    $(".gm-near .rows", this.root).innerHTML = near.slice(0, 8).map(([d, a]) => {
      const longest = Math.max(0, ...(a[9] || []).map(r => r[2] || 0));
      return `<button data-apt data-lat="${a[5]}" data-lon="${a[6]}"><b>${esc(a[0])}</b><span class="nm">${esc(a[2])}</span>
        <em>${n3(bearing(lat, lon, a[5], a[6]))}° ${d.toFixed(1)} NM</em><small>${longest ? fmtNum(longest) + " FT" : ""}</small></button>`;
    }).join("") || `<div class="none">No airports within 120 NM</div>`;
  }
}

// ================================================================ W&B
// Typical POH loading data (lb, in aft of datum) – check your aircraft's own figures.
const WB = {
  C172: { name: "Cessna 172S", empty: [1680, 39.6], mtow: 2550, fuelMax: 53, gph: 9,
    st: [["front", "Pilot & front pax", 37], ["rear", "Rear passengers", 73], ["bagA", "Baggage A (max 120)", 95, 120], ["bagB", "Baggage B (max 50)", 123, 50]], fuelArm: 48,
    env: [[35.0, 1500], [35.0, 1950], [41.0, 2550], [47.3, 2550], [47.3, 1500]] },
  PA28: { name: "Piper PA-28-181", empty: [1550, 86.5], mtow: 2550, fuelMax: 48, gph: 9.5,
    st: [["front", "Pilot & front pax", 80.5], ["rear", "Rear passengers", 118.1], ["bagA", "Baggage (max 200)", 142.8, 200]], fuelArm: 95,
    env: [[82.0, 1400], [82.0, 2050], [88.6, 2550], [93.0, 2550], [93.0, 1400]] },
  SR22: { name: "Cirrus SR22", empty: [2300, 140.5], mtow: 3400, fuelMax: 81, gph: 15,
    st: [["front", "Pilot & front pax", 143.5], ["rear", "Rear passengers", 180], ["bagA", "Baggage (max 130)", 208, 130]], fuelArm: 154.9,
    env: [[137.8, 2100], [138.7, 2700], [142.3, 3400], [148.1, 3400], [148.1, 2100]] },
};
const inPoly = (x, y, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
/** Loading → { ramp, to, ldg } points ({ w, cg, ok }). Exported for the self-check. */
export function wbCalc(p, v) {
  const items = [[+v.emptyW || p.empty[0], +v.emptyArm || p.empty[1]], ...p.st.map(([k, , arm]) => [+v[k] || 0, arm])];
  const pt = fuelGal => {
    const all = [...items, [fuelGal * 6, p.fuelArm]];
    const w = all.reduce((a, [x]) => a + x, 0), mom = all.reduce((a, [x, arm]) => a + x * arm, 0);
    const cg = mom / w;
    return { w: Math.round(w), cg: +cg.toFixed(2), ok: w <= p.mtow && inPoly(cg, w, p.env) };
  };
  const fuel = Math.min(+v.fuel || 0, p.fuelMax);
  return { ramp: pt(fuel), to: pt(Math.max(0, fuel - (+v.taxi || 0))), ldg: pt(Math.max(0, fuel - (+v.taxi || 0) - (+v.trip || 0))) };
}

export const wb = { mount: root => new WeightBalance(root) };

class WeightBalance {
  constructor(root) {
    this.root = root;
    this.type = kv.get("ga.wb.type", "C172");
    this.vals = kv.get("ga.wb.vals", {});
    this.unsub = [onAircraft(a => { if (a?.ga && WB[a.ga] && a.ga !== this.type) { this.type = a.ga; toast(`${WB[a.ga].name} detected in ${a.source}`); this.render(); } })];
    on(root, "click", "[data-t]", (e, b) => { this.type = b.dataset.t; kv.set("ga.wb.type", this.type); this.render(); });
    on(root, "input", "input[data-k]", (e, el) => { (this.vals[this.type] ||= {})[el.dataset.k] = el.value; kv.set("ga.wb.vals", this.vals); this.result(); });
    this.render();
  }
  destroy() { this.unsub.forEach(u => u()); }
  render() {
    const p = WB[this.type], v = (this.vals[this.type] ||= {});
    const inp = (k, ph, unit) => `<label class="gi"><input data-k="${k}" value="${esc(v[k] ?? "")}" placeholder="${esc(ph)}" inputmode="decimal"><em>${unit}</em></label>`;
    this.root.innerHTML = `<div class="ga-app"><header class="ga-h"><b>Weight &amp; Balance</b><div class="seg">${Object.entries(WB).map(([k, x]) => `<button data-t="${k}" class="${k === this.type ? "on" : ""}">${x.name}</button>`).join("")}</div></header>
      <div class="ga-body"><div class="ga-form">
        <h4>Aircraft</h4>
        <div class="r"><span>Empty weight</span>${inp("emptyW", p.empty[0], "lb")}</div>
        <div class="r"><span>Empty CG arm</span>${inp("emptyArm", p.empty[1], "in")}</div>
        <h4>Load</h4>
        ${p.st.map(([k, l]) => `<div class="r"><span>${l}</span>${inp(k, "0", "lb")}</div>`).join("")}
        <h4>Fuel (6 lb/gal)</h4>
        <div class="r"><span>Fuel on board (max ${p.fuelMax})</span>${inp("fuel", p.fuelMax, "gal")}</div>
        <div class="r"><span>Taxi &amp; run-up</span>${inp("taxi", "1.4", "gal")}</div>
        <div class="r"><span>Trip fuel</span>${inp("trip", "0", "gal")}</div>
      </div><div class="ga-out"></div></div>
      <p class="ga-disc">Typical POH figures for simulation – enter your aircraft's empty weight and arm. Not for real flights.</p></div>`;
    this.result();
  }
  result() {
    const p = WB[this.type], v = this.vals[this.type] || {};
    const r = wbCalc(p, { fuel: p.fuelMax, taxi: 1.4, ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== "")) });
    const xs = p.env.map(e => e[0]), ys = p.env.map(e => e[1]);
    const x0 = Math.min(...xs) - 2, x1 = Math.max(...xs) + 2, y0 = Math.min(...ys) - 150, y1 = p.mtow + 150;
    const W = 420, H = 300, X = x => 50 + ((x - x0) / (x1 - x0)) * (W - 70), Y = y => H - 34 - ((y - y0) / (y1 - y0)) * (H - 50);
    // [label, point, colour, label dx, label dy] – labels fanned out so they stay readable when points coincide.
    const pts = [["RAMP", r.ramp, "#8e8e93", -44, -8], ["TO", r.to, "#0a84ff", 9, -8], ["LDG", r.ldg, "#34c759", 9, 16]];
    const ticksX = Array.from({ length: Math.floor(x1 - x0) + 1 }, (_, i) => Math.ceil(x0) + i).filter(x => x % 2 === 0);
    const ticksY = Array.from({ length: 12 }, (_, i) => Math.ceil(y0 / 200) * 200 + i * 200).filter(y => y <= y1);
    const ok = r.to.ok && r.ldg.ok;
    $(".ga-out", this.root).innerHTML = `
      <div class="ga-stat ${ok ? "ok" : "bad"}">${ok ? "WITHIN LIMITS" : r.to.w > p.mtow ? `OVER MAX TAKE-OFF WEIGHT (${fmtNum(p.mtow)} LB)` : "CG OUTSIDE ENVELOPE"}</div>
      <table class="ga-t"><tr><th></th><th>Weight</th><th>CG</th></tr>${pts.map(([l, x]) => `<tr class="${x.ok ? "" : "bad"}"><td>${l}</td><td>${fmtNum(x.w)} lb</td><td>${x.cg} in</td></tr>`).join("")}</table>
      <svg viewBox="0 0 ${W} ${H}" class="ga-env">
        ${ticksX.map(x => `<line x1="${X(x)}" x2="${X(x)}" y1="16" y2="${H - 34}" class="g"/><text x="${X(x)}" y="${H - 18}" text-anchor="middle">${x}</text>`).join("")}
        ${ticksY.map(y => `<line x1="50" x2="${W - 20}" y1="${Y(y)}" y2="${Y(y)}" class="g"/><text x="44" y="${Y(y) + 4}" text-anchor="end">${y}</text>`).join("")}
        <polygon points="${p.env.map(([x, y]) => `${X(x)},${Y(y)}`).join(" ")}" class="env"/>
        <line x1="${X(r.ramp.cg)}" y1="${Y(r.ramp.w)}" x2="${X(r.ldg.cg)}" y2="${Y(r.ldg.w)}" class="ln"/>
        ${pts.map(([l, x, c, dx, dy]) => `<circle cx="${X(x.cg)}" cy="${Y(x.w)}" r="6" fill="${c}" stroke="#fff" stroke-width="2"/><text x="${X(x.cg) + dx}" y="${Y(x.w) + dy}" class="pl">${l}</text>`).join("")}
        <text x="${W / 2 + 15}" y="${H - 2}" text-anchor="middle">CG (in aft of datum)</text>
      </svg>`;
  }
}

// ================================================================ E6B
export const e6b = { mount: root => new E6B(root) };

/** Wind triangle. Directions in degrees true, speeds in knots. */
export function windTriangle(tc, tas, wd, ws) {
  const rad = Math.PI / 180, a = (wd - tc) * rad;
  const x = (ws * Math.sin(a)) / tas;
  if (Math.abs(x) >= 1) return null; // wind stronger than the aircraft
  const wca = Math.asin(x) / rad;
  return { wca, hdg: (tc + wca + 360) % 360, gs: tas * Math.cos(wca * rad) - ws * Math.cos(a), head: ws * Math.cos(a), cross: ws * Math.sin(a) };
}
/** Pressure altitude, density altitude and TAS from CAS. */
export function airData(ind, qnh, oat, cas) {
  const pa = ind + (1013.25 - qnh) * 27;
  const isa = 15 - (2 * pa) / 1000;
  const da = pa + 120 * (oat - isa);
  const sigma = Math.pow(1 - 6.8756e-6 * pa, 5.2559) / ((oat + 273.15) / 288.15);
  return { pa, da, tas: cas / Math.sqrt(sigma), isa };
}

class E6B {
  constructor(root) {
    this.root = root;
    this.v = kv.get("ga.e6b", { tc: 90, tas: 110, wd: 270, ws: 15, ind: 4500, qnh: 1013, oat: 10, cas: 105, dist: 60, gs: 100, gph: 9 });
    root.innerHTML = `<div class="ga-app"><header class="ga-h"><b>E6B Flight Computer</b><button class="ga-sim" data-sim>Use sim data</button></header>
      <div class="e6-grid">
        ${this.card("Wind triangle", [["tc", "True course", "°"], ["tas", "True airspeed", "kt"], ["wd", "Wind from", "°"], ["ws", "Wind speed", "kt"]], "wind")}
        ${this.card("Altitude & airspeed", [["ind", "Indicated altitude", "ft"], ["qnh", "QNH", "hPa"], ["oat", "OAT", "°C"], ["cas", "Calibrated airspeed", "kt"]], "air")}
        ${this.card("Time, speed & fuel", [["dist", "Distance", "NM"], ["gs", "Ground speed", "kt"], ["gph", "Fuel flow", "gal/h"]], "tsd")}
      </div></div>`;
    on(root, "input", "input[data-k]", (e, el) => { this.v[el.dataset.k] = el.value; kv.set("ga.e6b", this.v); this.calc(); });
    on(root, "click", "[data-sim]", () => {
      const s = simState();
      if (!s.connected) return toast(s.status || "No simulator connected");
      Object.assign(this.v, { ind: Math.round(s.alt), cas: Math.round(s.ias || this.v.cas), tc: Math.round(s.trk ?? s.hdg), gs: Math.round(s.gs) });
      for (const [k, x] of Object.entries(this.v)) { const el = $(`input[data-k="${k}"]`, root); if (el) el.value = x; }
      kv.set("ga.e6b", this.v); this.calc(); toast("Filled from the simulator");
    });
    this.calc();
  }
  card(t, fields, out) {
    return `<section class="e6"><h4>${t}</h4>${fields.map(([k, l, u]) => `<div class="r"><span>${l}</span><label class="gi"><input data-k="${k}" value="${esc(this.v[k])}" inputmode="decimal"><em>${u}</em></label></div>`).join("")}<div class="e6-out" data-out="${out}"></div></section>`;
  }
  calc() {
    const v = Object.fromEntries(Object.entries(this.v).map(([k, x]) => [k, +x]));
    const box = k => $(`[data-out="${k}"]`, this.root);
    const kvs = rows => rows.map(([l, x]) => `<div><small>${l}</small><b>${x}</b></div>`).join("");
    const w = windTriangle(v.tc, v.tas, v.wd, v.ws);
    box("wind").innerHTML = w ? kvs([["Heading", n3(w.hdg) + "°"], ["Ground speed", Math.round(w.gs) + " kt"], ["Wind correction", (w.wca >= 0 ? "R " : "L ") + Math.abs(w.wca).toFixed(0) + "°"], [w.head >= 0 ? "Headwind" : "Tailwind", Math.abs(Math.round(w.head)) + " kt"], ["Crosswind", Math.abs(Math.round(w.cross)) + " kt " + (w.cross >= 0 ? "from R" : "from L")]]) : `<p class="bad">Wind is stronger than the airspeed.</p>`;
    const a = airData(v.ind, v.qnh, v.oat, v.cas);
    box("air").innerHTML = kvs([["Pressure altitude", fmtNum(Math.round(a.pa)) + " ft"], ["Density altitude", fmtNum(Math.round(a.da / 10) * 10) + " ft"], ["True airspeed", Math.round(a.tas) + " kt"], ["ISA deviation", (v.oat - a.isa >= 0 ? "+" : "") + Math.round(v.oat - a.isa) + " °C"]]);
    const hrs = v.gs > 0 ? v.dist / v.gs : 0;
    box("tsd").innerHTML = kvs([["Time en route", `${Math.floor(hrs)}:${String(Math.round((hrs % 1) * 60)).padStart(2, "0")}`], ["Fuel required", (hrs * v.gph).toFixed(1) + " gal"], ["+ 45 min reserve", (hrs * v.gph + 0.75 * v.gph).toFixed(1) + " gal"]]);
  }
}
