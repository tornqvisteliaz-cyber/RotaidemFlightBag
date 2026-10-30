// Enroute – moving-map style enroute chart: terrain base map, route, FIRs,
// radar timeline, SIGMETs, live VATSIM frequencies, measuring and drawing tools.
/* global L */
import { $, $$, html, esc, on, listen, toast, popover, closePopovers, pad, secToHM, fmtNum } from "../core/ui.js";
import { UI } from "../core/icons.js";
import { kv } from "../core/store.js";
import { getFlight, setFlight, fetchSimbrief } from "../core/flight.js";
import { getAirport, searchAirports, runwayEnds } from "../core/airports.js";
import { distNM, bearing, windComponents, destination } from "../core/geo.js";
import { metar, taf, decodeMetar, CAT_COLOR } from "../core/wx.js";
import * as M from "../core/map.js";
import { fetchGround, groundLayer } from "../core/amm.js";
import { simState, onSim } from "../core/sim.js";
import { allAirports } from "../core/airports.js";
import { settings } from "../core/store.js";
import * as NG from "../core/navigraph.js";

export default { mount: (root, ctx, args) => new EnrouteApp(root, ctx, args) };

// Map types: Navigraph enroute charts when signed in with the tiles scope, otherwise the built-in maps.
const MAP_TYPES = {
  "High IFR": { ng: "IFR HIGH", base: "fd" }, "Low IFR": { ng: "IFR LOW", base: "fd" }, "VFR": { ng: "VFR", base: "fd" },
  "World": { ng: "WORLD", base: "fd" }, "Terrain": { base: "fd" }, "Plain": { base: "charts" },
};

class EnrouteApp {
  constructor(root, ctx) {
    this.root = root; this.ctx = ctx;
    this.opts = kv.get("enroute.opts", { terrain: true, fir: true, wx: true, sig: true, atc: false, labels: true, mapType: "High IFR" });
    this.locked = false;
    this.tool = null;
    this.render();
    this.unsub = [listen("flight", () => this.onFlight()), onSim(s => this.onSim(s))];
    this.clock = setInterval(() => this.renderTop(), 20e3);
  }
  destroy() { this.unsub.forEach(u => u()); clearInterval(this.clock); clearInterval(this.playT); this.map?.remove(); }
  show() { setTimeout(() => this.map?.invalidateSize(), 50); }

  hide() { closePopovers(); }

  render() {
    this.root.innerHTML = `<div class="fd">
      <div class="fd-top"></div>
      <div class="fd-left">
        <button class="fd-btn apt" data-a="apt"><span class="v">—</span>${UI.chevD}</button>
        <button class="fd-btn" data-a="rwy">Rwy ${UI.chevD}</button>
        <button class="fd-btn tall" data-a="info">Info<br>&amp; Wx</button>
        <button class="fd-btn" data-a="REF">REF</button>
        <button class="fd-btn" disabled>CO</button>
        <button class="fd-btn" data-a="STAR">STAR</button>
        <button class="fd-btn" data-a="APP">APP</button>
        <button class="fd-btn" data-a="TAXI">TAXI<small class="n"></small></button>
        <button class="fd-btn" data-a="SID">SID</button>
        <div style="flex:1"></div>
        <button class="fd-btn blue" data-a="maptype"><span class="mt">${esc(this.opts.mapType)}</span></button>
      </div>
      <div class="fd-map"></div>
      <button class="fd-north" data-a="north"><span class="n">${UI.north}</span> North Up</button>
      <div class="fd-tools">
        <button data-t="follow" title="Follow aircraft"><svg viewBox="0 0 24 24" width="24" height="24"><path d="M20.5 3.5 L3.5 10.6 L11 12.9 L13.3 20.5Z" fill="currentColor"/></svg></button>
        <button data-t="settings" title="Map settings">${UI.gear}</button>
        <button data-t="draw" title="Draw">${UI.pen}</button>
        <button data-t="measure" title="Measure distance">${UI.ruler}</button>
        <button data-t="layers" title="Layers">${UI.layers}</button>
        <button data-t="rings" title="Range rings">${UI.rings}</button>
        <button data-t="terrain" class="${this.opts.terrain ? "on" : ""}" title="Terrain">${UI.terrain}</button>
        <button data-t="atc" class="${this.opts.atc ? "on" : ""}" title="ATC frequencies (VATSIM)">${UI.headset}</button>
        <button data-t="clear" title="Clear drawings">${UI.eraser}</button>
        <button data-t="collapse" title="Hide toolbar">${UI.chevR}</button>
      </div>
      <div class="fd-measure hidden"></div>
      <div class="map-zoom"><button data-z="in" aria-label="Zoom in">+</button><button data-z="out" aria-label="Zoom out">−</button></div>
      <div class="fd-own hidden"></div>
      <div class="fd-ground hidden"><input placeholder="Taxiway" maxlength="5" autocomplete="off" spellcheck="false"><span></span></div>
      <div class="fd-bottom">
        <button class="fd-wx" data-a="wx">Wx</button>
        <div class="fd-wxdesc"></div>
        <button class="fd-play" data-a="play">${UI.play}</button>
        <div class="fd-time"><b class="d"></b><b class="t"></b></div>
        <div class="fd-slider"><input type="range" min="0" max="0" value="0"><div class="ticks"></div></div>
      </div>
    </div>`;
    this.el = $(".fd", this.root);
    on(this.el, "click", "[data-a]", (e, b) => this.act(b.dataset.a, b));
    on(this.el, "click", "[data-t]", (e, b) => this.toolAct(b.dataset.t, b));
    $(".fd-slider input", this.el).addEventListener("input", e => this.setFrame(+e.target.value));
    this.renderTop();
    this.renderWxDesc();
    requestAnimationFrame(() => this.initMap());
  }

