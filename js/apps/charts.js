// Charts – modelled on a airline EFB chart viewer: an ENR map view and an
// aerodrome chart view, with Navigraph (Jeppesen) charts, imported PDF charts
// and generated airport pages.
/* global L */
import { $, $$, html, esc, on, listen, toast, popover, closePopovers, panZoom, modal, loadScript } from "../core/ui.js";
import { UI } from "../core/icons.js";
import { settings, setSetting, kv, files } from "../core/store.js";
import { getFlight, fetchSimbrief } from "../core/flight.js";
import { getAirport, searchAirports } from "../core/airports.js";
import { distNM } from "../core/geo.js";
import { metar, decodeMetar } from "../core/wx.js";
import * as NG from "../core/navigraph.js";
import { airportDiagram, airportInfo, PAGE_W, PAGE_H } from "../core/genchart.js";
import * as M from "../core/map.js";
import { fetchGround, groundLayer } from "../core/amm.js";
import { simState, onSim } from "../core/sim.js";
import { lidoStatus, lidoIndex, lidoPageImages } from "../core/lido.js";

const CATS = ["GEN", "SID", "STAR", "APPR", "TAXI"];
const CAT_NAMES = { GEN: "GEN", SID: "SID", STAR: "STAR", APPR: "APPR", TAXI: "TAXI" };
export const DOC_FOLDERS = ["Additional Chart", "B737 Checklist", "B737 Manual", "Company Manual"];
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";

export default { mount: (root, ctx, args) => new ChartsApp(root, ctx, args) };

class ChartsApp {
  constructor(root, ctx, args) {
    this.root = root; this.ctx = ctx;
    this.mode = "enr";
    this.icao = null; this.role = null;
    this.index = [];          // charts for current airport
    this.sel = {};            // icao -> { cat -> chart }
    this.chart = null;        // displayed chart
    this.rot = 0;
    this.night = settings().chartTheme === "night";
    this.layers = { lbl: true, ...kv.get("charts.layers", { ad: true, nav: true, fir: true, awy: true, wpt: true, wx: false, sig: false }) };
    this.enr = { airspace: "HIGH", com: false, era: false };
    this.render();
    this.unsub = [
      listen("flight", () => { this.renderTop(); this.refreshRoute(); }),
      listen("navigraph", () => { if (this.icao) this.loadAirport(this.icao, this.role, true); this.renderTop(); }),
      onSim(st => { this.own?.update(st); this.ammOwn?.update(st); }),
    ];
    if (args) this.show(args);
  }

  // ---------------------------------------------------------------- layout
  render() {
    this.root.innerHTML = `
    <div class="charts mode-enr ${this.night ? "night" : ""}">
      <div class="c-top"></div>
      <div class="c-left">
        <div class="enr-only col">
          <button class="c-sq" data-act="search" title="Search airport">${UI.search}</button>
          <div class="c-layers">
            <button class="c-sq" data-act="sliders" title="Map options">${UI.sliders}</button>
            ${[["ad", "AD"], ["nav", "NAVAID"], ["fir", "FIR"], ["awy", "AWY HI"], ["wpt", "WPT"], ["lbl", "LABELS"], ["wx", "WX"], ["sig", "SIGMET"]]
              .map(([k, l]) => `<button class="c-layer ${this.layers[k] ? "on" : ""}" data-layer="${k}">${l}</button>`).join("")}
          </div>
        </div>
        <div class="ad-only col">
          <button class="c-sq" data-act="bookmark" title="Add to USER">${UI.clip}<i class="plus">+</i></button>
          <button class="c-sq" data-act="search" title="Search airport">${UI.search}</button>
          <div style="flex:1"></div>
          <button class="c-sq txt" data-act="docs">BUL</button>
          <button class="c-sq txt" data-act="adinfo">ADI</button>
        </div>
      </div>
      <div class="c-main">
        <div class="c-map enr-only"></div>
        <div class="c-map-ui enr-only">
          <div class="c-north">${UI.north}<b>N</b></div>
          <div class="c-scalebar"><div class="bar"></div><div class="lbls"><span>0</span><span class="mid"></span><span class="end"></span></div></div>
        </div>
        <div class="enr-only"><div class="map-zoom"><button data-z="in" aria-label="Zoom in">+</button><button data-z="out" aria-label="Zoom out">−</button></div></div>
        <div class="c-amm ad-only"><div class="c-amm-map"></div>
          <div class="c-amm-bar"><div class="srch"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 L21 21"/></svg><input placeholder="Taxiway" maxlength="5" autocomplete="off" spellcheck="false"></div>
            <div class="chips"></div>
            <button data-amm="follow" title="Follow aircraft"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M20.5 3.5 L3.5 10.6 L11 12.9 L13.3 20.5Z" fill="currentColor"/></svg></button>
            <button data-amm="fit" title="Whole airport">${UI.fit}</button></div>
          <div class="c-amm-msg"></div></div>
        <div class="c-viewer ad-only">
          <div class="c-page"><div class="c-rot"></div></div>
          <div class="c-empty"></div>
          <div class="c-tools">
            <button data-act="night" title="Day / night">${UI.moon}</button>
            <button data-act="rotate" title="Rotate">${UI.rotate}</button>
            <button data-act="fit" title="Fit page">${UI.fit}</button>
          </div>
        </div>
      </div>
      <div class="c-right">
        <div class="enr-only col c-rcol"></div>
        <div class="ad-only col c-rcol"></div>
        <button class="c-menu" data-act="menu"><span>MENU</span>${UI.menuPlane}</button>
      </div>
      <div class="c-splash"><div class="logo"><span class="box">ROTAIDEM</span><span class="name">Charts</span></div><div class="sub">POWERED BY NAVIGRAPH · JEPPESEN CHARTS</div></div>
    </div>`;
    this.el = $(".charts", this.root);
    this.pz = panZoom($(".c-viewer", this.el), $(".c-page", this.el), { min: 0.15, max: 10 });
    this.bind();
    this.renderTop();
    this.renderRight();
    setTimeout(() => $(".c-splash", this.el).classList.add("gone"), 900);
    setTimeout(() => { $(".c-splash", this.el)?.remove(); this.initMap(); }, 1500);
  }

  bind() {
    const el = this.el;
    on(el, "click", "[data-act]", (e, b) => this.act(b.dataset.act, b, e));
    on(el, "click", "[data-layer]", (e, b) => this.toggleLayer(b.dataset.layer, b));
    on(el, "click", "[data-cat]", (e, b) => this.chartList(b.dataset.cat, b));
    on(el, "click", "[data-role]", (e, b) => this.pickRole(b.dataset.role, b));
    on(el, "click", "[data-enr]", (e, b) => this.enrToggle(b.dataset.enr, b));
    on(el, "click", "[data-amm]", (e, b) => this.ammAct(b.dataset.amm, b));
    on(el, "click", "[data-twy]", (e, b) => { const i = $(".c-amm-bar input", el); i.value = b.dataset.twy; i.dispatchEvent(new Event("input")); });
  }

