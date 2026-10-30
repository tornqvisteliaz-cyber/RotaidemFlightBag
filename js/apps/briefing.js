// Briefing – SimBrief flight folder: summary, OFP, navlog, fuel & weights, weather,
// NOTAMs, ATC flight plan, maps, and dispatching new flights.
import { $, $$, html, esc, on, listen, toast, pad, secToHM, fmtNum } from "../core/ui.js";
import { settings, setSetting } from "../core/store.js";
import { getFlight, setFlight, fetchSimbrief, manualFlight, dispatchUrl } from "../core/flight.js";
import { decodeMetar, CAT_COLOR } from "../core/wx.js";
import { I } from "../core/sf.js";

export default { mount: (root, ctx) => new BriefingApp(root, ctx) };

const ic = d => `<svg class="sf" viewBox="0 0 24 24" fill="currentColor">${d}</svg>`;
const SEC = [
  ["summary", "Summary", I.today],
  ["ofp", "OFP", I.doc],
  ["navlog", "Navlog", ic(`<path d="M4 5h16v2H4zm0 6h16v2H4zm0 6h10v2H4z"/>`)],
  ["fuel", "Fuel & Weights", ic(`<path d="M6 2h8a2 2 0 0 1 2 2v7h1a2 2 0 0 1 2 2v4a1 1 0 0 0 2 0V8l-2-2 1.4-1.4L23 7.2V17a3 3 0 0 1-6 0v-4h-1v8H4V4a2 2 0 0 1 2-2zm0 2v6h8V4z"/>`)],
  ["wx", "Weather", I.cloud],
  ["notam", "NOTAMs", ic(`<path d="M12 2 1 21h22zm1 15h-2v2h2zm0-8h-2v6h2z"/>`)],
  ["atc", "ATC Flight Plan", I.plane],
  ["maps", "Maps", I.globe],
];
const z = ms => (ms ? `${pad(new Date(ms).getUTCHours())}${pad(new Date(ms).getUTCMinutes())}` : "----");
const SB_ERRORS = [
  [/unknown.*user|no user|invalid user/i, "SimBrief doesn't know that username or pilot ID. Check it in Settings › SimBrief."],
  [/no flight plan|not found|no ofp/i, "No flight plan found – generate one on SimBrief first."],
];
const friendly = m => (SB_ERRORS.find(([r]) => r.test(m))?.[1]) || m;

class BriefingApp {
  constructor(root, ctx) {
    this.root = root; this.ctx = ctx;
    this.sec = getFlight() ? "summary" : "start";
    this.ofpSize = +(localStorage.getItem("rfb.ofpSize") || 13);
    root.innerHTML = `<div class="bf"><aside></aside><main><nav class="bf-nav"></nav><div class="bf-banner hidden"></div><div class="bf-pane"></div></main></div>`;
    on(root, "click", "[data-sec]", (e, b) => { this.sec = b.dataset.sec; this.render(); });
    on(root, "click", "[data-act]", (e, b) => this.act(b.dataset.act, b));
    on(root, "click", "[data-ch]", (e, b) => this.ctx.open("charts", { icao: b.dataset.ch }));
    on(root, "click", "[data-new]", (e, b) => this.create(b.dataset.new));
    on(root, "keydown", "#bf-user", e => { if (e.key === "Enter") this.act("import"); });
    this.unsub = [listen("flight", () => { if (this.sec === "start") this.sec = "summary"; this.render(); })];
    this.render();
    if (!getFlight() && settings().simbriefUser) this.act("import");
  }
  destroy() { this.unsub.forEach(u => u()); }

