// Briefing – SimBrief OFP: summary, full OFP, navlog, fuel/weights, weather,
// ATC flight plan, maps, and dispatching a new flight.
import { $, $$, html, esc, on, listen, toast, pad, secToHM, fmtNum } from "../core/ui.js";
import { settings, setSetting } from "../core/store.js";
import { getFlight, fetchSimbrief, manualFlight, dispatchUrl } from "../core/flight.js";
import { decodeMetar, CAT_COLOR } from "../core/wx.js";

export default { mount: (root, ctx) => new BriefingApp(root, ctx) };

const SECTIONS = [["summary", "Summary"], ["ofp", "OFP"], ["navlog", "Navlog"], ["fuel", "Fuel & Weights"], ["wx", "Weather"], ["atc", "ATC Flight Plan"], ["maps", "Maps"], ["new", "New Flight"]];
const z = ms => (ms ? `${pad(new Date(ms).getUTCHours())}${pad(new Date(ms).getUTCMinutes())}Z` : "—");

class BriefingApp {
  constructor(root, ctx) {
    this.root = root; this.ctx = ctx;
    this.sec = getFlight() ? "summary" : "new";
    root.innerHTML = `<div class="brf"><aside></aside><main><header></header><div class="pane"></div></main></div>`;
    on(root, "click", "[data-sec]", (e, b) => { this.sec = b.dataset.sec; this.render(); });
    on(root, "click", "[data-act]", (e, b) => this.act(b.dataset.act, b));
    on(root, "click", "[data-ch]", (e, b) => this.ctx.open("charts", { icao: b.dataset.ch }));
    this.unsub = [listen("flight", () => this.render())];
    this.render();
  }
  destroy() { this.unsub.forEach(u => u()); }

  render() {
    const f = getFlight();
    $("aside", this.root).innerHTML = `<div class="brand"><span class="sb">SB</span><div><b>Briefing</b><small>${f?.source === "simbrief" ? "SimBrief OFP " + esc(f.airac ? "· AIRAC " + f.airac : "") : f ? "Manual flight" : "No flight"}</small></div></div>
      ${SECTIONS.map(([k, l]) => `<button data-sec="${k}" class="${this.sec === k ? "on" : ""}" ${!f && k !== "new" ? "disabled" : ""}>${l}</button>`).join("")}
      <div class="foot">${settings().simbriefUser ? `SimBrief: <b>${esc(settings().simbriefUser)}</b>` : `<button data-act="setuser" class="link">Set SimBrief username</button>`}</div>`;
    $("header", this.root).innerHTML = `<div class="t">${f ? `<b>${esc(f.callsign || "—")}</b><span>${esc(f.orig?.icao)} → ${esc(f.dest?.icao)} · ${esc(f.aircraft?.icao || "")} ${esc(f.aircraft?.reg || "")}</span>` : `<b>New flight</b><span>Import or create a flight</span>`}</div>
      <div class="btns">${f?.pdf ? `<a class="ios-btn small secondary" href="${esc(f.pdf)}" target="_blank" rel="noopener">PDF</a>` : ""}<button class="ios-btn small" data-act="fetch">↓ Import latest OFP</button></div>`;
    const pane = $(".pane", this.root);
    pane.scrollTop = 0;
    pane.innerHTML = !f && this.sec !== "new" ? "" : this[this.sec](f);
    if (this.sec === "ofp") this.mountOfp(f);
    if (this.sec === "new") this.bindNew();
  }

  async act(a) {
    if (a === "fetch") {
      if (!settings().simbriefUser) return this.askUser();
      const b = $('[data-act="fetch"]', this.root); b.disabled = true; b.textContent = "Importing…";
      try { const f = await fetchSimbrief(); toast(`Imported ${f.callsign} ${f.orig.icao}–${f.dest.icao}`); this.sec = "summary"; this.render(); }
      catch (e) { toast(e.message); b.disabled = false; b.textContent = "↓ Import latest OFP"; }
    }
    if (a === "setuser") this.askUser();
  }
  askUser() {
    const u = prompt("SimBrief / Navigraph username (or numeric pilot ID):", settings().simbriefUser || "");
    if (u != null) { setSetting("simbriefUser", u.trim()); this.render(); if (u.trim()) this.act("fetch"); }
  }