  show(args) {
    if (!args) { this.map?.invalidateSize(); return; }
    if (args.icao) {
      const f = getFlight();
      const role = f?.orig?.icao === args.icao ? "FROM" : f?.dest?.icao === args.icao ? "TO" : f?.altn?.icao === args.icao ? "ALTN" : "OTHER";
      this.loadAirport(args.icao, role).then(() => { if (args.cat) this.autoSelect(args.cat, true); });
    }
  }
  hide() { closePopovers(); }
  destroy() { this.unsub.forEach(u => u()); this.map?.remove(); this.amm?.remove(); clearInterval(this.atcTimer); }

  setMode(m) {
    this.mode = m;
    this.el.classList.toggle("mode-enr", m === "enr");
    this.el.classList.toggle("mode-ad", m === "ad");
    this.renderTop();
    this.renderRight();
    if (m === "enr") setTimeout(() => this.map?.invalidateSize(), 30);
  }

  // ---------------------------------------------------------------- top bar
  renderTop() {
    const top = $(".c-top", this.el);
    const f = getFlight();
    const cell = (lbl, val, cls = "", attrs = "") => `<div class="c-cell ${cls}" ${attrs}><span class="lbl">${lbl}</span><span class="val">${val}</span></div>`;
    if (this.mode === "enr") {
      const ap = a => (a?.icao ? `<em class="mag">${esc(a.icao)}${a.iata ? "/" + esc(a.iata) : ""}</em>${a.rwy ? ` <em class="cy">${esc(a.rwy)}</em>` : ""}` : `<em class="gr">-</em>`);
      top.innerHTML = `
        ${cell("FLIGHT", f?.callsign ? `<em class="wh">${esc(f.callsign)}</em>` : `<em class="gr">-</em>`, "", `data-act="flight"`)}
        ${cell("FROM", ap(f?.orig), "", `data-role="FROM"`)}
        ${cell("TO", ap(f?.dest), "", `data-role="TO"`)}
        ${cell("ROUTE", f?.route ? `<em class="wh small">${esc(f.route.slice(0, 34))}${f.route.length > 34 ? "…" : ""}</em>` : `<em class="gr">-</em>`, "wide", `data-act="route"`)}
        ${cell("ALTN", ap(f?.altn), "", `data-role="ALTN"`)}`;
    } else {
      const ch = this.chart;
      top.innerHTML = `
        <button class="c-tab icon" data-act="enr" title="Enroute map"><svg viewBox="0 0 40 30" width="38" height="28"><path d="M3 24 L12 6 L22 18 L29 10 L37 24Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 13 L32 6" stroke="#d22fc9" stroke-width="2.4"/></svg><span>ENR</span></button>
        <button class="c-tab apt" data-act="airports"><b class="mag">${esc(this.icao || "-")}</b><b class="mag sm">${esc(this.ap?.iata || "")}</b><span>${esc(this.role === "OTHER" ? "AD" : this.role || "")}</span></button>
        ${ch ? `<button class="c-tab chart" data-cat="${ch.cat}"><b>${esc(CAT_NAMES[ch.cat])}</b><span>[${esc(ch.index || "—")}]</span></button>` : ""}
        <div class="c-title">${ch ? esc(ch.title || ch.name) : this.icao ? `<span class="dim">${esc(this.ap?.name || "")}</span>` : ""}</div>
        ${ch?.source === "navigraph" ? `<div class="c-src">Navigraph · Jeppesen</div>` : ch?.source === "local" ? `<div class="c-src">Imported</div>` : ch?.source === "amm" ? `<div class="c-src">OpenStreetMap · live</div>` : ch?.source === "lido" ? `<div class="c-src">Lido · MSFS 2024</div>` : ch ? `<div class="c-src">Generated</div>` : ""}`;
    }
  }

  // ---------------------------------------------------------------- right column
  renderRight() {
    if (this.mode === "enr") {
      const f = getFlight();
      $(".c-rcol.enr-only", this.el).innerHTML = `
        <button class="c-rt route" data-act="route"><b>&gt;</b> ROUTE</button>
        <div class="c-rt logo"><svg viewBox="0 0 64 40" width="64" height="40"><ellipse cx="32" cy="20" rx="28" ry="15" fill="#8be34a"/><g fill="#1c1e26"><rect x="10" y="12" width="44" height="3"/><rect x="10" y="18.5" width="44" height="3"/><rect x="10" y="25" width="44" height="3"/></g></svg>
          <span>V ${esc(f?.airac || "26.10")}</span></div>
        <button class="c-rt" data-enr="scale"><span class="lbl">SCALE</span><b class="cy">CUSTOM<br><span class="scale-v">—</span></b></button>
        <button class="c-rt" data-enr="airspace"><span class="lbl">AIRSPACE</span><b class="cy">${this.enr.airspace}</b></button>
        <button class="c-rt" data-enr="com"><span class="lbl">COM</span><b class="cy">${this.enr.com ? "ON" : "OFF"}</b></button>
        <button class="c-rt" data-enr="era"><span class="lbl">ERA</span><b class="cy">${this.enr.era ? "ON" : "OFF"}</b></button>
        <div class="c-rt split"><button data-enr="trk"><span class="red">TRK</span> <span class="gn">MAP</span></button><button data-enr="pos"><span class="${this.own?.follow ? "cy" : "gn"}">POS</span></button><b class="cy pan">${this.own?.follow ? "POS" : "PAN"}</b></div>`;
      this.updateScale();
    } else {
      const cats = ["GEN", this.role === "FROM" ? "SID" : "STAR", "APPR", "TAXI"];
      if (this.role === "OTHER") cats.splice(1, 1, "SID", "STAR");
      const s = this.sel[this.icao] || {};
      const m = this.metarDecoded;
      const notams = this.airportNotams();
      const warn = notams.length || (m && (m.cat === "IFR" || m.cat === "LIFR" || (m.wx || []).some(w => /TS|FZ|\+/.test(w))));
      $(".c-rcol.ad-only", this.el).innerHTML = cats.map(c => {
        const count = this.index.filter(x => x.cat === c).length;
        const chosen = s[c];
        if (c === "GEN") return `<button class="c-rt gen ${warn ? "hatch" : ""} ${this.chart?.cat === c ? "cur" : ""}" data-cat="GEN"><span class="lbl">GEN</span>
          <span class="note ${notams.length ? "notam" : ""}">${notams.length ? esc(notamHeadline(notams[0].text)) : m ? esc(m.raw.slice(0, 120)) : chosen ? `<em class="teal">${esc(chosen.short || chosen.name)}</em>` : `${count} chart${count === 1 ? "" : "s"}`}</span></button>`;
        return `<button class="c-rt ${this.chart?.cat === c ? "cur" : ""}" data-cat="${c}"><span class="lbl">${CAT_NAMES[c]}</span>
          ${chosen ? `<em class="teal">${esc(chosen.short || chosen.name)}</em>` : `<span class="cnt">${count ? count + " charts" : "–"}</span>`}</button>`;
      }).join("") + `<button class="c-rt" data-act="user"><span class="lbl">USER</span><span class="cnt">${kv.get("bookmarks", []).length || "–"}</span></button>`;
    }
  }