  // ---------------------------------------------------------------- top bar
  renderTop() {
    const f = getFlight();
    const now = new Date();
    $(".fd-top", this.el).innerHTML = `
      <div class="fd-id"><b>${esc(f?.callsign || "NO FLIGHT")}</b><span>${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}Z</span></div>
      <div class="fd-tabs"><button data-a="flight">Flight</button><button data-a="routeinfo">Route Info</button><button data-a="pubs">Pubs</button></div>
      <div class="fd-ttl"><b>${f ? `${esc(f.orig?.icao)} → ${esc(f.dest?.icao)}` : "Enroute"}</b><span>${esc(this.opts.mapType)}${f?.aircraft?.icao ? " · " + esc(f.aircraft.icao) : ""}</span></div>
      <div class="fd-icons">
        <button data-a="search">${UI.search}</button>
        <button data-a="fitroute">${UI.route}</button>
        <button data-a="wxalert" class="badged">${UI.wx}<i class="warn"></i></button>
        <button data-a="settings" class="badged">${UI.gear}<i class="cnt">${this.sigCount || ""}</i></button>
        <button data-a="lock">${this.locked ? UI.lock : UI.unlock}</button>
      </div>`;
    const ap = this.apt || f?.orig;
    $(".fd-btn.apt .v", this.el).textContent = ap?.icao || "—";
  }

  // ---------------------------------------------------------------- map
  async initMap() {
    const f = getFlight();
    this.map = M.createMap($(".fd-map", this.el), { center: f?.orig ? [f.orig.lat, f.orig.lon] : [5, 100], zoom: 5, maxZoom: 18 });
    this.own = M.ownship(this.map, { color: "#ffffff", outline: "#1f3fd6", size: 36 });
    this.map.on("dragstart", () => { if (this.own.follow) { this.own.follow = false; $('[data-t="follow"]', this.el).classList.remove("on"); } });
    this.map.on("moveend", () => this.checkGround());
    const gi = $(".fd-ground input", this.el);
    gi.addEventListener("input", () => {
      const b = this.ground?.search(gi.value.trim().toUpperCase());
      if (b) this.map.fitBounds(b, { padding: [60, 60], maxZoom: 16 });
      if (!gi.value) this.ground?.clearSearch();
    });
    on(this.el, "click", "[data-z]", (e, b) => (b.dataset.z === "in" ? this.map.zoomIn(0.75) : this.map.zoomOut(0.75)));
    await this.applyBase();
    this.lyr = {};
    this.map.on("click", e => this.mapClick(e));
    this.map.on("zoomend", () => this.lyr.awy && (this.map.getZoom() >= 4.5 ? this.lyr.awy.addTo(this.map) : this.lyr.awy.remove()));
    this.drawings = L.layerGroup().addTo(this.map);
    this.rings = L.layerGroup().addTo(this.map);
    this.onFlight(true);
    M.firLayer(this.map, "fd").then(l => { this.lyr.fir = l; this.firs = l; this.apply(); }).catch(() => {});
    this.loadWx();
    if (this.opts.atc) this.loadAtc();
  }