  // ---------------------------------------------------------------- sections
  summary(f) {
    const w = f.weights || {}, fu = f.fuel || {};
    const bar = (v, max, lbl) => v && max ? `<div class="wbar"><div class="l"><span>${lbl}</span><b>${fmtNum(v)}</b><em>/ ${fmtNum(max)}</em></div><div class="track"><i style="width:${Math.min(100, (v / max) * 100)}%" class="${v > max ? "over" : ""}"></i></div></div>` : "";
    const apCard = (a, role) => {
      if (!a) return "";
      const m = decodeMetar(a.metar);
      return `<div class="apc"><div class="r"><span class="role">${role}</span>${m ? `<span class="cat" style="background:${CAT_COLOR[m.cat]}">${m.cat}</span>` : ""}</div><b>${esc(a.icao)}</b><small>${esc(a.name || "")}</small><div class="rw">${a.rwy ? "RWY " + esc(a.rwy) : ""}${a.elev != null ? ` · ELEV ${a.elev}` : ""}</div>
        <div class="acts"><button data-ch="${esc(a.icao)}">Charts</button></div></div>`;
    };
    return `<div class="sum">
      <div class="hero"><div class="ap"><b>${esc(f.orig.icao)}</b><span>${z(f.times?.off)}</span></div>
        <div class="mid"><span>${secToHM(f.times?.ete)}</span><div class="ln"><i>✈</i></div><span>${fmtNum(f.distance)} NM · FL${f.cruiseAlt ? Math.round(f.cruiseAlt / 100) : "—"}</span></div>
        <div class="ap"><b>${esc(f.dest.icao)}</b><span>${z(f.times?.on)}</span></div></div>
      <div class="cards">${apCard(f.orig, "DEPARTURE")}${apCard(f.dest, "ARRIVAL")}${(f.altns || []).map(a => apCard(a, "ALTERNATE")).join("")}</div>
      <div class="grid2">
        <section><h3>Flight</h3><dl>
          <dt>Callsign</dt><dd>${esc(f.callsign)}</dd><dt>Aircraft</dt><dd>${esc(f.aircraft?.name || f.aircraft?.icao || "—")} ${esc(f.aircraft?.reg || "")}</dd>
          <dt>Block out</dt><dd>${z(f.times?.out)}</dd><dt>Block time</dt><dd>${secToHM(f.times?.block)}</dd>
          <dt>Cost index</dt><dd>${esc(f.ci ?? "—")}</dd><dt>Avg wind</dt><dd>${f.avgWind?.dir != null ? `${pad(f.avgWind.dir, 3)}/${f.avgWind.spd} (${f.avgWind.comp > 0 ? "+" : ""}${f.avgWind.comp})` : "—"}</dd>
          <dt>Step climbs</dt><dd class="mono">${esc(f.stepclimbs || "—")}</dd><dt>Pax</dt><dd>${esc(f.pax ?? "—")}</dd></dl></section>
        <section><h3>Fuel <small>${esc(f.units || "kg").toUpperCase()}</small></h3><dl>
          <dt>Trip</dt><dd>${fmtNum(fu.enroute_burn)}</dd><dt>Contingency</dt><dd>${fmtNum(fu.contingency)}</dd><dt>Alternate</dt><dd>${fmtNum(fu.alternate_burn)}</dd>
          <dt>Final reserve</dt><dd>${fmtNum(fu.reserve)}</dd><dt>Extra</dt><dd>${fmtNum(fu.extra)}</dd><dt>Taxi</dt><dd>${fmtNum(fu.taxi)}</dd>
          <dt class="tot">Block fuel</dt><dd class="tot">${fmtNum(fu.plan_ramp)}</dd><dt>Takeoff fuel</dt><dd>${fmtNum(fu.plan_takeoff)}</dd><dt>Landing fuel</dt><dd>${fmtNum(fu.plan_landing)}</dd></dl></section>
      </div>
      <section><h3>Weights</h3>${bar(w.est_zfw, w.max_zfw, "ZFW")}${bar(w.est_tow, w.max_tow, "TOW")}${bar(w.est_ldw, w.max_ldw, "LDW")}${!w.est_zfw ? `<p class="dim">No weights in a manual flight.</p>` : ""}</section>
      <section><h3>Route</h3><p class="mono route">${esc(f.orig.icao)}${f.orig.rwy ? "/" + esc(f.orig.rwy) : ""} ${esc(f.route || "DCT")} ${esc(f.dest.icao)}${f.dest.rwy ? "/" + esc(f.dest.rwy) : ""}</p></section>
    </div>`;
  }

