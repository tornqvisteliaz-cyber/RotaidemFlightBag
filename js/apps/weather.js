// Weather – decoded METAR/TAF, runway winds and radar for flight and favourite airports.
/* global L */
import { $, esc, on, listen, toast, pad, fmtNum } from "../core/ui.js";
import { kv } from "../core/store.js";
import { getFlight } from "../core/flight.js";
import { getAirport, searchAirports, runwayEnds } from "../core/airports.js";
import { windComponents } from "../core/geo.js";
import { metar, taf, decodeMetar, CAT_COLOR } from "../core/wx.js";
import * as M from "../core/map.js";
import { I } from "../core/sf.js";

export default { mount: (root, ctx) => new WeatherApp(root, ctx) };

class WeatherApp {
  constructor(root, ctx) {
    this.root = root; this.ctx = ctx;
    this.favs = kv.get("wx.favs", []);
    root.innerHTML = `<div class="wxa"><aside><div class="hd"><h1>Weather</h1><button data-a="refresh" title="Refresh">${I.refresh}</button></div>
      <div class="srch">${I.search}<input placeholder="Search for an airport"></div><div class="sres"></div><div class="list"></div></aside><main></main></div>`;
    on(root, "click", "[data-st]", (e, b) => this.select(b.dataset.st));
    on(root, "click", "[data-a]", (e, b) => this.act(b.dataset.a, b));
    const inp = $(".srch input", root);
    inp.addEventListener("input", async () => {
      const r = await searchAirports(inp.value, 8);
      $(".sres", root).innerHTML = inp.value ? r.map(a => `<button data-add="${a.icao}"><b>${a.icao}</b> ${esc(a.name)}</button>`).join("") : "";
    });
    on(root, "click", "[data-add]", (e, b) => { if (!this.favs.includes(b.dataset.add)) this.favs.push(b.dataset.add); kv.set("wx.favs", this.favs); inp.value = ""; $(".sres", root).innerHTML = ""; this.list(); this.select(b.dataset.add); });
    this.unsub = [listen("flight", () => this.list())];
    this.list().then(() => this.select(this.stations()[0]?.icao));
  }
  destroy() { this.unsub.forEach(u => u()); this.map?.remove(); }
  show() { setTimeout(() => this.map?.invalidateSize(), 50); }

  stations() {
    const f = getFlight();
    const out = [];
    if (f?.orig) out.push({ icao: f.orig.icao, role: "Departure" });
    if (f?.dest) out.push({ icao: f.dest.icao, role: "Destination" });
    for (const a of f?.altns || []) out.push({ icao: a.icao, role: "Alternate" });
    for (const x of this.favs) if (!out.some(o => o.icao === x)) out.push({ icao: x, role: "Favourite", fav: true });
    return out;
  }
  async list() {
    const st = this.stations();
    const box = $(".list", this.root);
    if (!st.length) { box.innerHTML = `<p class="empty">Load a flight or search for an airport to add it.</p>`; return; }
    const rows = await Promise.all(st.map(async s => ({ s, ap: await getAirport(s.icao), m: decodeMetar(await metar(s.icao)) })));
    box.innerHTML = rows.map(({ s, ap, m }) => `<button class="st ${this.cur === s.icao ? "on" : ""}" data-st="${s.icao}" style="--cat:${m ? CAT_COLOR[m.cat] : "#666"}">
      <div class="l"><b>${s.icao}</b><small>${esc(s.role)} · ${esc(ap?.city || ap?.name || "")}</small><span class="w">${m?.wind ? (m.wind.vrb ? "VRB" : pad(m.wind.dir, 3)) + "/" + m.wind.spd + "kt" : "—"} · ${m?.visM >= 9999 ? "10km+" : m?.visM ? fmtNum(m.visM) + "m" : ""}</span></div>
      <div class="r"><b>${m?.temp ?? "—"}°</b><span class="cat">${m?.cat || "N/A"}</span></div></button>`).join("");
  }
  async act(a) {
    if (a === "refresh") { toast("Refreshing…"); await this.list(); if (this.cur) this.select(this.cur); }
    if (a === "unfav") { this.favs = this.favs.filter(x => x !== this.cur); kv.set("wx.favs", this.favs); this.list(); this.select(this.stations()[0]?.icao); }
    if (a === "charts") this.ctx.open("charts", { icao: this.cur });
  }