  async applyBase() {
    const t = MAP_TYPES[this.opts.mapType] || MAP_TYPES["High IFR"];
    const style = this.opts.terrain ? t.base : "charts";
    this.ngLayer?.remove(); this.ngLayer = null;
    if (t.ng && NG.isConfigured() && settings().navigraphTiles) {
      try {
        this.ngLayer = await M.navigraphTiles(this.map, t.ng, "DAY");
        this.ngLayer.addTo(this.map);
      } catch (e) { toast(`Navigraph ${this.opts.mapType}: ${e.message}`); }
    }
    if (this.bm?.style !== style || !this.bm) {
      this.bm?.remove();
      this.bm = M.basemap(this.map, style);
      this.bm.style = style;
    }
    this.bm.group[this.ngLayer ? "remove" : "addTo"](this.map);
    this.bm.setLabels(!this.ngLayer && this.opts.labels !== false);
    this.el.classList.toggle("plain", style === "charts");
    this.el.classList.toggle("ngmap", !!this.ngLayer);
  }

  async onFlight(first) {
    const f = getFlight();
    this.renderTop();
    if (!this.map) return;
    this.lyr.route?.remove(); this.lyr.awy?.remove(); this.lyr.apts?.remove();
    this.lyr.route = M.routeLayer(f, { color: "#2424d6", weight: 4, style: "fd" }).addTo(this.map);
    this.lyr.awy = M.airwayLabels(f);
    if (this.map.getZoom() >= 4.5) this.lyr.awy.addTo(this.map);
    this.lyr.apts = this.airportMarkers(f).addTo(this.map);
    if (f && this.lyr.route.bounds?.isValid()) this.map.fitBounds(this.lyr.route.bounds, { padding: [60, 60] });
    if (!this.apt && f?.orig) this.apt = await getAirport(f.orig.icao);
    this.renderTop();
  }

  airportMarkers(f) {
    const g = L.layerGroup();
    if (!f) return g;
    const list = [[f.orig, "dep"], [f.dest, "dst"], ...(f.altns || []).map(a => [a, "alt"])];
    for (const [a, cls] of list) {
      if (!a?.lat) continue;
      const m = L.marker([a.lat, a.lon], {
        icon: L.divIcon({ className: `fd-apt ${cls}`, html: `<i></i><b>${esc(a.icao)}</b>`, iconSize: [18, 18], iconAnchor: [9, 9] }),
      });
      m.on("click", () => this.airportSheet(a.icao));
      g.addLayer(m);
    }
    return g;
  }

  apply() {
    if (!this.map) return;
    const set = (l, v) => { if (!l) return; if (v && !this.map.hasLayer(l)) l.addTo(this.map); if (!v && this.map.hasLayer(l)) l.remove(); };
    set(this.lyr.fir, this.opts.fir); set(this.lyr.fir?.labels, this.opts.fir && this.opts.labels);
    set(this.lyr.radar?.layer, this.opts.wx);
    set(this.lyr.sig, this.opts.sig);
    set(this.lyr.atc, this.opts.atc);
    kv.set("enroute.opts", this.opts);
    this.renderWxDesc();
  }