  ofp(f) {
    if (!f.planHtml) return `<div class="empty">The full OFP text is available for SimBrief flights.</div>`;
    return `<div class="ofp-wrap"><iframe class="ofp" sandbox="allow-same-origin" title="OFP"></iframe></div>`;
  }
  mountOfp(f) {
    const fr = $("iframe.ofp", this.root);
    if (!fr) return;
    fr.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:24px 28px;background:#fff;color:#111;font:13px/1.35 "Courier New",monospace}pre{white-space:pre;font:inherit}img{max-width:100%}a{color:#0645ad}</style></head><body>${f.planHtml}</body></html>`;
  }

  navlog(f) {
    return `<table class="nav"><thead><tr><th>WPT</th><th>VIA</th><th>ALT</th><th>MT</th><th>LEG/TTL NM</th><th>ETE</th><th>GS</th><th>WIND</th><th>OAT</th><th>FOB</th><th>MIN</th><th>FIR</th></tr></thead><tbody>
      ${(f.navlog || []).map((n, i, a) => `<tr class="${n.stage === "CLB" ? "clb" : n.stage === "DSC" ? "dsc" : ""}"><td><b>${esc(n.ident)}</b><small>${esc(n.name && n.name !== n.ident ? n.name : "")}</small></td><td>${esc(n.via || "")}</td>
        <td>${n.alt != null ? (n.alt >= 18000 ? "FL" + Math.round(n.alt / 100) : fmtNum(n.alt)) : ""}</td><td>${n.trk ?? ""}</td>
        <td>${n.dist != null ? Math.round(n.dist - (a[i - 1]?.dist || 0)) + " / " + Math.round(n.dist) : ""}</td><td>${secToHM(n.timeTotal)}</td><td>${n.gs ?? ""}</td><td>${esc(n.wind || "")}</td><td>${n.oat ?? ""}</td>
        <td>${n.fuelOnboard != null ? fmtNum(n.fuelOnboard) : ""}</td><td>${n.minFuel != null ? fmtNum(n.minFuel) : ""}</td><td>${esc(n.fir || "")}</td></tr>`).join("")}</tbody></table>`;
  }

  fuel(f) {
    const fu = f.fuel || {}, w = f.weights || {};
    const rows = (o, keys) => keys.filter(([k]) => o[k] != null).map(([k, l]) => `<dt>${l}</dt><dd>${fmtNum(o[k])}</dd>`).join("");
    return `<div class="grid2"><section><h3>Fuel</h3><dl>${rows(fu, [["taxi", "Taxi"], ["enroute_burn", "Trip"], ["contingency", "Contingency"], ["alternate_burn", "Alternate"], ["reserve", "Final reserve"], ["etops", "ETOPS"], ["extra", "Extra"], ["min_takeoff", "Min takeoff"], ["plan_takeoff", "Plan takeoff"], ["plan_ramp", "Block"], ["plan_landing", "Landing"], ["avg_fuel_flow", "Avg fuel flow /h"], ["max_tanks", "Tank capacity"]])}</dl></section>
      <section><h3>Weights</h3><dl>${rows(w, [["oew", "OEW"], ["pax_count", "Passengers"], ["cargo", "Cargo"], ["payload", "Payload"], ["est_zfw", "Est ZFW"], ["max_zfw", "Max ZFW"], ["est_tow", "Est TOW"], ["max_tow", "Max TOW"], ["est_ldw", "Est LDW"], ["max_ldw", "Max LDW"], ["est_ramp", "Ramp"]])}</dl></section></div>`;
  }