  async select(icao) {
    if (!icao) { $("main", this.root).innerHTML = `<div class="empty big">No airport selected</div>`; return; }
    this.cur = icao;
    this.root.querySelectorAll(".st").forEach(b => b.classList.toggle("on", b.dataset.st === icao));
    const main = $("main", this.root);
    main.innerHTML = `<div class="spinner"></div>`;
    const [ap, raw, t] = await Promise.all([getAirport(icao), metar(icao), taf(icao)]);
    const m = decodeMetar(raw);
    const fav = this.favs.includes(icao);
    const ends = ap ? runwayEnds(ap) : [];
    const best = m?.wind && !m.wind.vrb ? ends.map(e => ({ e, c: windComponents(e.hdg, m.wind.dir, m.wind.spd) })).sort((a, b) => b.c.head - a.c.head) : [];
    main.innerHTML = `<div class="wx-hero" style="--cat:${m ? CAT_COLOR[m.cat] : "#666"}">
        <small>${esc(ap?.name || "")}</small><h2>${esc(icao)}</h2><div class="temp">${m?.temp ?? "—"}°</div>
        <div class="cond">${m ? `${m.cat} · ${m.cavok ? "CAVOK" : m.ceiling != null ? "Ceiling " + fmtNum(m.ceiling) + " ft" : "No ceiling"}` : "No METAR available"}</div>
        <div class="acts"><button data-a="charts">Charts</button>${fav ? `<button data-a="unfav">Remove</button>` : ""}</div></div>
      ${m ? `<div class="tiles">
        <div class="tile wind"><h5>WIND</h5><div class="compass"><div class="arrow" style="transform:rotate(${(m.wind?.dir ?? 0) + 180}deg)"></div><b>${m.wind ? m.wind.spd : 0}<small>kt</small></b></div>
          <p>${m.wind ? (m.wind.vrb ? "Variable" : pad(m.wind.dir, 3) + "°") + (m.wind.gust ? ` gusting ${m.wind.gust} kt` : "") : "Calm"}</p></div>
        <div class="tile"><h5>VISIBILITY</h5><b class="v">${m.visM >= 9999 ? "10+ km" : fmtNum(m.visM) + " m"}</b><p>${(m.wx || []).join(" ") || "No significant weather"}</p></div>
        <div class="tile"><h5>CLOUDS</h5>${m.layers.length ? m.layers.map(l => `<div class="layer"><span>${l.cover}</span><b>${fmtNum(l.ft)} ft</b></div>`).join("") : `<b class="v">${m.cavok ? "CAVOK" : "Clear"}</b>`}</div>
        <div class="tile"><h5>TEMP / DEW</h5><b class="v">${m.temp ?? "—"}° / ${m.dew ?? "—"}°</b><p>Spread ${m.temp != null && m.dew != null ? m.temp - m.dew : "—"}°</p></div>
        <div class="tile"><h5>QNH</h5><b class="v">${m.qnh ?? "—"}</b><p>${m.qnh ? (m.qnh / 33.8639).toFixed(2) + " inHg" : ""}</p></div>
        <div class="tile rw"><h5>RUNWAY WINDS</h5>${best.slice(0, 6).map(({ e, c }) => `<div class="rwr ${c.head < 0 ? "tw" : ""}"><b>${esc(e.id)}</b><span>${c.head >= 0 ? "HW" : "TW"} ${Math.abs(Math.round(c.head))}</span><span>XW ${Math.abs(Math.round(c.cross))}</span></div>`).join("") || "<p>Calm or variable</p>"}</div>
      </div>` : ""}
      <div class="rawbox"><h5>METAR</h5><pre>${esc(raw || "Not available")}</pre><h5>TAF</h5><pre>${esc(t || "TAF not available from this source (needs api/wx.php or a SimBrief OFP containing this airport).")}</pre></div>
      <div class="radar"><h5>RADAR</h5><div class="rmap"></div></div>`;
    this.mapFor(ap);
  }
  async mapFor(ap) {
    this.map?.remove();
    if (!ap) return;
    this.map = M.createMap($(".rmap", this.root), { center: [ap.lat, ap.lon], zoom: 6, maxZoom: 10 });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", { attribution: "© OpenStreetMap © CARTO", subdomains: "abcd" }).addTo(this.map);
    L.circleMarker([ap.lat, ap.lon], { radius: 6, color: "#fff", fillColor: "#0a84ff", fillOpacity: 1, weight: 2 }).addTo(this.map);
    try { const r = await M.radar(this.map, { opacity: 0.75 }); r.layer.addTo(this.map); } catch { /* offline */ }
  }
}