  // ---------------------------------------------------------------- actions
  async act(a, b) {
    switch (a) {
      case "menu": return this.menu(b);
      case "search": return this.search(b);
      case "flight": return this.flightPop(b);
      case "route": return this.routePop(b);
      case "enr": return this.setMode("enr");
      case "airports": return this.airportsPop(b);
      case "docs": return this.docsPanel(b);
      case "adinfo": return this.autoSelect("GEN", true, "10-1P");
      case "night": this.night = !this.night; setSetting("chartTheme", this.night ? "night" : "day"); this.el.classList.toggle("night", this.night); this.ammLayer?.setTheme(this.night ? "night" : "day"); if (this.chart && this.chart.source !== "amm") this.display(this.chart, true); return;
      case "rotate": this.rot = (this.rot + 90) % 360; if (this.chart) this.display(this.chart, true); return;
      case "fit": return this.fit();
      case "bookmark": return this.bookmark();
      case "user": return this.userPop(b);
      case "sliders": return this.mapOptions(b);
    }
  }

  menu(anchor) {
    const ng = NG.isConfigured();
    const p = popover(anchor, `<div class="c-pop menu">
      <button data-m="docs">Documents &amp; Bookmarks</button>
      <button data-m="enr">Enroute map (ENR)</button>
      <button data-m="ad">Aerodrome charts${this.icao ? " – " + esc(this.icao) : ""}</button>
      <button data-m="import">Import charts (PDF / image)…</button>
      <button data-m="night">${this.night ? "Day mode" : "Night mode"}</button>
      <button data-m="simbrief">Reload flight from SimBrief</button>
      <button data-m="ngweb">Navigraph Charts${this.icao ? " – " + esc(this.icao) : ""}</button>
      ${ng ? `<button data-m="ng">Navigraph developer account…</button>` : ""}
      <button data-m="home">Close Charts</button></div>`, { side: "left", width: 290 });
    on(p.el, "click", "[data-m]", async (e, b) => {
      closePopovers();
      const m = b.dataset.m;
      if (m === "docs") this.docsPanel(anchor);
      if (m === "enr") this.setMode("enr");
      if (m === "ad") { if (this.icao) this.setMode("ad"); else this.search(anchor); }
      if (m === "import") this.importDialog();
      if (m === "night") this.act("night");
      if (m === "simbrief") fetchSimbrief().then(() => toast("Flight updated from SimBrief")).catch(err => toast(err.message));
      if (m === "ng") this.ngAccount();
      if (m === "ngweb") this.ctx.open("navcharts", { icao: this.icao });
      if (m === "home") this.ctx.home();
    });
  }

  // ---------------------------------------------------------------- airports
  pickRole(role, anchor) {
    const f = getFlight();
    const a = role === "FROM" ? f?.orig : role === "TO" ? f?.dest : f?.altn;
    if (a?.icao) this.loadAirport(a.icao, role);
    else this.search(anchor);
  }

  async loadAirport(icao, role = "OTHER", force = false) {
    icao = icao.toUpperCase();
    const changed = icao !== this.icao;
    this.icao = icao; this.role = role;
    this.ap = await getAirport(icao);
    if (!this.ap) { toast(`${icao} not found`); return; }
    if (changed || force) {
      this.index = this.generated(this.ap);
      this.metarDecoded = null;
      metar(icao).then(m => { if (this.icao === icao) { this.metarDecoded = decodeMetar(m); this.metarRaw = m; this.renderRight(); } });
      const local = await this.localCharts(icao);
      this.index.push(...local);
      this.setMode("ad");
      try {
        if (NG.isConfigured()) {
          const ng = await NG.chartIndex(icao);
          if (ng && this.icao === icao) this.index.push(...ng.map(c => ({ ...c, short: shortName(c.name) })));
        }
      } catch (e) { console.warn(e); toast("Navigraph: " + e.message); }
      // Lido charts from MSFS 2024 (via the in-sim Flight Bag Lido panel)
      lidoStatus().then(async st => {
        if (!st.bridge || this.icao !== icao) return;
        try {
          const lido = await lidoIndex(icao);
          if (this.icao !== icao) return;
          this.index.push(...lido);
          this.renderRight();
          if (lido.length && (!this.chart || this.chart.source === "gen" || this.chart.source === "amm")) this.autoSelect(this.role === "TO" ? "STAR" : this.role === "FROM" ? "SID" : "TAXI", false);
          toast(`${lido.length} Lido charts from MSFS 2024`);
        } catch (e) { toast("Lido: " + e.message); }
      });
      this.renderRight();
    } else this.setMode("ad");
    if (!this.chart || this.chart.icao !== icao) {
      const prev = this.sel[icao];
      const want = prev ? Object.values(prev)[0] : null;
      if (want) this.display(want);
      else this.autoSelect(this.role === "FROM" ? "TAXI" : this.role === "TO" ? "STAR" : "TAXI", false);
    }
  }

  generated(ap) {
    const f = getFlight();
    return [
      { source: "amm", id: "amm-" + ap.icao, icao: ap.icao, cat: "TAXI", index: "AMM", name: "AIRPORT MOVING MAP", short: "AMM", procs: [], runways: [] },
      { source: "gen", id: "gen-109-" + ap.icao, icao: ap.icao, cat: "TAXI", index: "10-9", name: "AIRPORT DIAGRAM", short: "10-9 AD", procs: [], runways: [] },
      { source: "gen", id: "gen-101p-" + ap.icao, icao: ap.icao, cat: "GEN", index: "10-1P", name: "AIRPORT INFORMATION", short: "10-1P INFO", procs: [], runways: [] },
    ].map(c => ({ ...c, airac: f?.airac }));
  }

  async localCharts(icao) {
    const recs = await files.listPrefix(`charts/${icao}/`);
    return recs.map(r => ({
      source: "local", id: r.id, icao, cat: r.folder.split("/")[2] || "GEN",
      index: r.meta.index || "", name: r.meta.name || r.name.replace(/\.[a-z]+$/i, ""), short: shortName(r.meta.name || r.name),
      procs: [], runways: r.meta.runways || [], rec: r,
    }));
  }

  autoSelect(cat, display = true, index) {
    let list = this.index.filter(c => c.cat === cat);
    if (index) list = list.filter(c => c.index === index).concat(list);
    const f = getFlight();
    const rwy = this.role === "FROM" ? f?.orig?.rwy : this.role === "TO" ? f?.dest?.rwy : null;
    const proc = this.role === "FROM" ? f?.sid : this.role === "TO" ? f?.star : null;
    const pick = (proc && list.find(c => c.procs.some(p => p.startsWith(proc)) || c.name.includes(proc))) ||
      (rwy && list.find(c => c.runways.includes(rwy))) || list.find(c => c.source === "navigraph" || c.source === "local") || list[0];
    if (pick) this.display(pick);
    else if (display) this.chartList(cat, $(`[data-cat="${cat}"]`, this.el));
  }