  wx(f) {
    const card = (a, role) => {
      if (!a) return "";
      const m = decodeMetar(a.metar);
      return `<section class="wxc"><h3>${role} · ${esc(a.icao)} ${m ? `<span class="cat" style="background:${CAT_COLOR[m.cat]}">${m.cat}</span>` : ""}</h3>
        ${m ? `<div class="dec"><span>Wind <b>${m.wind ? (m.wind.vrb ? "VRB" : pad(m.wind.dir, 3)) + "/" + m.wind.spd + (m.wind.gust ? "G" + m.wind.gust : "") + " kt" : "—"}</b></span><span>Vis <b>${m.visM >= 9999 ? "10 km+" : fmtNum(m.visM) + " m"}</b></span><span>Ceiling <b>${m.ceiling != null ? fmtNum(m.ceiling) + " ft" : "none"}</b></span><span>Temp <b>${m.temp ?? "—"}/${m.dew ?? "—"}</b></span><span>QNH <b>${m.qnh ?? "—"}</b></span></div>` : ""}
        <pre>${esc(a.metar || "No METAR")}</pre>${a.taf ? `<pre class="taf">${esc(a.taf)}</pre>` : ""}</section>`;
    };
    return card(f.orig, "Departure") + card(f.dest, "Arrival") + (f.altns || []).map(a => card(a, "Alternate")).join("");
  }

  atc(f) {
    return f.fpl ? `<section><h3>ICAO flight plan</h3><pre class="fpl">${esc(f.fpl)}</pre><button class="ios-btn small" onclick="navigator.clipboard.writeText(this.previousElementSibling.textContent)">Copy</button></section>
      ${f.firs?.length ? `<section><h3>FIRs</h3><p class="mono">${f.firs.map(esc).join(" › ")}</p></section>` : ""}` : `<div class="empty">ATC flight plan is available for SimBrief flights.</div>`;
  }

  maps(f) {
    return f.maps?.length ? `<div class="maps">${f.maps.map(m => `<figure><img src="${esc(m.url)}" alt="${esc(m.name)}" loading="lazy"><figcaption>${esc(m.name)}</figcaption></figure>`).join("")}</div>` : `<div class="empty">No OFP maps for this flight.</div>`;
  }