  // ---------------------------------------------------------------- weather
  async loadWx() {
    try {
      this.lyr.radar = await M.radar(this.map, { opacity: 0.6 });
      const fr = this.lyr.radar.frames;
      const inp = $(".fd-slider input", this.el);
      inp.max = fr.length - 1;
      inp.value = this.lyr.radar.index;
      $(".fd-slider .ticks", this.el).innerHTML = fr.map((x, i) => {
        if (i % 3 && i !== fr.length - 1) return "";
        const mins = Math.round((x.time * 1000 - Date.now()) / 60e3);
        return `<span style="left:${(i / (fr.length - 1)) * 100}%">${mins >= 0 ? "+" : ""}${Math.abs(mins) >= 60 ? (mins / 60).toFixed(1).replace(".0", "") + "h" : mins + "m"}</span>`;
      }).join("");
      this.setFrame(this.lyr.radar.index);
    } catch { toast("Radar unavailable"); }
    try {
      this.lyr.sig = await M.sigmetLayer({ fd: true });
      this.sigCount = this.lyr.sig.unavailable ? 0 : this.lyr.sig.count;
      this.sigUnavailable = this.lyr.sig.unavailable;
    } catch { this.sigUnavailable = true; }
    this.apply();
    this.renderTop();
  }
  setFrame(i) {
    const r = this.lyr.radar;
    if (!r) return;
    r.setFrame(i);
    const f = r.frames[r.index];
    const d = new Date(f.time * 1000);
    $(".fd-time .d", this.el).textContent = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).toUpperCase();
    $(".fd-time .t", this.el).textContent = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} Z${f.nowcast ? " FCST" : ""}`;
    $(".fd-slider input", this.el).value = r.index;
  }
  play() {
    const btn = $(".fd-play", this.el);
    if (this.playT) { clearInterval(this.playT); this.playT = null; btn.innerHTML = UI.play; return; }
    if (!this.opts.wx) { this.opts.wx = true; this.apply(); }
    btn.innerHTML = UI.pause;
    this.playT = setInterval(() => {
      const r = this.lyr.radar; if (!r) return;
      this.setFrame(r.index >= r.frames.length - 1 ? 0 : r.index + 1);
    }, 700);
  }
  renderWxDesc() {
    const parts = [];
    if (this.opts.wx) parts.push("Radar");
    if (this.opts.sig) parts.push(this.sigUnavailable ? "SIGMETs (n/a)" : "SIGMETs");
    if (this.opts.atc) parts.push("ATC");
    if (this.opts.fir) parts.push("FIR");
    const d = $(".fd-wxdesc", this.el);
    if (d) d.textContent = parts.join(", ") || "No overlays";
  }
  async loadAtc() {
    try {
      const firs = this.firs || await M.firLayer(this.map, "fd");
      this.firs = firs;
      this.lyr.atc?.remove();
      this.lyr.atc = await M.vatsimAtc(firs);
      toast(this.lyr.atc.count ? `VATSIM: ${this.lyr.atc.count} FIRs with ATC online` : "VATSIM: no centre controllers online");
      this.apply();
    } catch { toast("VATSIM data unavailable"); }
  }

  // ---------------------------------------------------------------- actions
  async act(a, b) {
    const f = getFlight();
    switch (a) {
      case "apt": return this.airportPicker(b);
      case "rwy": return this.runwayPicker(b);
      case "info": return this.airportSheet((this.apt || f?.orig)?.icao);
      case "REF": case "STAR": case "APP": case "TAXI": case "SID": {
        const cat = { REF: "GEN", STAR: "STAR", APP: "APPR", TAXI: "TAXI", SID: "SID" }[a];
        const icao = a === "SID" ? f?.orig?.icao : a === "STAR" || a === "APP" ? (this.apt?.icao !== f?.orig?.icao ? this.apt?.icao : f?.dest?.icao) || f?.dest?.icao : this.apt?.icao || f?.orig?.icao;
        if (!icao) return toast("Load a flight or select an airport first");
        return this.ctx.open("charts", { icao, cat });
      }
      case "maptype": return this.mapTypePicker(b);
      case "north": return this.map?.setView(this.map.getCenter(), this.map.getZoom());
      case "wx": return this.wxPicker(b);
      case "play": return this.play();
      case "flight": return this.flightPanel(b);
      case "routeinfo": return this.routeInfo(b);
      case "pubs": return this.ctx.open("library");
      case "search": return this.search(b);
      case "fitroute": if (this.lyr.route?.bounds?.isValid()) this.map.fitBounds(this.lyr.route.bounds, { padding: [60, 60] }); return;
      case "wxalert": return this.wxAlerts(b);
      case "settings": return this.toolAct("layers", b);
      case "lock":
        this.locked = !this.locked;
        for (const h of ["dragging", "touchZoom", "scrollWheelZoom", "doubleClickZoom", "boxZoom", "keyboard"]) this.locked ? this.map[h].disable() : this.map[h].enable();
        toast(this.locked ? "Map locked" : "Map unlocked");
        return this.renderTop();
    }
  }

  async airportPicker(anchor) {
    const f = getFlight();
    const items = [["DEP", f?.orig], ["DEST", f?.dest], ...(f?.altns || []).map(a => ["ALTN", a])].filter(x => x[1]);
    const p = popover(anchor, `<div class="fd-pop list">${items.map(([r, a]) => `<button data-i="${a.icao}"><b>${esc(a.icao)}</b><span>${r} · ${esc(a.name || "")}</span></button>`).join("")}
      <div class="srch"><input placeholder="Search airport"></div><div class="res"></div></div>`, { side: "right", width: 330 });
    on(p.el, "click", "[data-i]", async (e, b) => {
      closePopovers();
      this.apt = await getAirport(b.dataset.i);
      this.renderTop();
      this.map.setView([this.apt.lat, this.apt.lon], 9);
    });
    $("input", p.el).addEventListener("input", async e => {
      const r = await searchAirports(e.target.value, 8);
      $(".res", p.el).innerHTML = r.map(a => `<button data-i="${a.icao}"><b>${a.icao}</b><span>${esc(a.name)}</span></button>`).join("");
    });
  }

  async runwayPicker(anchor) {
    const ap = this.apt || (getFlight()?.orig && await getAirport(getFlight().orig.icao));
    if (!ap) return toast("Select an airport first");
    const m = decodeMetar(await metar(ap.icao));
    const ends = runwayEnds(ap);
    const f = getFlight();
    const cur = f?.orig?.icao === ap.icao ? f.orig.rwy : f?.dest?.icao === ap.icao ? f.dest.rwy : null;
    const p = popover(anchor, `<div class="fd-pop list rwy"><header>${esc(ap.icao)} runways ${m?.wind ? `· wind ${m.wind.vrb ? "VRB" : pad(m.wind.dir, 3)}/${m.wind.spd}${m.wind.gust ? "G" + m.wind.gust : ""}kt` : ""}</header>
      ${ends.map(e => {
        const w = m?.wind && !m.wind.vrb ? windComponents(e.hdg, m.wind.dir, m.wind.spd) : null;
        return `<button data-r="${esc(e.id)}" class="${e.id === cur ? "on" : ""}"><b>${esc(e.id)}</b><span>${fmtNum(e.len)} ft · ${String(Math.round(e.hdg)).padStart(3, "0")}°T${w ? ` · <em class="${w.head < 0 ? "tw" : ""}">${w.head < 0 ? "TW" : "HW"} ${Math.abs(Math.round(w.head))}</em> XW ${Math.abs(Math.round(w.cross))}` : ""}</span></button>`;
      }).join("")}</div>`, { side: "right", width: 380 });
    on(p.el, "click", "[data-r]", (e, b) => {
      closePopovers();
      if (!f) return;
      const which = f.orig?.icao === ap.icao ? "orig" : f.dest?.icao === ap.icao ? "dest" : null;
      if (!which) return toast(`${b.dataset.r} selected`);
      setFlight({ ...f, [which]: { ...f[which], rwy: b.dataset.r } });
      toast(`${ap.icao} runway ${b.dataset.r} set for ${which === "orig" ? "departure" : "arrival"}`);
    });
  }

  async airportSheet(icao) {
    if (!icao) return toast("Select an airport first");
    const ap = await getAirport(icao);
    if (!ap) return;
    const sheet = html(`<div class="fd-sheet"><header><div><b>${esc(ap.icao)}</b>${ap.iata ? " / " + esc(ap.iata) : ""}<span>${esc(ap.name)} · ${esc(ap.city || "")} ${esc(ap.country)}</span></div><button data-x>${UI.x}</button></header>
      <div class="body"><div class="wxbox"><div class="spinner dark"></div></div>
      <h4>Runways</h4><table>${runwayEnds(ap).map(e => `<tr><td><b>${esc(e.id)}</b></td><td>${String(Math.round(e.hdg)).padStart(3, "0")}°T</td><td>${fmtNum(e.len)} ft</td><td>${e.wid || "—"} ft</td><td>${e.elev ?? "—"} ft</td></tr>`).join("")}</table>
      <h4>Frequencies</h4><div class="freqs">${ap.freqs.map(fq => `<span><em>${esc(fq.type)}</em> ${fq.mhz.toFixed(3)}</span>`).join("") || "—"}</div>
      <div class="acts"><button class="ios-btn small" data-c>Open charts</button><button class="ios-btn small secondary" data-m>Show on map</button></div></div></div>`);
    $(".fd-sheet", this.el)?.remove();
    this.el.append(sheet);
    on(sheet, "click", "[data-x]", () => sheet.remove());
    $("[data-c]", sheet).onclick = () => this.ctx.open("charts", { icao: ap.icao });
    $("[data-m]", sheet).onclick = () => { this.map.setView([ap.lat, ap.lon], 9); sheet.remove(); };
    const [m, t] = await Promise.all([metar(icao), taf(icao)]);
    const d = decodeMetar(m);
    $(".wxbox", sheet).innerHTML = m ? `<div class="cat" style="background:${CAT_COLOR[d.cat]}">${d.cat}</div>
      <pre>${esc(m)}</pre>${t ? `<pre class="taf">${esc(t)}</pre>` : `<p class="dim">TAF not available from this source.</p>`}` : `<p class="dim">No METAR available.</p>`;
  }

  mapTypePicker(anchor) {
    const ng = NG.isConfigured() && settings().navigraphTiles;
    const p = popover(anchor, `<div class="fd-pop list"><header>Map</header>${Object.entries(MAP_TYPES).map(([k, t]) => `<button data-m="${k}" class="${k === this.opts.mapType ? "on" : ""}"><b>${k}</b><span>${t.ng ? (ng ? "Navigraph enroute chart" : "Terrain map · Navigraph chart when connected") : t.base === "fd" ? "Shaded relief" : "Clean light map"}</span></button>`).join("")}</div>`, { side: "right", width: 300 });
    on(p.el, "click", "[data-m]", (e, b) => {
      closePopovers();
      this.opts.mapType = b.dataset.m;
      $(".mt", this.el).textContent = b.dataset.m;
      this.applyBase(); this.apply(); this.renderTop();
    });
  }

  wxPicker(anchor) {
    const rows = [["wx", "Radar (RainViewer)"], ["sig", "SIGMETs" + (this.sigUnavailable ? " – source n/a" : "")], ["atc", "ATC frequencies (VATSIM)"], ["fir", "FIR boundaries"], ["labels", "FIR labels"]];
    const p = popover(anchor, `<div class="fd-pop toggles">${rows.map(([k, l]) => `<label><span>${l}</span><input type="checkbox" data-k="${k}" ${this.opts[k] ? "checked" : ""}><i></i></label>`).join("")}</div>`, { side: "top", width: 320 });
    on(p.el, "change", "[data-k]", (e, b) => {
      this.opts[b.dataset.k] = b.checked;
      if (b.dataset.k === "atc" && b.checked && !this.lyr.atc) this.loadAtc();
      if (b.dataset.k === "sig" && b.checked && this.sigUnavailable) toast("SIGMETs need the PHP weather proxy (api/wx.php) when hosted");
      $(`[data-t="atc"]`, this.el).classList.toggle("on", this.opts.atc);
      this.apply();
    });
  }

  async wxAlerts(anchor) {
    const f = getFlight();
    if (!f) return toast("No flight loaded");
    const aps = [f.orig, f.dest, ...(f.altns || [])].filter(Boolean);
    const rows = await Promise.all(aps.map(async a => ({ a, m: decodeMetar(await metar(a.icao)) })));
    popover(anchor, `<div class="fd-pop wxl">${rows.map(({ a, m }) => `<div class="r"><span class="cat" style="background:${m ? CAT_COLOR[m.cat] : "#888"}">${m?.cat || "N/A"}</span><b>${esc(a.icao)}</b><code>${esc(m?.raw || "No METAR")}</code></div>`).join("")}
      ${this.sigCount ? `<div class="r"><span class="cat" style="background:#c41e3a">SIG</span><b>${this.sigCount}</b><code>active international SIGMETs worldwide</code></div>` : ""}</div>`, { side: "bottom", width: 520 });
  }

  flightPanel(anchor) {
    const f = getFlight();
    const z = ms => (ms ? `${pad(new Date(ms).getUTCHours())}${pad(new Date(ms).getUTCMinutes())}Z` : "—");
    const p = popover(anchor, `<div class="fd-pop info">${f ? `
      <h3>${esc(f.callsign)} <small>${esc(f.aircraft?.icao || "")} ${esc(f.aircraft?.reg || "")}</small></h3>
      <div class="g"><div><span>DEP</span><b>${esc(f.orig.icao)} ${esc(f.orig.rwy || "")}</b></div><div><span>DEST</span><b>${esc(f.dest.icao)} ${esc(f.dest.rwy || "")}</b></div><div><span>ALTN</span><b>${esc(f.altn?.icao || "—")}</b></div>
      <div><span>OFF</span><b>${z(f.times?.off)}</b></div><div><span>ETE</span><b>${secToHM(f.times?.ete)}</b></div><div><span>ON</span><b>${z(f.times?.on)}</b></div>
      <div><span>CRZ</span><b>FL${f.cruiseAlt ? Math.round(f.cruiseAlt / 100) : "—"}</b></div><div><span>DIST</span><b>${fmtNum(f.distance)} NM</b></div><div><span>CI</span><b>${esc(f.ci ?? "—")}</b></div></div>
      <p class="mono">${esc(f.route || "")}</p>` : "<p>No flight loaded.</p>"}
      <div class="acts"><button class="ios-btn small" data-sb>Load SimBrief</button><button class="ios-btn small secondary" data-br>Briefing</button></div></div>`, { width: 460 });
    $("[data-sb]", p.el).onclick = () => { closePopovers(); fetchSimbrief().then(() => toast("Flight loaded")).catch(e => toast(e.message)); };
    $("[data-br]", p.el).onclick = () => { closePopovers(); this.ctx.open("briefing"); };
  }

  routeInfo(anchor) {
    const f = getFlight();
    if (!f) return toast("No flight loaded");
    const rows = (f.navlog || []).map(n => `<tr data-ll="${n.lat},${n.lon}"><td><b>${esc(n.ident)}</b></td><td>${esc(n.via || "")}</td><td>${n.alt != null ? (n.alt >= 18000 ? "FL" + Math.round(n.alt / 100) : n.alt) : ""}</td><td>${n.trk ?? ""}</td><td>${n.dist != null ? Math.round(n.dist) : ""}</td><td>${secToHM(n.timeTotal)}</td><td>${n.fuelOnboard != null ? fmtNum(n.fuelOnboard / 1000, 1) : ""}</td><td>${esc(n.wind || "")}</td></tr>`).join("");
    const p = popover(anchor, `<div class="fd-pop navlog"><table><thead><tr><th>WPT</th><th>VIA</th><th>ALT</th><th>MT</th><th>DIST</th><th>TIME</th><th>FOB t</th><th>WIND</th></tr></thead><tbody>${rows}</tbody></table></div>`, { width: 560 });
    on(p.el, "click", "[data-ll]", (e, tr) => { const [la, lo] = tr.dataset.ll.split(",").map(Number); this.map.setView([la, lo], 8); });
  }

  search(anchor) {
    const p = popover(anchor, `<div class="fd-pop list"><div class="srch"><input placeholder="Airport or waypoint in route"></div><div class="res"></div></div>`, { width: 360 });
    const inp = $("input", p.el);
    inp.addEventListener("input", async () => {
      const q = inp.value.toUpperCase();
      const wpts = (getFlight()?.navlog || []).filter(n => q && n.ident.startsWith(q)).slice(0, 5);
      const aps = await searchAirports(q, 8);
      $(".res", p.el).innerHTML = wpts.map(n => `<button data-ll="${n.lat},${n.lon}"><b>${esc(n.ident)}</b><span>Route waypoint</span></button>`).join("") +
        aps.map(a => `<button data-ll="${a.lat},${a.lon}" data-ap="${a.icao}"><b>${a.icao}</b><span>${esc(a.name)}</span></button>`).join("");
    });
    on(p.el, "click", "[data-ll]", async (e, b) => {
      closePopovers();
      const [la, lo] = b.dataset.ll.split(",").map(Number);
      this.map.setView([la, lo], 8);
      if (b.dataset.ap) this.apt = await getAirport(b.dataset.ap), this.renderTop();
    });
    setTimeout(() => inp.focus(), 50);
  }

  // ---------------------------------------------------------------- tools
  toolAct(t, b) {
    if (t === "collapse") { this.el.classList.toggle("tools-hidden"); return; }
    if (t === "follow") {
      const s = simState();
      if (!s.connected) return toast(s.status || "No aircraft connected – see Settings › Simulator");
      this.own.follow = !this.own.follow;
      b.classList.toggle("on", this.own.follow);
      if (this.own.follow) this.map.setView([s.lat, s.lon], s.onGround ? 15 : Math.max(this.map.getZoom(), 7));
      return;
    }
    if (t === "terrain") { this.opts.terrain = !this.opts.terrain; b.classList.toggle("on", this.opts.terrain); this.applyBase(); this.apply(); return; }
    if (t === "atc") { this.opts.atc = !this.opts.atc; b.classList.toggle("on", this.opts.atc); if (this.opts.atc && !this.lyr.atc) this.loadAtc(); this.apply(); return; }
    if (t === "clear") { this.drawings.clearLayers(); this.rings.clearLayers(); this.endTool(); toast("Drawings cleared"); return; }
    if (t === "layers" || t === "settings") return this.wxPicker(b);
    if (this.tool === t) return this.endTool();
    this.endTool();
    this.tool = t;
    b.classList.add("active");
    const hint = { draw: "Drag on the map to draw. Tap the pen again to finish.", measure: "Tap two points to measure distance and bearing.", rings: "Tap a point to place 25/50/100 NM range rings." }[t];
    toast(hint, 3000);
    if (t === "draw") this.startDraw();
    this.measurePts = [];
  }
  endTool() {
    $$(".fd-tools .active", this.el).forEach(x => x.classList.remove("active"));
    if (this.tool === "draw") this.stopDraw();
    this.tool = null;
    $(".fd-measure", this.el).classList.add("hidden");
    this.measureLine?.remove();
  }
  mapClick(e) {
    if (this.tool === "measure") {
      this.measurePts.push(e.latlng);
      if (this.measurePts.length === 2) {
        const [a, c] = this.measurePts;
        const d = distNM(a.lat, a.lng, c.lat, c.lng), brg = bearing(a.lat, a.lng, c.lat, c.lng);
        this.measureLine?.remove();
        this.measureLine = L.polyline([a, c], { color: "#ff9500", weight: 3, dashArray: "8 6" }).addTo(this.map);
        const box = $(".fd-measure", this.el);
        box.classList.remove("hidden");
        box.innerHTML = `<b>${d.toFixed(1)} NM</b><span>${String(Math.round(brg)).padStart(3, "0")}°T · ${(d / 450 * 60).toFixed(0)} min @ 450 kt</span>`;
        this.measurePts = [];
      }
    } else if (this.tool === "rings") {
      for (const nm of [25, 50, 100]) {
        const pts = Array.from({ length: 73 }, (_, i) => destination(e.latlng.lat, e.latlng.lng, i * 5, nm));
        this.rings.addLayer(L.polyline(pts, { color: "#0a84ff", weight: 1.5, dashArray: "4 4", interactive: false }));
        this.rings.addLayer(L.marker(destination(e.latlng.lat, e.latlng.lng, 0, nm), { interactive: false, icon: L.divIcon({ className: "ring-lbl", html: `${nm}`, iconSize: null }) }));
      }
    }
  }
  // ---------------------------------------------------------------- live aircraft
  onSim(s) {
    if (!this.map) return;
    this.own.update(s);
    const box = $(".fd-own", this.el);
    if (!s.connected) { box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    const r = v => (v == null ? "—" : Math.round(v));
    box.innerHTML = `<div><small>GS</small><b>${r(s.gs)}</b></div><div><small>${s.onGround ? "ELEV" : "ALT"}</small><b>${s.alt == null ? "—" : s.alt >= 18000 ? "FL" + Math.round(s.alt / 100) : fmtNum(s.alt)}</b></div>
      <div><small>TRK</small><b>${s.trk == null && s.hdg == null ? "—" : String(r(s.onGround ? s.hdg : s.trk ?? s.hdg) % 360).padStart(3, "0")}°</b></div><div><small>V/S</small><b>${s.onGround ? "GND" : (s.vs > 0 ? "+" : "") + fmtNum(Math.round((s.vs || 0) / 50) * 50)}</b></div>
      <div class="src"><i></i>${esc(s.source || "")}</div>`;
    if (s.onGround && this.map.getZoom() >= 12) this.checkGround();
  }

  /** Show the Lido-style ground map when zoomed in near an airport. */
  async checkGround() {
    const z = this.map.getZoom();
    const near = z >= 12.5;
    this.el.classList.toggle("ground", near);
    $(".fd-ground", this.el).classList.toggle("hidden", !near || !this.ground);
    if (!near) { if (this.ground) { this.ground.remove(); this.ground = null; this.groundIcao = null; this.map.getContainer().style.background = ""; } return; }
    const c = this.map.getCenter();
    const aps = await allAirports();
    let best = null, bd = 1e9;
    for (const a of aps) {
      if (a[8] < 1 || Math.abs(a[5] - c.lat) > 0.2) continue;
      const d = distNM(c.lat, c.lng, a[5], a[6]);
      if (d < bd) { bd = d; best = a; }
    }
    if (!best || bd > 6 || best[0] === this.groundIcao || this.groundLoading === best[0]) return;
    this.groundLoading = best[0];
    try {
      const data = await fetchGround(best[0], best[5], best[6]);
      if (this.map.getZoom() < 12.5) return;
      this.ground?.remove();
      this.ground = groundLayer(this.map, data, { theme: "day" }).addTo(this.map);
      this.groundIcao = best[0];
      $(".fd-ground", this.el).classList.remove("hidden");
      $(".fd-ground span", this.el).textContent = this.ground.empty ? `${best[0]} · no taxiway data in OSM` : `${best[0]} · ${this.ground.refs.length} taxiways`;
    } catch { toast(`Ground map for ${best[0]} unavailable`); }
    finally { this.groundLoading = null; }
  }

  startDraw() {
    const map = this.map, el = map.getContainer();
    map.dragging.disable();
    let line = null;
    const ll = e => map.mouseEventToLatLng(e);
    this._down = e => { el.setPointerCapture(e.pointerId); line = L.polyline([ll(e)], { color: "#e5383b", weight: 3, interactive: false }).addTo(this.drawings); };
    this._move = e => { if (line) line.addLatLng(ll(e)); };
    this._up = () => { line = null; };
    el.addEventListener("pointerdown", this._down);
    el.addEventListener("pointermove", this._move);
    el.addEventListener("pointerup", this._up);
  }
  stopDraw() {
    const el = this.map.getContainer();
    el.removeEventListener("pointerdown", this._down);
    el.removeEventListener("pointermove", this._move);
    el.removeEventListener("pointerup", this._up);
    if (!this.locked) this.map.dragging.enable();
  }
}