  // ---------------------------------------------------------------- chart list
  /** NOTAMs for the current aerodrome from the loaded OFP. */
  airportNotams() {
    const f = getFlight();
    const a = [f?.orig, f?.dest, ...(f?.altns || [])].find(x => x?.icao === this.icao);
    return a?.notams || [];
  }

  chartList(cat, anchor) {
    if (!this.icao) return this.search(anchor);
    const notams = cat === "GEN" ? this.airportNotams() : [];
    const list = this.index.filter(c => c.cat === cat);
    const rwys = [...new Set(list.flatMap(c => c.runways))].sort();
    const ngNote = list.some(c => c.source === "navigraph") ? ""
      : `<button class="c-ngbtn" data-ngweb><b>N</b><span>Open ${esc(this.icao)} ${CAT_NAMES[cat]} in Navigraph Charts<small>Sign in with your Navigraph account</small></span><em>›</em></button>`;
    const body = html(`<div class="c-pop list">
      <header><b>${esc(this.icao)}</b> · ${CAT_NAMES[cat]} <span class="dim">${list.length} chart${list.length === 1 ? "" : "s"}</span></header>
      ${rwys.length ? `<div class="chips"><button class="on" data-rw="">ALL</button>${rwys.map(r => `<button data-rw="${esc(r)}">${esc(r)}</button>`).join("")}</div>` : ""}
      <div class="rows">${list.map(c => `<button class="row ${this.chart?.id === c.id ? "on" : ""}" data-id="${esc(c.id)}" data-rws="${esc(c.runways.join(" "))}"><span class="idx">${esc(c.index)}</span><span class="nm">${esc(c.name)}</span>${c.source === "local" ? `<span class="tag">PDF</span>` : c.source === "gen" ? `<span class="tag">GEN</span>` : c.source === "lido" ? `<span class="tag lido">LIDO</span>` : ""}</button>`).join("") || `<div class="c-note">No ${CAT_NAMES[cat]} charts available.</div>`}</div>
      ${notams.length ? `<div class="c-notams"><h5>NOTAM <span>${notams.length}</span></h5>${notams.map(n => `<article><b>${esc(n.id || "")}</b><p>${esc(n.text)}</p></article>`).join("")}</div>` : ""}
      ${ngNote}</div>`);
    const p = popover(anchor, body, { side: this.mode === "ad" && anchor.closest(".c-right") ? "left" : "bottom", width: 460 });
    on(p.el, "click", "[data-id]", (e, b) => { closePopovers(); this.display(this.index.find(c => c.id === b.dataset.id)); });
    on(p.el, "click", "[data-ngweb]", () => { closePopovers(); this.ctx.open("navcharts", { icao: this.icao }); });
    on(p.el, "click", "[data-rw]", (e, b) => {
      $$("[data-rw]", p.el).forEach(x => x.classList.toggle("on", x === b));
      $$(".row", p.el).forEach(r => { r.style.display = !b.dataset.rw || r.dataset.rws.split(" ").includes(b.dataset.rw) ? "" : "none"; });
    });
  }

  // ---------------------------------------------------------------- display
  async display(chart, keepView = false) {
    if (!chart) return;
    this.setModeIfNeeded();
    const prevId = this.chart?.id;
    this.chart = chart;
    (this.sel[chart.icao] ||= {})[chart.cat] = chart;
    this.renderTop(); this.renderRight();
    this.el.classList.toggle("amm-on", chart.source === "amm");
    if (chart.source === "amm") return this.showAmm(chart);
    const rot = $(".c-rot", this.el), empty = $(".c-empty", this.el);
    empty.innerHTML = `<div class="spinner"></div>`; empty.style.display = "grid";
    rot.classList.toggle("invert", false);
    let w = PAGE_W, h = PAGE_H;
    try {
      if (chart.source === "gen") {
        const ap = await getAirport(chart.icao);
        rot.innerHTML = chart.index === "10-9" ? airportDiagram(ap, { airac: chart.airac }) : airportInfo(ap, { airac: chart.airac, metar: this.metarRaw || "" });
        rot.classList.toggle("invert", this.night);
      } else if (chart.source === "navigraph") {
        const url = await NG.chartImage(chart, this.night ? "dark" : "light");
        const img = await loadImg(url);
        rot.innerHTML = ""; rot.append(img);
        w = img.naturalWidth; h = img.naturalHeight;
      } else if (chart.source === "local") {
        ({ w, h } = await renderFile(chart.rec, rot));
        rot.classList.toggle("invert", this.night);
      } else if (chart.source === "lido") {
        const urls = await lidoPageImages(chart, this.night);
        if (!urls.length) throw new Error("No image for this Lido chart");
        const imgs = await Promise.all(urls.map(loadImg));
        rot.innerHTML = "";
        const col = document.createElement("div"); col.className = "pdf-pages";
        imgs.forEach(i => col.append(i));
        rot.append(col);
        w = Math.max(...imgs.map(i => i.naturalWidth)); h = imgs.reduce((a, i) => a + i.naturalHeight, 0) + (imgs.length - 1) * 12;
      }
      if (this.chart !== chart) return;
      empty.style.display = "none";
      const r = this.rot;
      const sw = r % 180 ? h : w, sh = r % 180 ? w : h;
      rot.style.width = w + "px"; rot.style.height = h + "px";
      rot.style.transform = r ? `translate(${(sw - w) / 2}px, ${(sh - h) / 2}px) rotate(${r}deg)` : "";
      $(".c-page", this.el).style.width = sw + "px"; $(".c-page", this.el).style.height = sh + "px";
      this.pageSize = { w: sw, h: sh };
      if (!keepView || prevId !== chart.id) this.fit(); else if (keepView) this.fit();
    } catch (e) {
      console.error(e);
      empty.innerHTML = `<div class="c-err">Could not display chart<br><small>${esc(e.message)}</small></div>`;
    }
  }
  // ---------------------------------------------------------------- airport moving map
  async showAmm(chart) {
    const box = $(".c-amm-map", this.el), msg = $(".c-amm-msg", this.el);
    if (!this.amm) {
      this.amm = M.createMap(box, { center: [this.ap.lat, this.ap.lon], zoom: 14, minZoom: 11, maxZoom: 19 });
      this.amm.attributionControl.addAttribution("Ground data © OpenStreetMap contributors");
      this.ammOwn = M.ownship(this.amm, { color: "#ffffff", outline: "#d22fc9", size: 40, trailColor: "#d22fc9" });
      this.amm.on("dragstart", () => { this.ammOwn.follow = false; $('[data-amm="follow"]', this.el).classList.remove("on"); });
      $(".c-amm-bar input", this.el).addEventListener("input", e => {
        const v = e.target.value.trim().toUpperCase();
        $$(".c-amm-bar [data-twy]", this.el).forEach(x => x.classList.toggle("on", x.dataset.twy === v));
        const b = v && this.ammLayer?.search(v);
        if (b) this.amm.fitBounds(b, { padding: [50, 50], maxZoom: 17 });
        if (!v) this.ammLayer?.clearSearch();
      });
    }
    setTimeout(() => this.amm.invalidateSize(), 30);
    if (this.ammIcao === chart.icao) return;
    this.ammLayer?.remove(); this.ammLayer = null;
    this.ammIcao = chart.icao;
    this.amm.setView([this.ap.lat, this.ap.lon], 14);
    msg.innerHTML = `<div class="spinner dark"></div><span>Loading ground data for ${esc(chart.icao)}…</span>`; msg.style.display = "flex";
    try {
      const data = await fetchGround(chart.icao, this.ap.lat, this.ap.lon);
      if (this.ammIcao !== chart.icao) return;
      this.ammLayer = groundLayer(this.amm, data, { theme: this.night ? "night" : "day" }).addTo(this.amm);
      if (this.ammLayer.bounds) this.amm.fitBounds(this.ammLayer.bounds, { padding: [20, 20] });
      $(".c-amm-bar .chips", this.el).innerHTML = this.ammLayer.refs.slice(0, 40).map(r => `<button data-twy="${esc(r)}">${esc(r)}</button>`).join("");
      msg.style.display = this.ammLayer.empty ? "flex" : "none";
      msg.innerHTML = `<span>No taxiway data for ${esc(chart.icao)} in OpenStreetMap – showing what is mapped.</span>`;
      this.ammOwn.update(simState());
    } catch (e) {
      msg.innerHTML = `<span>Ground data unavailable (${esc(e.message)}). Check the connection and try again.</span>`;
      this.ammIcao = null;
    }
  }
  ammAct(a, b) {
    if (a === "fit" && this.ammLayer?.bounds) { this.ammOwn.follow = false; $('[data-amm="follow"]', this.el).classList.remove("on"); this.amm.fitBounds(this.ammLayer.bounds, { padding: [20, 20] }); }
    if (a === "follow") {
      const s = simState();
      if (!s.connected) return toast(s.status || "No aircraft connected");
      this.ammOwn.follow = !this.ammOwn.follow;
      b.classList.toggle("on", this.ammOwn.follow);
      if (this.ammOwn.follow) this.amm.setView([s.lat, s.lon], 16.5);
    }
  }