  // ---------------------------------------------------------------- new flight
  new() {
    const f = getFlight();
    const v = (k, d = "") => esc(this.draft?.[k] ?? d);
    return `<div class="newf">
      <section><h3>Import from SimBrief</h3>
        <p>Plan on SimBrief, then import the latest OFP for your account.</p>
        <div class="row"><input id="sbuser" placeholder="SimBrief username or pilot ID" value="${esc(settings().simbriefUser)}"><button class="ios-btn" data-act="fetch">Import latest OFP</button></div></section>
      <section><h3>Dispatch a new flight</h3>
        <div class="form grid">
          <label>Airline<input name="airline" value="${v("airline", f?.airline || "")}" placeholder="ABC"></label>
          <label>Flight no.<input name="fltnum" value="${v("fltnum", f?.fltnum || "")}" placeholder="123"></label>
          <label>Aircraft type<input name="type" value="${v("type", f?.aircraft?.icao || "B738")}" placeholder="B738"></label>
          <label>Registration<input name="reg" value="${v("reg", f?.aircraft?.reg || "")}"></label>
          <label>Origin<input name="orig" value="${v("orig", "")}" placeholder="WSSS"></label>
          <label>Destination<input name="dest" value="${v("dest", "")}" placeholder="VOCI"></label>
          <label>Alternate<input name="altn" value="${v("altn", "")}" placeholder="VOTV"></label>
          <label>Dep time (UTC)<input name="dep" value="${v("dep", "")}" placeholder="1300"></label>
          <label class="wide">Route (optional)<input name="route" value="${v("route", "")}" placeholder="Leave empty for automatic routing"></label>
        </div>
        <div class="btnrow">
          <button class="ios-btn" data-new="sb">Plan on SimBrief.com</button>
          <button class="ios-btn" data-new="api">Generate in-app (API)</button>
          <button class="ios-btn secondary" data-new="manual">Create offline flight</button>
        </div>
        <p class="dim small">“Plan on SimBrief.com” opens the dispatch page pre-filled; come back and tap Import. “Generate in-app” needs the PHP endpoint (api/simbrief.php) with your API key on the server. “Offline flight” builds a great-circle route without SimBrief.</p>
      </section></div>`;
  }
  bindNew() {
    const p = $(".pane", this.root);
    const read = () => Object.fromEntries($$(".newf input[name]", p).map(i => [i.name, i.value.trim().toUpperCase()]));
    $("#sbuser", p).addEventListener("change", e => setSetting("simbriefUser", e.target.value.trim()));
    $$("[data-new]", p).forEach(b => b.addEventListener("click", async () => {
      const d = this.draft = read();
      if (!d.orig || !d.dest) return toast("Enter origin and destination");
      if (b.dataset.new === "sb") {
        window.open(dispatchUrl({ airline: d.airline, fltnum: d.fltnum, type: d.type, reg: d.reg, orig: d.orig, dest: d.dest, altn: d.altn, route: d.route, deph: d.dep.slice(0, 2), depm: d.dep.slice(2, 4), units: settings().units === "lb" ? "LBS" : "KGS", navlog: 1, tlr: 1, notams: 1, maps: "detail" }), "_blank", "noopener");
        toast("Generate the OFP on SimBrief, then tap Import latest OFP");
      } else if (b.dataset.new === "api") this.apiGenerate(d);
      else {
        try { await manualFlight({ callsign: d.airline + d.fltnum, orig: d.orig, dest: d.dest, altn: d.altn, type: d.type, reg: d.reg }); toast("Offline flight created"); this.sec = "summary"; this.render(); }
        catch (e) { toast(e.message); }
      }
    }));
  }

  /** SimBrief API v1 flow: server signs the request with the API key, popup generates the OFP. */
  async apiGenerate(d) {
    const timestamp = Math.round(Date.now() / 1000);
    const outputpage = location.href.split("?")[0].replace("http://", "");
    let code;
    try {
      const r = await fetch(`api/simbrief.php?api_req=${encodeURIComponent(d.orig + d.dest + d.type + timestamp + outputpage)}`);
      code = (await r.json()).api_code;
    } catch { code = null; }
    if (!code) return toast("API endpoint not available – host the app with PHP and api/config.php, or use “Plan on SimBrief.com”");
    const params = { orig: d.orig, dest: d.dest, type: d.type, airline: d.airline, fltnum: d.fltnum, reg: d.reg, altn: d.altn, route: d.route, deph: d.dep.slice(0, 2), depm: d.dep.slice(2, 4), units: settings().units === "lb" ? "LBS" : "KGS", navlog: 1, tlr: 1, apicode: code, outputpage, timestamp };
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null));
    const w = window.open(`https://www.simbrief.com/ofp/ofp.loader.api.php?${q}`, "SBworker", "width=600,height=315");
    if (!w) return toast("Allow pop-ups to generate the flight plan");
    toast("Generating OFP on SimBrief…", 4000);
    const t = setInterval(async () => {
      if (!w.closed) return;
      clearInterval(t);
      try { const f = await fetchSimbrief(); toast(`OFP ready: ${f.orig.icao}–${f.dest.icao}`); this.sec = "summary"; this.render(); }
      catch (e) { toast(e.message); }
    }, 800);
  }
}