  // ---------------------------------------------------------------- frame
  render() {
    const f = getFlight();
    const s = settings();
    $("aside", this.root).innerHTML = `
      <h1>Briefing</h1>
      ${f ? `<button class="bf-flight ${this.sec !== "start" && this.sec !== "new" ? "on" : ""}" data-sec="summary">
        <div class="r1"><b>${esc(f.callsign || "FLIGHT")}</b><span class="chip">${f.source === "simbrief" ? "OFP" + (f.airac ? " · " + esc(f.airac) : "") : "OFFLINE"}</span></div>
        <div class="r2"><span>${esc(f.orig?.icao)}</span><i></i><span>${esc(f.dest?.icao)}</span></div>
        <div class="r3">${esc(f.aircraft?.icao || "")} ${esc(f.aircraft?.reg || "")} · ${f.times?.out ? new Date(f.times.out).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }).toUpperCase() : ""}</div></button>` : ""}
      ${f ? `<div class="bf-list">${SEC.map(([k, l, icon]) => {
        const disabled = (k === "ofp" && !f.planHtml) || (k === "atc" && !f.fpl) || (k === "maps" && !f.maps?.length) || (k === "notam" && !this.notamCount(f));
        const badge = k === "notam" ? this.notamCount(f) : 0;
        return `<button data-sec="${k}" class="${this.sec === k ? "on" : ""}" ${disabled ? "disabled" : ""}>${icon}<span>${l}</span>${badge ? `<em>${badge}</em>` : ""}</button>`;
      }).join("")}</div>` : ""}
      <div class="bf-list"><button data-sec="new" class="${this.sec === "new" || this.sec === "start" ? "on" : ""}">${ic(`<path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z"/>`)}<span>New Flight</span></button></div>
      <div class="bf-acct"><span class="sb">SB</span><div><b>${esc(s.simbriefUser || "Not connected")}</b><small>SimBrief account</small></div><button data-act="account">${s.simbriefUser ? "Change" : "Connect"}</button></div>`;
    const titles = Object.fromEntries(SEC.map(([k, l]) => [k, l]));
    const title = this.sec === "start" ? "Welcome" : this.sec === "new" ? "New Flight" : titles[this.sec];
    $(".bf-nav", this.root).innerHTML = `<h2>${esc(title)}</h2><div class="tools">
      ${this.sec === "ofp" ? `<button data-act="smaller" title="Smaller text">A<small>−</small></button><button data-act="bigger" title="Larger text">A<small>+</small></button>` : ""}
      ${f?.pdf ? `<a class="tb" href="${esc(f.pdf)}" target="_blank" rel="noopener" title="OFP PDF">${ic(`<path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm1 11v5h1.5v-1.5h1a1.8 1.8 0 0 0 0-3.5zm1.5 1.2h.8a.6.6 0 0 1 0 1.2h-.8zM12 13v5h1.6a2.5 2.5 0 0 0 0-5zm1.5 1.2h.2a1.3 1.3 0 0 1 0 2.6h-.2zM16.5 13v5H18v-2h1.5v-1.1H18v-.8h1.8V13z"/>`)}</a>` : ""}
      ${s.simbriefUser ? `<button class="tb" data-act="import" title="Import latest OFP">${I.refresh}</button>` : ""}
    </div>`;
    const pane = $(".bf-pane", this.root);
    pane.scrollTop = 0;
    const fn = this["s_" + this.sec];
    pane.innerHTML = fn ? fn.call(this, f) : "";
    if (this.sec === "ofp") this.mountOfp(f);
  }
  banner(msg, kind = "err") {
    const b = $(".bf-banner", this.root);
    if (!msg) { b.classList.add("hidden"); return; }
    b.className = `bf-banner ${kind}`;
    b.innerHTML = `<span>${esc(msg)}</span><button data-act="dismiss">${ic(`<path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z"/>`)}</button>`;
  }
  notamCount(f) { return [f.orig, f.dest, ...(f.altns || [])].reduce((n, a) => n + (a?.notams?.length || 0), 0) + (f.enrouteNotams?.length || 0); }

  async act(a) {
    if (a === "dismiss") return this.banner(null);
    if (a === "smaller" || a === "bigger") {
      this.ofpSize = Math.max(9, Math.min(22, this.ofpSize + (a === "bigger" ? 1 : -1)));
      localStorage.setItem("rfb.ofpSize", this.ofpSize);
      return this.mountOfp(getFlight());
    }
    if (a === "account") { this.sec = getFlight() ? "new" : "start"; this.render(); setTimeout(() => $("#bf-user", this.root)?.focus(), 50); return; }
    if (a === "import") {
      const inp = $("#bf-user", this.root);
      if (inp && inp.value.trim()) setSetting("simbriefUser", inp.value.trim());
      if (!settings().simbriefUser) { this.banner("Enter your SimBrief username or pilot ID."); $("#bf-user", this.root)?.focus(); return; }
      this.banner(`Importing latest OFP for ${settings().simbriefUser}…`, "info");
      $$('[data-act="import"]', this.root).forEach(b => b.classList.add("spin"));
      try {
        const f = await fetchSimbrief();
        this.banner(null);
        toast(`${f.callsign} ${f.orig.icao} → ${f.dest.icao} imported`);
        this.sec = "summary"; this.render();
      } catch (e) {
        this.banner(friendly(e.message));
        $$('[data-act="import"]', this.root).forEach(b => b.classList.remove("spin"));
      }
    }
    if (a === "clear") { setFlight(null); this.sec = "start"; this.render(); }
  }

  // ---------------------------------------------------------------- start / new flight
  s_start() { return this.s_new(null, true); }
  s_new(f, welcome) {
    const s = settings(), d = this.draft || {};
    const v = (k, def = "") => esc(d[k] ?? def);
    return `<div class="bf-start">
      ${welcome ? `<div class="bf-hello">${I.plane}<h3>Plan with SimBrief</h3><p>Import your latest operational flight plan, or plan a new flight. Charts, OPT and the maps pick it up automatically.</p></div>` : ""}
      <section class="card import"><h4>Import from SimBrief</h4>
        <div class="row"><input id="bf-user" placeholder="SimBrief username or pilot ID" value="${esc(s.simbriefUser)}" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="ios-btn" data-act="import">Import Latest OFP</button></div>
        <p class="hint">Your Navigraph/SimBrief username, or the numeric Pilot ID from SimBrief › Account Settings.</p></section>
      <section class="card"><h4>Plan a new flight</h4>
        <div class="grid">
          ${[["airline", "Airline", "ABC"], ["fltnum", "Flight", "123"], ["type", "Aircraft", "B738"], ["reg", "Registration", ""], ["orig", "From", "WSSS"], ["dest", "To", "VOCI"], ["altn", "Alternate", "VOTV"], ["dep", "Dep (UTC)", "1300"]]
            .map(([k, l, ph]) => `<label><span>${l}</span><input name="${k}" placeholder="${ph}" value="${v(k, k === "type" ? (f?.aircraft?.icao || "") : k === "airline" ? (f?.airline || "") : "")}" autocomplete="off" autocapitalize="characters"></label>`).join("")}
          <label class="wide"><span>Route</span><input name="route" placeholder="Automatic" value="${v("route")}" autocomplete="off" autocapitalize="characters"></label>
        </div>
        <div class="btns">
          <button class="ios-btn" data-new="sb">Plan on SimBrief</button>
          <button class="ios-btn tinted" data-new="api">Generate in App</button>
          <button class="ios-btn plain" data-new="manual">Offline Flight</button>
        </div>
        <p class="hint"><b>Plan on SimBrief</b> opens the dispatch page pre-filled – come back and tap ${I.refresh} to import. <b>Generate in App</b> needs the PHP host with your API key. <b>Offline Flight</b> draws a great-circle route without SimBrief.</p></section>
      ${f ? `<button class="bf-clear" data-act="clear">Remove Current Flight</button>` : ""}</div>`;
  }
  readDraft() { return (this.draft = Object.fromEntries($$(".bf-start input[name]", this.root).map(i => [i.name, i.value.trim().toUpperCase()]))); }
  async create(kind) {
    const d = this.readDraft();
    if (!d.orig || !d.dest) return this.banner("Enter From and To.");
    if (kind === "sb") {
      window.open(dispatchUrl({ airline: d.airline, fltnum: d.fltnum, type: d.type, reg: d.reg, orig: d.orig, dest: d.dest, altn: d.altn, route: d.route, deph: d.dep.slice(0, 2), depm: d.dep.slice(2, 4), units: settings().units === "lb" ? "LBS" : "KGS", navlog: 1, tlr: 1, notams: 1, maps: "detail" }), "_blank", "noopener");
      this.banner("Generate the OFP on SimBrief, then tap the refresh button to import it.", "info");
    } else if (kind === "api") this.apiGenerate(d);
    else {
      try { await manualFlight({ callsign: d.airline + d.fltnum, orig: d.orig, dest: d.dest, altn: d.altn, type: d.type || "B738", reg: d.reg }); this.banner(null); toast("Offline flight created"); this.sec = "summary"; this.render(); }
      catch (e) { this.banner(e.message); }
    }
  }
  /** SimBrief API v1: the server signs the request with the API key, a popup generates the OFP. */
  async apiGenerate(d) {
    const timestamp = Math.round(Date.now() / 1000);
    const outputpage = location.href.split("?")[0].replace("http://", "");
    let code;
    try { code = (await (await fetch(`api/simbrief.php?api_req=${encodeURIComponent(d.orig + d.dest + d.type + timestamp + outputpage)}`)).json()).api_code; } catch { code = null; }
    if (!code) return this.banner("In-app generation needs the PHP endpoint with your API key (api/config.php). Use “Plan on SimBrief” instead.");
    const q = new URLSearchParams(Object.entries({ orig: d.orig, dest: d.dest, type: d.type, airline: d.airline, fltnum: d.fltnum, reg: d.reg, altn: d.altn, route: d.route, deph: d.dep.slice(0, 2), depm: d.dep.slice(2, 4), units: settings().units === "lb" ? "LBS" : "KGS", navlog: 1, tlr: 1, apicode: code, outputpage, timestamp }).filter(([, v]) => v !== "" && v != null));
    const w = window.open(`https://www.simbrief.com/ofp/ofp.loader.api.php?${q}`, "SBworker", "width=600,height=315");
    if (!w) return this.banner("Allow pop-ups to generate the flight plan.");
    this.banner("Generating OFP on SimBrief…", "info");
    const t = setInterval(() => { if (w.closed) { clearInterval(t); this.act("import"); } }, 800);
  }

  // ---------------------------------------------------------------- summary
  s_summary(f) {
    const w = f.weights || {}, fu = f.fuel || {}, u = (f.units || "kg").toUpperCase();
    const stat = (l, v) => `<div><span>${l}</span><b>${v}</b></div>`;
    const ap = (a, role) => {
      if (!a) return "";
      const m = decodeMetar(a.metar);
      return `<button class="apc" data-ch="${esc(a.icao)}">
        <div class="t"><span>${role}</span>${m ? `<i style="background:${CAT_COLOR[m.cat]}">${m.cat}</i>` : ""}</div>
        <b>${esc(a.icao)}<small>${esc(a.iata || "")}</small></b><p>${esc(a.name || "")}</p>
        <div class="m">${a.rwy ? `<span>RWY ${esc(a.rwy)}</span>` : ""}${m?.wind ? `<span>${m.wind.vrb ? "VRB" : pad(m.wind.dir, 3)}/${m.wind.spd}${m.wind.gust ? "G" + m.wind.gust : ""}</span>` : ""}${m?.temp != null ? `<span>${m.temp}°C</span>` : ""}${m?.qnh ? `<span>Q${m.qnh}</span>` : ""}${a.notams?.length ? `<span class="n">${a.notams.length} NOTAM</span>` : ""}</div>
        <em>Charts ›</em></button>`;
    };
    const bar = (v, max, l) => (v && max ? `<div class="wb"><div class="h"><span>${l}</span><b>${fmtNum(v)}</b><em>MAX ${fmtNum(max)}</em><strong class="${v > max ? "over" : ""}">${fmtNum(max - v)} ${v > max ? "OVER" : "MARGIN"}</strong></div><div class="tr"><i class="${v > max ? "over" : ""}" style="width:${Math.min(100, (v / max) * 100)}%"></i></div></div>` : "");
    return `<div class="bf-sum">
      <section class="hero">
        <div class="end"><span>STD ${z(f.times?.out)}Z</span><b>${esc(f.orig.icao)}</b><small>${esc(f.orig.name || "")}</small></div>
        <div class="mid"><span>${secToHM(f.times?.ete)}</span><div class="line"><i>${I.plane}</i></div><span>${fmtNum(f.distance)} NM</span></div>
        <div class="end r"><span>STA ${z(f.times?.on)}Z</span><b>${esc(f.dest.icao)}</b><small>${esc(f.dest.name || "")}</small></div>
      </section>
      <section class="stats">${stat("Cruise", f.cruiseAlt ? "FL" + Math.round(f.cruiseAlt / 100) : "—")}${stat("Cost index", esc(f.ci ?? "—"))}${stat("Block time", secToHM(f.times?.block))}${stat("Avg wind", f.avgWind?.comp != null ? (f.avgWind.comp > 0 ? "+" : "") + f.avgWind.comp + " kt" : "—")}${stat("Pax", esc(f.pax ?? "—"))}${stat("Block fuel", fu.plan_ramp ? fmtNum(fu.plan_ramp) + " " + u : "—")}</section>
      <div class="aps">${ap(f.orig, "Departure")}${ap(f.dest, "Arrival")}${(f.altns || []).map(a => ap(a, "Alternate")).join("")}</div>
      <div class="two">
        <section class="card"><h4>Fuel <small>${u}</small></h4><table class="kv">
          ${[["Trip", fu.enroute_burn], ["Contingency", fu.contingency], ["Alternate", fu.alternate_burn], ["Final reserve", fu.reserve], ["Extra", fu.extra], ["Taxi", fu.taxi]].filter(r => r[1] != null).map(([k, v]) => `<tr><td>${k}</td><td>${fmtNum(v)}</td></tr>`).join("")}
          <tr class="tot"><td>Block fuel</td><td>${fmtNum(fu.plan_ramp)}</td></tr></table>${fu.plan_ramp == null ? `<p class="hint">No fuel figures in an offline flight.</p>` : ""}</section>
        <section class="card"><h4>Weights <small>${u}</small></h4>${bar(w.est_zfw, w.max_zfw, "ZFW")}${bar(w.est_tow, w.max_tow, "TOW")}${bar(w.est_ldw, w.max_ldw, "LDW")}${!w.est_zfw ? `<p class="hint">No weights in an offline flight.</p>` : ""}</section>
      </div>
      <section class="card"><h4>Route</h4><p class="route"><b>${esc(f.orig.icao)}${f.orig.rwy ? "/" + esc(f.orig.rwy) : ""}</b> ${esc(f.route || "DCT")} <b>${esc(f.dest.icao)}${f.dest.rwy ? "/" + esc(f.dest.rwy) : ""}</b></p>
        <div class="btns"><button class="ios-btn tinted small" data-ch="${esc(f.orig.icao)}">Departure Charts</button><button class="ios-btn tinted small" data-ch="${esc(f.dest.icao)}">Arrival Charts</button></div></section>
    </div>`;
  }

  s_ofp(f) { return f.planHtml ? `<div class="bf-paper"><iframe class="ofp" sandbox="allow-same-origin" title="OFP"></iframe></div>` : ""; }
  mountOfp(f) {
    const fr = $("iframe.ofp", this.root);
    if (!fr || !f?.planHtml) return;
    fr.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:28px 34px;background:#fff;color:#111;font:${this.ofpSize}px/1.38 "SF Mono",Menlo,"Courier New",monospace}pre{white-space:pre;font:inherit;margin:0}img{max-width:100%}a{color:#0a64d6}b{color:#000}</style></head><body>${f.planHtml}</body></html>`;
  }

  s_navlog(f) {
    let prevDist = 0;
    return `<div class="card flush"><table class="nav"><thead><tr><th>Waypoint</th><th>Via</th><th>Alt</th><th>MT</th><th>Leg</th><th>Dist</th><th>ETE</th><th>GS</th><th>Wind</th><th>OAT</th><th>FOB</th><th>Min</th></tr></thead><tbody>
      ${(f.navlog || []).map(n => {
        const leg = n.dist != null ? Math.round(n.dist - prevDist) : ""; prevDist = n.dist ?? prevDist;
        return `<tr class="${n.stage === "CLB" ? "clb" : n.stage === "DSC" ? "dsc" : ""}"><td><b>${esc(n.ident)}</b>${n.name && n.name !== n.ident ? `<small>${esc(n.name)}</small>` : ""}</td><td>${esc(n.via || "")}</td>
        <td>${n.alt != null ? (n.alt >= 18000 ? "FL" + Math.round(n.alt / 100) : fmtNum(n.alt)) : ""}</td><td>${n.trk ?? ""}</td><td>${leg}</td><td>${n.dist != null ? Math.round(n.dist) : ""}</td>
        <td>${secToHM(n.timeTotal)}</td><td>${n.gs ?? ""}</td><td>${esc(n.wind || "")}</td><td>${n.oat ?? ""}</td><td>${n.fuelOnboard != null ? fmtNum(n.fuelOnboard) : ""}</td><td>${n.minFuel != null ? fmtNum(n.minFuel) : ""}</td></tr>`;
      }).join("")}</tbody></table></div>`;
  }

  s_fuel(f) {
    const fu = f.fuel || {}, w = f.weights || {};
    const rows = (o, keys) => keys.filter(([k]) => o[k] != null).map(([k, l]) => `<tr><td>${l}</td><td>${fmtNum(o[k])}</td></tr>`).join("");
    return `<div class="two"><section class="card"><h4>Fuel</h4><table class="kv">${rows(fu, [["taxi", "Taxi"], ["enroute_burn", "Trip"], ["contingency", "Contingency"], ["alternate_burn", "Alternate"], ["reserve", "Final reserve"], ["etops", "ETOPS"], ["extra", "Extra"], ["min_takeoff", "Minimum takeoff"], ["plan_takeoff", "Planned takeoff"], ["plan_ramp", "Block"], ["plan_landing", "Landing"], ["avg_fuel_flow", "Avg fuel flow / h"], ["max_tanks", "Tank capacity"]])}</table></section>
      <section class="card"><h4>Weights</h4><table class="kv">${rows(w, [["oew", "Operating empty"], ["pax_count", "Passengers"], ["cargo", "Cargo"], ["payload", "Payload"], ["est_zfw", "Est ZFW"], ["max_zfw", "Max ZFW"], ["est_tow", "Est TOW"], ["max_tow", "Max TOW"], ["est_ldw", "Est LDW"], ["max_ldw", "Max LDW"], ["est_ramp", "Ramp"]])}</table></section></div>`;
  }

  s_wx(f) {
    const card = (a, role) => {
      if (!a) return "";
      const m = decodeMetar(a.metar);
      return `<section class="card wx"><h4>${role} · ${esc(a.icao)} ${m ? `<i style="background:${CAT_COLOR[m.cat]}">${m.cat}</i>` : ""}</h4>
        ${m ? `<div class="dec">${[["Wind", m.wind ? (m.wind.vrb ? "VRB" : pad(m.wind.dir, 3)) + "/" + m.wind.spd + (m.wind.gust ? "G" + m.wind.gust : "") + " kt" : "Calm"], ["Visibility", m.visM >= 9999 ? "10 km+" : fmtNum(m.visM) + " m"], ["Ceiling", m.ceiling != null ? fmtNum(m.ceiling) + " ft" : "None"], ["Temp/Dew", `${m.temp ?? "—"}/${m.dew ?? "—"}`], ["QNH", m.qnh ?? "—"]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("")}</div>` : ""}
        <h5>METAR</h5><pre>${esc(a.metar || "Not available")}</pre>${a.taf ? `<h5>TAF</h5><pre>${esc(a.taf)}</pre>` : ""}</section>`;
    };
    return card(f.orig, "Departure") + card(f.dest, "Arrival") + (f.altns || []).map(a => card(a, "Alternate")).join("");
  }

  s_notam(f) {
    const block = (title, list) => (list?.length ? `<section class="card notams"><h4>${esc(title)} <small>${list.length}</small></h4>${list.map(n => `<article><header><b>${esc(n.id || "")}</b>${n.icao ? `<span>${esc(n.icao)}</span>` : ""}${n.from ? `<span>${esc(fmtDate(n.from))} – ${esc(fmtDate(n.to))}</span>` : ""}</header><pre>${esc(n.text)}</pre></article>`).join("")}</section>` : "");
    return block(`Departure ${f.orig.icao}`, f.orig.notams) + block(`Arrival ${f.dest.icao}`, f.dest.notams) + (f.altns || []).map(a => block(`Alternate ${a.icao}`, a.notams)).join("") + block("Enroute & FIR", f.enrouteNotams);
  }

  s_atc(f) {
    return `<section class="card"><h4>ICAO flight plan</h4><pre class="fpl">${esc(f.fpl || "")}</pre><div class="btns"><button class="ios-btn tinted small" onclick="navigator.clipboard.writeText(this.closest('.card').querySelector('pre').textContent)">Copy</button></div></section>
      ${f.firs?.length ? `<section class="card"><h4>FIRs</h4><p class="route">${f.firs.map(esc).join(" › ")}</p></section>` : ""}`;
  }

  s_maps(f) {
    return `<div class="maps">${(f.maps || []).map(m => `<figure class="card flush"><img src="${esc(m.url)}" alt="${esc(m.name)}" loading="lazy"><figcaption>${esc(m.name)}</figcaption></figure>`).join("")}</div>`;
  }
}

function fmtDate(s) {
  if (!s) return "PERM";
  const d = new Date(s);
  return isNaN(d) ? s : `${pad(d.getUTCDate())} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" }).toUpperCase()} ${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}Z`;
}