  setModeIfNeeded() { if (this.mode !== "ad") this.setMode("ad"); }
  fit() { if (this.pageSize) this.pz.fit(this.pageSize.w, this.pageSize.h, this.pageSize.w > this.pageSize.h ? "contain" : "contain"); }

  bookmark() {
    if (!this.chart) return toast("Open a chart first");
    const bm = kv.get("bookmarks", []);
    const c = this.chart;
    const key = c.source + c.id;
    if (bm.some(b => b.key === key)) return toast("Already in USER");
    bm.push({ key, icao: c.icao, cat: c.cat, id: c.id, index: c.index, name: c.name, source: c.source });
    kv.set("bookmarks", bm);
    toast(`${c.icao} ${c.index} added to USER`);
    this.renderRight();
  }

  userPop(anchor) {
    const bm = kv.get("bookmarks", []);
    const p = popover(anchor, `<div class="c-pop list"><header><b>USER</b> · bookmarks</header><div class="rows">
      ${bm.map((b, i) => `<div class="row"><button class="go" data-i="${i}"><span class="idx">${esc(b.icao)} ${esc(b.index)}</span><span class="nm">${esc(b.name)}</span></button><button class="del" data-del="${i}">${UI.x}</button></div>`).join("") || `<div class="c-note">Use the paperclip button to add the current chart.</div>`}
    </div></div>`, { side: "left", width: 420 });
    on(p.el, "click", "[data-i]", async (e, b) => {
      closePopovers();
      const m = bm[+b.dataset.i];
      if (m.icao !== this.icao) await this.loadAirport(m.icao, "OTHER");
      const c = this.index.find(x => x.id === m.id);
      c ? this.display(c) : toast("Chart no longer available");
    });
    on(p.el, "click", "[data-del]", (e, b) => { bm.splice(+b.dataset.del, 1); kv.set("bookmarks", bm); closePopovers(); this.renderRight(); });
  }

  // ---------------------------------------------------------------- popovers
  search(anchor) {
    const body = html(`<div class="c-pop search"><input placeholder="ICAO, IATA, name or city" autocomplete="off" spellcheck="false"><div class="rows"></div></div>`);
    const p = popover(anchor, body, { side: "right", width: 400 });
    const inp = $("input", p.el), rows = $(".rows", p.el);
    const run = async () => {
      const res = await searchAirports(inp.value, 25);
      rows.innerHTML = res.map(a => `<button class="row" data-icao="${a.icao}"><span class="idx mag">${a.icao}</span><span class="nm">${esc(a.name)}<small>${esc([a.city, a.country].filter(Boolean).join(", "))}</small></span></button>`).join("");
    };
    inp.addEventListener("input", run);
    inp.addEventListener("keydown", e => { if (e.key === "Enter") $(".row", rows)?.click(); });
    on(p.el, "click", "[data-icao]", (e, b) => {
      closePopovers();
      if (this.mode === "enr" && this.map) {
        getAirport(b.dataset.icao).then(ap => { this.map.setView([ap.lat, ap.lon], 8); });
      } else this.loadAirport(b.dataset.icao, "OTHER");
    });
    setTimeout(() => inp.focus(), 50);
  }

  airportsPop(anchor) {
    const f = getFlight();
    const items = [["FROM", f?.orig], ["TO", f?.dest], ["ALTN", f?.altn], ...(f?.altns || []).slice(1).map(a => ["ALTN", a])].filter(([, a]) => a?.icao);
    const p = popover(anchor, `<div class="c-pop list"><header><b>Aerodromes</b></header><div class="rows">
      ${items.map(([r, a]) => `<button class="row ${a.icao === this.icao ? "on" : ""}" data-ap="${a.icao}" data-r="${r}"><span class="idx">${r}</span><span class="nm"><b class="mag">${a.icao}</b> ${esc(a.name || "")}</span></button>`).join("")}
      <button class="row" data-other><span class="idx">${UI.search}</span><span class="nm">Other airport…</span></button></div></div>`, { width: 400 });
    on(p.el, "click", "[data-ap]", (e, b) => { closePopovers(); this.loadAirport(b.dataset.ap, b.dataset.r); });
    on(p.el, "click", "[data-other]", () => { closePopovers(); this.search(anchor); });
  }

  flightPop(anchor) {
    const f = getFlight();
    const p = popover(anchor, `<div class="c-pop info">
      ${f ? `<h3>${esc(f.callsign || "Flight")}</h3><p>${esc(f.orig?.icao)} → ${esc(f.dest?.icao)} · ${esc(f.aircraft?.icao || "")} ${esc(f.aircraft?.reg || "")}</p><p class="dim">Source: ${f.source === "simbrief" ? "SimBrief OFP " + esc(f.id || "") : "manual entry"}</p>` : `<p>No flight loaded.</p>`}
      <div class="btns"><button class="ios-btn small" data-x="sb">Load SimBrief</button><button class="ios-btn small secondary" data-x="brief">Open Briefing</button></div></div>`, { width: 330 });
    on(p.el, "click", "[data-x]", (e, b) => {
      closePopovers();
      if (b.dataset.x === "sb") fetchSimbrief().then(() => toast("Flight loaded")).catch(err => toast(err.message));
      else this.ctx.open("briefing");
    });
  }

  routePop(anchor) {
    const f = getFlight();
    popover(anchor, `<div class="c-pop info route"><h3>ROUTE</h3>
      ${f ? `<p class="mono"><b class="mag">${esc(f.orig?.icao)}</b>${f.orig?.rwy ? "/" + esc(f.orig.rwy) : ""} ${esc(f.route || "DCT")} <b class="mag">${esc(f.dest?.icao)}</b>${f.dest?.rwy ? "/" + esc(f.dest.rwy) : ""}</p>
      <p class="dim">${f.distance ? f.distance + " NM · " : ""}${f.cruiseAlt ? "FL" + Math.round(f.cruiseAlt / 100) : ""}${f.altn ? " · ALTN " + esc(f.altn.icao) : ""}</p>` : `<p>No route loaded.</p>`}</div>`, { side: "left", width: 460 });
  }

  // ---------------------------------------------------------------- documents
  async docsPanel(anchor) {
    const counts = await Promise.all(DOC_FOLDERS.map(f => files.count("docs/" + f)));
    const adCharts = await files.listPrefix("charts/");
    const byAp = {};
    for (const r of adCharts) (byAp[r.folder.split("/")[1]] ||= []).push(r);
    const bm = kv.get("bookmarks", []);
    const body = html(`<div class="c-docs">
      <div class="d-head"><button class="dim">Print</button><div class="seg"><button class="on" data-tab="docs">Documents</button><button data-tab="bm">Bookmarks(<i>${bm.length}</i>)</button></div><button data-edit>Edit</button></div>
      <div class="d-search">${UI.search}<input placeholder="Search"><button data-cancel>Cancel</button></div>
      <div class="d-body">
        <div class="d-tab" data-pane="docs">
          <button class="d-row teal open" data-tog="cdg"><i class="tri"></i>COMPANY DOCS GENERAL<span class="dot"></span></button>
          <div class="d-sub" data-sub="cdg">${DOC_FOLDERS.map((f, i) => `<button class="d-row grey" data-folder="${esc(f)}"><i class="tri"></i><em>${esc(f)}</em><span class="cnt">${counts[i] ? "●" : ""}(${counts[i]})</span></button><div class="d-sub hidden" data-files="${esc(f)}"></div>`).join("")}</div>
          <button class="d-row teal" data-tog="adc"><i class="tri"></i>AD CHARTS</button>
          <div class="d-sub hidden" data-sub="adc">${Object.keys(byAp).sort().map(k => `<button class="d-row grey" data-apt="${k}"><i class="tri"></i><em>${k}</em><span class="cnt">(${byAp[k].length})</span></button>`).join("") || `<div class="d-empty">No imported aerodrome charts. Use MENU › Import charts.</div>`}</div>
          <button class="d-row teal" data-guide><i class="tri"></i>CHARTS GUIDE</button>
        </div>
        <div class="d-tab hidden" data-pane="bm">${bm.map((b, i) => `<button class="d-row grey" data-bm="${i}"><em>${esc(b.icao)} ${esc(b.index)} ${esc(b.name)}</em></button>`).join("") || `<div class="d-empty">No bookmarks.</div>`}</div>
      </div></div>`);
    const p = popover(anchor, body, { side: "right", width: 430 });
    on(p.el, "click", "[data-tab]", (e, b) => {
      $$("[data-tab]", p.el).forEach(x => x.classList.toggle("on", x === b));
      $$("[data-pane]", p.el).forEach(x => x.classList.toggle("hidden", x.dataset.pane !== b.dataset.tab));
    });
    on(p.el, "click", "[data-tog]", (e, b) => { b.classList.toggle("open"); $(`[data-sub="${b.dataset.tog}"]`, p.el).classList.toggle("hidden"); });
    on(p.el, "click", "[data-folder]", async (e, b) => {
      const box = $(`[data-files="${CSS.escape(b.dataset.folder)}"]`, p.el);
      b.classList.toggle("open");
      if (!box.classList.toggle("hidden")) {
        const list = await files.list("docs/" + b.dataset.folder);
        box.innerHTML = list.map(r => `<button class="d-row file" data-file="${r.id}">${UI.doc}<em>${esc(r.name)}</em></button>`).join("") || `<div class="d-empty">Empty – add PDFs in the Library app.</div>`;
      }
    });
    on(p.el, "click", "[data-file]", async (e, b) => { closePopovers(); this.openDoc(await files.get(b.dataset.file)); });
    on(p.el, "click", "[data-apt]", (e, b) => { closePopovers(); this.loadAirport(b.dataset.apt, "OTHER"); });
    on(p.el, "click", "[data-bm]", (e, b) => { closePopovers(); const m = bm[+b.dataset.bm]; this.loadAirport(m.icao, "OTHER").then(() => { const c = this.index.find(x => x.id === m.id); if (c) this.display(c); }); });
    on(p.el, "click", "[data-guide]", () => { closePopovers(); this.guide(); });
    on(p.el, "click", "[data-edit]", () => { closePopovers(); this.ctx.open("library"); });
    on(p.el, "click", "[data-cancel]", () => closePopovers());
    $("input", p.el).addEventListener("input", e => {
      const q = e.target.value.toUpperCase();
      $$(".d-row", p.el).forEach(r => { r.style.display = !q || r.textContent.toUpperCase().includes(q) || r.classList.contains("teal") ? "" : "none"; });
    });
  }

  async openDoc(rec) {
    if (!rec) return;
    this.chart = { source: "local", id: rec.id, icao: this.icao, cat: "GEN", index: "DOC", name: rec.name.replace(/\.[a-z]+$/i, ""), procs: [], runways: [], rec };
    this.display(this.chart);
  }

  guide() {
    modal({
      title: "Charts guide", width: 600, body: `
      <p><b>ENR view</b> – the enroute map shows your SimBrief route, airports, navaids, FIR boundaries, radar and SIGMETs. Toggle layers on the left; SCALE, AIRSPACE, COM (live VATSIM frequencies), ERA (enroute alternates) on the right.</p>
      <p><b>FROM / TO / ALTN</b> – tap to open that aerodrome's charts. The right column groups charts into GEN, SID/STAR, APPR and TAXI. The selected chart name is shown in teal.</p>
      <p><b>Jeppesen charts via Navigraph</b> – add your Navigraph developer client in Settings, then MENU › Navigraph account to sign in with your Navigraph account (Charts subscription required).</p>
      <p><b>Own charts</b> – MENU › Import charts lets you add PDF or image charts per airport and category. They are stored on this device only.</p>
      <p><b>Generated pages</b> – 10-9 airport diagram and 10-1P airport information are drawn from open data for every airport. They are for simulation only.</p>
      <p><b>Viewer</b> – drag to pan, pinch / scroll to zoom, double-tap to zoom in. Paperclip adds the chart to USER.</p>` });
  }

  importDialog() {
    const body = html(`<div class="form">
      <label>Airport (ICAO)<input name="icao" value="${esc(this.icao || getFlight()?.orig?.icao || "")}" maxlength="4" style="text-transform:uppercase"></label>
      <label>Category<select name="cat">${CATS.map(c => `<option>${c}</option>`).join("")}</select></label>
      <label>Chart index (optional)<input name="index" placeholder="e.g. 30-1"></label>
      <label>Runways (optional)<input name="rwys" placeholder="e.g. 02L 02C"></label>
      <label>Files<input type="file" name="file" accept="application/pdf,image/*" multiple></label>
      <button class="ios-btn" data-go>Import</button></div>`);
    const m = modal({ title: "Import charts", body, done: "Close" });
    $("[data-go]", body).addEventListener("click", async () => {
      const icao = $("[name=icao]", body).value.trim().toUpperCase();
      const fl = $("[name=file]", body).files;
      if (!/^[A-Z0-9]{4}$/.test(icao)) return toast("Enter a 4-letter ICAO code");
      if (!fl.length) return toast("Choose one or more files");
      const cat = $("[name=cat]", body).value, idx = $("[name=index]", body).value.trim();
      const runways = $("[name=rwys]", body).value.trim().split(/[\s,]+/).filter(Boolean);
      for (const f of fl) await files.put(`charts/${icao}/${cat}`, f, { index: idx, name: f.name.replace(/\.[a-z]+$/i, ""), runways });
      m.close();
      toast(`${fl.length} chart${fl.length > 1 ? "s" : ""} imported for ${icao}`);
      this.loadAirport(icao, this.icao === icao ? this.role : "OTHER", true);
    });
  }

  async ngAccount() {
    const user = await NG.currentUser().catch(() => null);
    if (user) {
      const m = modal({ title: "Navigraph", body: `<p>Signed in as <b>${esc(user.preferred_username)}</b>.</p><p class="dim">Subscriptions: ${esc((user.subscriptions || []).join(", ") || "none")}</p><button class="ios-btn secondary" data-out style="background:#e5e5ea;color:#d00">Sign out</button>` });
      $("[data-out]", m.el).onclick = async () => { await NG.signOut(); m.close(); toast("Signed out of Navigraph"); };
      return;
    }
    const m = modal({ title: "Sign in to Navigraph", done: "Cancel", body: `<div class="ng-flow"><div class="spinner dark"></div><p>Requesting a sign-in code…</p></div>` });
    try {
      const s = await NG.signIn(async p => {
        let qr = "";
        try {
          await loadScript("https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js");
          const q = window.qrcode(0, "M"); q.addData(p.verification_uri_complete); q.make(); qr = q.createSvgTag({ cellSize: 4, margin: 2 });
        } catch { /* QR optional */ }
        $(".ng-flow", m.el).innerHTML = `${qr}<p>Scan the code, or open<br><a href="${esc(p.verification_uri_complete)}" target="_blank" rel="noopener">${esc(p.verification_uri)}</a><br>and enter</p><div class="ng-code">${esc(p.user_code)}</div><p class="dim">Waiting for confirmation…</p>`;
      });
      m.el.addEventListener("click", e => { if (e.target.closest("[data-x]")) s.cancel(); });
      const u = await s.promise;
      m.close();
      toast(`Signed in as ${u.preferred_username}`);
    } catch (e) {
      $(".ng-flow", m.el).innerHTML = `<p style="color:#c00">${esc(e.message || "Sign-in failed")}</p>`;
    }
  }

  // ---------------------------------------------------------------- ENR map
  async initMap() {
    if (this.map) return;
    const f = getFlight();
    this.map = M.createMap($(".c-map", this.el), { center: f?.orig ? [f.orig.lat, f.orig.lon] : [5, 102], zoom: 5 });
    this.map.attributionControl.addAttribution("Natural Earth · OurAirports · VATSpy");
    this.map.on("zoomend moveend", () => this.updateScale());
    this.own = M.ownship(this.map, { color: "#ffffff", outline: "#d22fc9", size: 32, trailColor: "#d22fc9" });
    this.map.on("dragstart", () => { if (this.own.follow) { this.own.follow = false; this.renderRight(); } });
    this.bm = M.basemap(this.map, "charts");
    this.bm.setLabels(this.layers.lbl !== false);
    on(this.el, "click", "[data-z]", (e, b) => (b.dataset.z === "in" ? this.map.zoomIn(0.75) : this.map.zoomOut(0.75)));
    this.lyr = {};
    this.lyr.ad = await M.airportLayer(this.map, { highlight: this.flightAirports(), color: "#2b7d69" });
    this.lyr.nav = await M.navaidLayer(this.map, { ndb: this.enr.airspace === "LOW" });
    M.firLayer(this.map, "charts").then(l => { this.lyr.fir = l; this.applyLayers(); }).catch(() => {});
    this.refreshRoute();
    this.applyLayers();
    this.updateScale();
  }
  flightAirports() {
    const f = getFlight();
    return [f?.orig?.icao, f?.dest?.icao, ...(f?.altns || []).map(a => a.icao), ...(this.enr.era ? f?.enrouteAlts || [] : [])].filter(Boolean);
  }
  refreshRoute() {
    if (!this.map) return;
    const f = getFlight();
    this.lyr.route?.remove(); this.lyr.awy?.remove();
    this.lyr.route = M.routeLayer(f, { color: "#d22fc9", labels: this.layers.wpt });
    this.lyr.awy = M.airwayLabels(f);
    if (this.lyr.route.bounds?.isValid()) this.map.fitBounds(this.lyr.route.bounds, { padding: [40, 40] });
    this.lyr.route.addTo(this.map);
    this.applyLayers();
  }
  async toggleLayer(k, b) {
    this.layers[k] = !this.layers[k];
    b.classList.toggle("on", this.layers[k]);
    kv.set("charts.layers", this.layers);
    if (k === "wpt") return this.refreshRoute();
    if (k === "lbl") return this.bm?.setLabels(this.layers.lbl);
    if (k === "wx" && !this.lyr.wx && this.layers.wx) {
      try { const r = await M.radar(this.map); this.lyr.wx = r.layer; } catch { toast("Radar unavailable"); }
    }
    if (k === "sig" && !this.lyr.sig && this.layers.sig) {
      this.lyr.sig = await M.sigmetLayer({ fd: false });
      if (this.lyr.sig.unavailable) toast("SIGMET source not reachable (needs the PHP weather proxy)");
      else toast(`${this.lyr.sig.count} SIGMETs`);
    }
    this.applyLayers();
  }
  applyLayers() {
    if (!this.map) return;
    for (const k of ["ad", "nav", "fir", "awy", "wx", "sig"]) {
      const l = this.lyr[k];
      if (!l) continue;
      if (this.layers[k] && !this.map.hasLayer(l)) l.addTo(this.map);
      if (!this.layers[k] && this.map.hasLayer(l)) l.remove();
    }
    if (this.lyr.fir?.labels) this.layers.fir ? this.lyr.fir.labels.addTo(this.map) : this.lyr.fir.labels.remove();
    if (this.lyr.atc) this.enr.com ? this.lyr.atc.addTo(this.map) : this.lyr.atc.remove();
  }
  updateScale() {
    if (!this.map) return;
    const b = this.map.getBounds(), c = b.getCenter();
    const nm = distNM(c.lat, b.getWest(), c.lat, b.getEast());
    const v = $(".scale-v", this.el); if (v) v.textContent = `${Math.round(nm)}NM`;
    // scale bar: a round number of NM ~ 140px
    const px = 140, perPx = nm / this.map.getSize().x, raw = perPx * px;
    const nice = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000].find(n => n >= raw) || 2000;
    const bar = $(".c-scalebar .bar", this.el);
    if (bar) {
      bar.style.width = nice / perPx + "px";
      $(".c-scalebar .mid", this.el).textContent = nice / 2;
      $(".c-scalebar .end", this.el).textContent = nice + "NM";
    }
  }
  async enrToggle(k) {
    if (k === "scale") {
      const presets = [25, 50, 100, 250, 500, 1000, 2000];
      const b = this.map.getBounds(), c = b.getCenter();
      const nm = distNM(c.lat, b.getWest(), c.lat, b.getEast());
      const next = presets.find(p => p > nm * 1.05) || presets[0];
      this.map.setZoom(this.map.getZoom() - Math.log2(next / nm));
      return;
    }
    if (k === "airspace") { this.enr.airspace = this.enr.airspace === "HIGH" ? "LOW" : "HIGH"; this.lyr.nav?.setNdb(this.enr.airspace === "LOW"); }
    if (k === "com") {
      this.enr.com = !this.enr.com;
      if (this.enr.com) {
        try {
          const firs = this.lyr.fir || await M.firLayer(this.map, "charts");
          this.lyr.atc?.remove();
          this.lyr.atc = await M.vatsimAtc(firs);
          toast(this.lyr.atc.count ? `${this.lyr.atc.count} FIRs with live VATSIM ATC` : "No VATSIM centre controllers online");
          clearInterval(this.atcTimer);
          this.atcTimer = setInterval(() => this.enr.com && M.vatsimAtc(firs).then(l => { this.lyr.atc.remove(); this.lyr.atc = l; this.applyLayers(); }), 120e3);
        } catch { toast("VATSIM data unavailable"); this.enr.com = false; }
      } else clearInterval(this.atcTimer);
    }
    if (k === "era") {
      this.enr.era = !this.enr.era;
      this.lyr.ad?.remove();
      this.lyr.ad = await M.airportLayer(this.map, { highlight: this.flightAirports(), color: "#2b7d69" });
      if (this.enr.era && !getFlight()?.enrouteAlts?.length) toast("No enroute alternates in the OFP");
    }
    if (k === "trk") toast("Track-up needs a live aircraft position – map is north-up");
    if (k === "pos") {
      const s = simState();
      if (s.connected) { this.own.follow = !this.own.follow; if (this.own.follow) this.map.setView([s.lat, s.lon], Math.max(this.map.getZoom(), 7)); }
      else { toast("No aircraft position – showing the route"); if (this.lyr.route?.bounds?.isValid()) this.map.fitBounds(this.lyr.route.bounds, { padding: [40, 40] }); }
    }
    this.applyLayers();
    this.renderRight();
  }
  mapOptions(anchor) {
    const p = popover(anchor, `<div class="c-pop menu">
      <button data-o="fit">Zoom to route</button>
      <button data-o="dep">Centre on departure</button>
      <button data-o="dest">Centre on destination</button>
      ${NG.isConfigured() && settings().navigraphTiles ? ["IFR HIGH", "IFR LOW", "VFR", "WORLD"].map(s => `<button data-ng="${s}">Navigraph ${s}</button>`).join("") + `<button data-ng="">Standard map</button>` : ""}</div>`, { side: "right", width: 260 });
    on(p.el, "click", "[data-ng]", async (e, b) => {
      closePopovers();
      this.ngLayer?.remove(); this.ngLayer = null;
      if (b.dataset.ng) {
        try { this.ngLayer = (await M.navigraphTiles(this.map, b.dataset.ng, this.night ? "NIGHT" : "DAY")).addTo(this.map); this.bm.group.remove(); }
        catch (err) { toast(err.message); this.bm.group.addTo(this.map); }
      } else this.bm.group.addTo(this.map);
    });
    on(p.el, "click", "[data-o]", (e, b) => {
      closePopovers();
      const f = getFlight();
      if (b.dataset.o === "fit") this.enrToggle("pos");
      const a = b.dataset.o === "dep" ? f?.orig : b.dataset.o === "dest" ? f?.dest : null;
      if (a) this.map.setView([a.lat, a.lon], 8);
    });
  }
}

// ---------------------------------------------------------------- helpers
/** First line of a NOTAM's E) item, as on the GEN tile ("TEMPORARY CLOSURE OF TWY N4…"). */
function notamHeadline(t) {
  const e = t.split(/\bE\)\s*/)[1] || t;
  return e.replace(/\s+/g, " ").trim().slice(0, 110);
}
function shortName(n) {
  const m = n.match(/\b([A-Z]{3,6}\s?\d[A-Z]?)\b/);
  if (m) return m[1];
  return n.replace(/^(SID|STAR|ILS|RNP|RNAV|VOR|LOC|NDB)\s+/, "").slice(0, 18);
}
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("image failed")); i.src = src; });
}
async function renderFile(rec, into) {
  into.innerHTML = "";
  if (rec.type.startsWith("image/")) {
    const img = await loadImg(URL.createObjectURL(rec.blob));
    into.append(img);
    return { w: img.naturalWidth, h: img.naturalHeight };
  }
  await loadScript(`${PDFJS}/pdf.min.js`);
  const pdfjs = window.pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.js`;
  const doc = await pdfjs.getDocument({ data: await rec.blob.arrayBuffer() }).promise;
  let w = 0, h = 0;
  const col = document.createElement("div");
  col.className = "pdf-pages";
  into.append(col);
  for (let i = 1; i <= Math.min(doc.numPages, 60); i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 2 });
    const cv = document.createElement("canvas");
    cv.width = vp.width; cv.height = vp.height;
    cv.style.width = vp.width / 2 + "px"; cv.style.height = vp.height / 2 + "px";
    col.append(cv);
    await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
    w = Math.max(w, vp.width / 2); h += vp.height / 2 + (i > 1 ? 12 : 0);
  }
  return { w, h };
}
