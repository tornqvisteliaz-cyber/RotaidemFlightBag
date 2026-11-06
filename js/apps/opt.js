// OPT – onboard performance tool (takeoff & landing), laid out like the airline
// tool: aircraft/registration selection, then dispatch/all-engine/landing tabs.
import { $, $$, html, esc, on, listen, toast, modal, fmtNum } from "../core/ui.js";
import { settings, kv } from "../core/store.js";
import { getFlight } from "../core/flight.js";
import { getAirport, searchAirports, runwayEnds } from "../core/airports.js";
import { windComponents } from "../core/geo.js";
import { metar, decodeMetar } from "../core/wx.js";
import { AIRCRAFT, CONDITIONS, autobrakes, flapLabel, takeoff, landing } from "../core/perf.js";
import { I } from "../core/sf.js";
import { onAircraft } from "../core/aircraft.js";

export default { mount: (root, ctx) => new OptApp(root, ctx) };

const TABS = [["tko", "TKO Dispatch"], ["tkoall", "TKO All Engine"], ["ldg", "LDG Dispatch"], ["ldgenr", "LDG Enroute"]];
const INTX = [["FULL", 0], ["-1000 FT", 1000], ["-2000 FT", 2000], ["-3000 FT", 3000]];

class OptApp {
  constructor(root, ctx) {
    this.root = root; this.ctx = ctx;
    this.state = kv.get("opt.state", { type: null, reg: null, tab: "tko" });
    this.f = kv.get("opt.form", {});
    this.open = {};
    this.unsub = [listen("flight", () => this.prefill(true)), onAircraft(a => this.fromSim(a))];
    const r = this.root;
    on(r, "click", "[data-g]", (e, b) => { this.open[b.dataset.g] = !this.open[b.dataset.g]; this.picker(); });
    on(r, "click", "[data-r]", (e, b) => {
      this.state.type = b.dataset.t; this.state.reg = b.dataset.r; this.save();
      this.f = {}; this.calc(); this.prefill();
    });
    on(r, "change", "[data-k]", (e, el) => {
      this.f[el.dataset.k] = el.value; this.save();
      if (el.tagName === "SELECT") { el.nextElementSibling.textContent = el.selectedOptions[0]?.textContent || ""; this.result(); }
    });
    // Like the real tool there is no Calculate button: results follow the inputs.
    on(r, "input", "input[data-k]", (e, el) => { this.f[el.dataset.k] = el.value.toUpperCase(); this.save(); this.unitPos(el); clearTimeout(this.rt); this.rt = setTimeout(() => this.result(), 350); });
    on(r, "keydown", "input[data-k]", e => { if (e.key === "Enter") this.result(true); });
    on(r, "click", "[data-a]", (e, b) => this.act(b.dataset.a, b));
    on(r, "click", "[data-tab]", (e, b) => { this.state.tab = b.dataset.tab; this.save(); this.calc(); });
    on(r, "click", "[data-bar]", (e, b) => this.bar(b.dataset.bar));
    on(r, "click", "[data-atm]", (e, b) => { this.f.atmMode = b.dataset.atm; this.save(); r.querySelectorAll("[data-atm]").forEach(x => x.classList.toggle("on", x === b)); this.result(); });
    this.state.type ? this.calc() : this.picker();
  }
  destroy() { this.unsub.forEach(u => u()); }
  // Switch to the airliner loaded in the simulator (Settings › Simulator › Detect aircraft automatically).
  fromSim(a) {
    this.simAc = a;
    if (!a?.opt || settings().autoAircraft === false || !AIRCRAFT[a.opt]) return;
    const reg = a.tail || settings().fleet[a.opt]?.[0] || a.opt;
    if (this.state.type === a.opt && this.state.reg === reg) return;
    const changed = this.state.type !== a.opt;
    this.state.type = a.opt; this.state.reg = reg; this.save();
    toast(`${a.name} detected in ${a.source}${a.tail ? " · " + a.tail : ""}`);
    if (changed) this.f = {};
    this.calc(); this.prefill();
  }
  save() { kv.set("opt.state", this.state); kv.set("opt.form", this.f); }

  // ---------------------------------------------------------------- aircraft picker
  picker() {
    const fleet = settings().fleet;
    this.root.innerHTML = `<div class="opt">
      <div class="opt-head"><div class="ttl">ONBOARD PERFORMANCE TOOL<small>Select Registration</small></div><div class="ico"><span class="inbox"><i>${Object.keys(fleet).length + 2}</i></span><span class="cog">${I.gear}</span></div></div>
      <div class="opt-pick">
        <div class="back">‹ Select Aircraft</div>
        ${this.simAc?.ga ? `<div class="opt-ga">${esc(this.simAc.name)} detected – OPT is for airliners. Use W&amp;B and E6B in the GA folder.</div>` : ""}
        ${Object.entries(fleet).map(([t, regs]) => `
          <button class="grp ${this.open[t] ? "open" : ""}" data-g="${esc(t)}"><span>${esc(t)}</span><i>⌄</i></button>
          <div class="regs ${this.open[t] ? "" : "hidden"}">${regs.map(r => `<button data-t="${esc(t)}" data-r="${esc(r)}">${esc(r)}<span>›</span></button>`).join("")}</div>`).join("")}
      </div>
      <div class="opt-disc">Simplified performance model for flight simulation only – not for real-world operations.</div></div>`;
  }

  // ---------------------------------------------------------------- prefill from flight + METAR
  async prefill(fromEvent) {
    const fl = getFlight();
    if (!fl) return;
    const ldg = this.state.tab?.startsWith("ldg");
    const ap = ldg ? fl.dest : fl.orig;
    if (fromEvent && this.f.arpt && this.f.arpt !== ap?.icao) return;
    Object.assign(this.f, {
      arpt: ap?.icao, rwy: ap?.rwy || this.f.rwy,
      tow: fl.weights?.est_tow ? Math.round(fl.units === "lb" ? fl.weights.est_tow * 0.4536 : fl.weights.est_tow) : this.f.tow,
      zfw: fl.weights?.est_zfw ? Math.round(fl.units === "lb" ? fl.weights.est_zfw * 0.4536 : fl.weights.est_zfw) : this.f.zfw,
      lw: fl.weights?.est_ldw ? Math.round(fl.units === "lb" ? fl.weights.est_ldw * 0.4536 : fl.weights.est_ldw) : this.f.lw,
    });
    if (ap?.icao) await this.loadWx(ap.icao);
    this.save();
    if (this.state.type) this.calc();
  }
  async loadWx(icao) {
    const m = decodeMetar(await metar(icao));
    if (!m) return;
    if (m.wind) this.f.wind = m.wind.vrb ? `VRB/${m.wind.spd}` : `${String(m.wind.dir).padStart(3, "0")}/${m.wind.spd}`;
    if (m.temp != null) this.f.oat = m.temp;
    if (m.qnh) this.f.qnh = m.qnh;
    const wet = (m.wx || []).some(w => /RA|DZ|SH|TS/.test(w));
    if (wet && (!this.f.cond || this.f.cond === "DRY")) this.f.cond = "WET";
  }

  // ---------------------------------------------------------------- calculator
  async calc() {
    const t = this.state.type, ac = AIRCRAFT[t] || AIRCRAFT["B737-800"];
    this.ac = ac;
    const ldg = this.state.tab.startsWith("ldg");
    const f = this.f;
    f.cond ||= "DRY"; f.flap ||= ldg ? ac.defLdg : ac.defTo; if (!ac.ratings.includes(f.rating)) f.rating = ac.base; f.rev ||= "BOTH"; f.ac ||= "AUTO"; f.ai ||= "OFF"; f.ic ||= "OFF"; f.intx ||= "FULL"; if (!autobrakes(ac).includes(f.ab)) f.ab = ac.maker === "Airbus" ? "LO" : "2"; f.atmMode ||= "AUTO";
    if (ldg && !(String(f.flap) in ac.ldg)) f.flap = ac.defLdg;
    if (!ldg && !(String(f.flap) in ac.to)) f.flap = ac.defTo;
    const ap = f.arpt ? await getAirport(f.arpt) : null;
    const ends = ap ? runwayEnds(ap) : [];
    if (ap && !ends.find(e => e.id === f.rwy)) f.rwy = ends[0]?.id;
    const bus = ac.maker === "Airbus";
    // Middle column (NAVBLUE style): ▾ on the left, value right-aligned, label on the right.
    const sel = (k, opts, cls = "") => {
      const norm = opts.map(o => (Array.isArray(o) ? o : [o, o]));
      const cur = norm.find(([v]) => String(f[k]) === String(v)) || norm[0];
      return `<label class="sel ${cls}"><select data-k="${k}">${norm.map(([v, l]) => `<option value="${esc(v)}" ${cur && v === cur[0] ? "selected" : ""}>${esc(l)}</option>`).join("")}</select><i>▾</i><span>${esc(cur?.[1] ?? "")}</span></label>`;
    };
    const inp = (k, ph, unit = "", cls = "") => `<label class="inp ${cls}"><input data-k="${k}" value="${esc(f[k] ?? "")}" placeholder="${esc(ph)}" inputmode="decimal" autocomplete="off"><em data-u>${unit}</em></label>`;
    const L1 = (lbl, ctl, sub = "") => `<div class="r"><b>${lbl}</b><div class="fc">${ctl}${sub ? `<small data-sub="${sub}"></small>` : ""}</div></div>`;
    const L2 = (lbl, ctl) => `<div class="r r2">${ctl}<b>${lbl}</b></div>`;
    const ratingLbl = r => (bus ? "TOGA" : r === ac.base ? "TO" : `TO-${ac.ratings.indexOf(r)}`);
    const iata = ap?.iata ? ` / ${ap.iata}` : "";
    const efp = !ldg && ap ? `<div class="efp"><p><b>Engine Failure Procedure:</b>&nbsp;&nbsp; EOSID</p><p>${esc(this.eosid(ap, ends.find(e => e.id === f.rwy)))}</p></div>` : `<div class="efp"></div>`;
    this.root.innerHTML = `<div class="opt opt-calc">
      <div class="opt-head calc"><div class="ttl">PERFORMANCE - ${ldg ? "LANDING" : "TAKEOFF"}</div><div class="ico"><span class="ham" data-a="aircraft" title="Aircraft"><svg viewBox="0 0 28 22" width="30" height="24"><path d="M2 3h24M2 11h24M2 19h24" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg></span><span class="cog" data-a="info">${I.gear}</span></div></div>
      <div class="opt-prof"><small>PROFILE</small><b>${esc(t)}</b><small>TAIL</small><b>${esc(this.state.reg)}</b>${this.simAc?.opt === this.state.type ? `<span class="simtag">SIM</span>` : ""}</div>
      <div class="opt-bar">${["ARPT Info", "Add Airport", "NOTAM", "MEL", "CDL", "Send Output", "Nav Plates"].map(x => `<button data-bar="${x}" class="${x === "Nav Plates" ? "dim" : ""}">${x}</button>`).join("")}</div>
      <div class="opt-form">
        <div class="c">
          ${L1("ARPT", `<label class="sel srch" data-a="arpt"><span class="v">${esc(f.arpt ? f.arpt + iata : "ARPT SEARCH")}</span><i>▾</i></label>`)}
          ${L1("RWY", sel("rwy", ends.length ? ends.map(e => [e.id, e.id]) : [["", "RWY"]], "l"))}
          ${L1("INTX", sel("intx", INTX.map(x => [x[0], x[0] === "FULL" ? "INTX LIST" : x[0]]), "l plain"))}
          ${L1("COND", sel("cond", CONDITIONS, "l"))}
          ${L1("WIND", inp("wind", "DDD/SS", "KT"), "wind")}
          ${L1("OAT", inp("oat", "", "C"), "oat")}
          ${L1("QNH", inp("qnh", "", "HPa"), "qnh")}
        </div>
        <div class="c">
          ${ldg ? L2("AB", sel("ab", autobrakes(ac).map(a => [a, a === "MAX MANUAL" ? "MAX MAN" : a]))) : L2("RTG", sel("rating", ac.ratings.map(r => [r, ratingLbl(r)])))}
          ${ldg ? L2("VAPP", inp("addSpeed", "+0", "KT", "r")) : L2(bus ? "FLEX" : "ATM", inp("atmFixed", "MAX", "", "r"))}
          ${L2("REV", sel("rev", [["BOTH", "ALL OP"], ["INOP", "1 INOP"]]))}
          ${L2("FLAP", sel("flap", Object.keys(ldg ? ac.ldg : ac.to).map(x => [x, bus ? flapLabel(ac, x).replace("CONF ", "") : x])))}
          ${L2("A/C", sel("ac", [["AUTO", "AUTO"], ["OFF", "OFF"]]))}
          ${L2("A/I", sel("ai", [["OFF", "OFF"], ["ENG", "ENG"], ["ALL", "ENG+WING"]]))}
          ${ldg ? "" : L2("IC", sel("ic", [["OFF", "OFF"], ["ON", "OPTIMUM"]]))}
        </div>
        <div class="c w">
          ${ldg ? L1("LW:", inp("lw", "", "KG")) : L1("TOW:", inp("tow", "", "KG"))}
          ${L1("CG(%):", inp("cg", "", ""))}
          ${L1("ZFW:", inp("zfw", "", "KG"))}
          ${efp}
          <div class="eng">${esc(ac.name)}/${esc(ac.engines)}</div>
          ${ldg ? "" : `<div class="ctl"><div class="np-seg"><button data-atm="OFF" class="${f.atmMode === "OFF" ? "on" : ""}">${bus ? "TOGA" : "FULL"}</button><button data-atm="AUTO" class="${f.atmMode === "OFF" ? "" : "on"}">${bus ? "FLEX" : "ATM"}</button></div>
            <button class="np-sw ${this.state.rwyg ? "on" : ""}" data-a="rwyg"><span>Rwy Graphic</span><i></i></button></div>`}
        </div>
      </div>
      <div class="opt-out"></div>
      <div class="opt-tabs">${TABS.map(([k, l]) => `<button data-tab="${k}" class="${this.state.tab === k ? "on" : ""}">${l}</button>`).join("")}</div>
    </div>`;
    this.ap = ap; this.ends = ends;
    this.result();
  }

  act(a) {
    if (a === "aircraft") { this.state.type = null; this.save(); return this.picker(); }
    if (a === "calc") return this.result(true);
    if (a === "arpt") return this.airportSearch();
    if (a === "info") return this.bar("Info");
    if (a === "rwyg") { this.state.rwyg = !this.state.rwyg; this.save(); $(".np-sw", this.root)?.classList.toggle("on", this.state.rwyg); return this.result(); }
  }

  bar(x) {
    const fl = getFlight();
    if (x === "Info") return modal({ title: "OPT", body: `<p>Aircraft <b>${esc(this.state.type)}</b> · ${esc(this.state.reg)}</p><p>Weights are in kg. Wind is true direction/speed (METAR). Runway data from OurAirports.</p><p style="color:#c00"><b>Simplified model for flight simulation only.</b> Numbers are plausible but not certified and must not be used for real flights.</p>` });
    if (x === "ARPT Info") {
      if (!this.ap) return toast("Select an airport first");
      const ap = this.ap;
      return modal({ title: `${ap.icao} ${ap.name}`, body: `<p>ELEV ${fmtNum(ap.elev)} FT · ${esc(ap.city || "")}</p><table class="opt-apt"><tr><th>RWY</th><th>HDG</th><th>LENGTH</th><th>WIDTH</th><th>DISPL THR</th><th>ELEV</th></tr>${this.ends.map(e => `<tr><td>${esc(e.id)}</td><td>${String(Math.round(e.hdg)).padStart(3, "0")}°</td><td>${fmtNum(e.len)} FT</td><td>${e.wid ? fmtNum(e.wid) + " FT" : "—"}</td><td>${e.disp ? fmtNum(e.disp) + " FT" : "—"}</td><td>${e.elev ?? "—"}</td></tr>`).join("")}</table>` });
    }
    if (x === "Add Airport") return this.airportSearch();
    if (x === "NOTAM") return modal({ title: "NOTAM", body: fl?.source === "simbrief" ? `<p>NOTAMs are included in your SimBrief OFP – open Briefing › OFP.</p>` : `<p>No NOTAM source loaded.</p>` });
    if (x === "MEL" || x === "CDL") return modal({ title: x, body: `<p>Select dispatch items affecting performance:</p><p>Use <b>REV › ONE INOP</b> for thrust reverser MEL items, and <b>A/I</b> / <b>A/C</b> for bleed configurations. No other ${x} items are modelled.</p>` });
    if (x === "Send Output") return this.sendOutput();
    if (x === "Nav Plates") return this.ctx.open("charts", { icao: this.f.arpt, cat: this.state.tab.startsWith("ldg") ? "APPR" : "SID" });
  }

  sendOutput() {
    if (!this.lastText) return toast("Calculate first");
    navigator.clipboard?.writeText(this.lastText).then(() => toast("Output copied – paste it into ScratchPad or the FMC"), () => toast("Copy failed"));
    kv.set("opt.lastOutput", this.lastText);
  }

  async airportSearch() {
    const body = html(`<div class="form"><input placeholder="ICAO / IATA / name" style="text-transform:uppercase"><div class="opt-res"></div></div>`);
    const m = modal({ title: "Airport search", body, done: "Close" });
    const inp = $("input", body);
    inp.addEventListener("input", async () => {
      const r = await searchAirports(inp.value, 12);
      $(".opt-res", body).innerHTML = r.map(a => `<button data-i="${a.icao}"><b>${a.icao}</b> ${esc(a.name)} <span>${a.runways.length} RWY</span></button>`).join("");
    });
    on(body, "click", "[data-i]", async (e, b) => {
      m.close();
      this.f.arpt = b.dataset.i; this.f.rwy = null;
      await this.loadWx(b.dataset.i);
      this.save(); this.calc();
    });
    setTimeout(() => inp.focus(), 50);
  }

  // ---------------------------------------------------------------- results
  result(explicit) {
    const out = $(".opt-out", this.root);
    const f = this.f, ap = this.ap;
    const end = this.ends?.find(e => e.id === f.rwy);
    const missing = !ap ? "ARPT" : !end ? "RWY" : f.oat === "" || f.oat == null || isNaN(+f.oat) ? "OAT" : !(+f.qnh > 900) ? "QNH" : null;
    const ldg = this.state.tab.startsWith("ldg");
    const w = +(ldg ? f.lw : f.tow);
    this.subs(end);
    if (missing || !(w > 20000)) {
      out.innerHTML = `<div class="opt-msg">${missing ? `Enter ${missing}` : `Enter ${ldg ? "LW" : "TOW"}`}.${getFlight() ? "" : `<br><small>Tip: load a SimBrief OFP in Briefing to prefill airport, runway and weights.</small>`}</div>`;
      if (explicit) toast(`Missing ${missing || (ldg ? "LW" : "TOW")}`);
      return;
    }
    const [wd, ws] = String(f.wind || "0/0").split("/");
    const wdir = wd === "VRB" ? end.hdg : +wd || 0, wspd = +ws || 0;
    const wc = windComponents(end.hdg, wdir, wspd);
    const offset = (INTX.find(x => x[0] === f.intx)?.[1] || 0);
    const toraFt = Math.max(0, end.len - offset - (ldg ? end.disp : 0));
    const tora = toraFt * 0.3048;
    const elev = end.elev ?? ap.elev;
    const base = { type: this.state.type, w, elev, qnh: +f.qnh, oat: +f.oat, head: wc.head, cond: f.cond, flap: String(f.flap), ai: f.ai !== "OFF", packs: f.ac !== "OFF", rev: f.rev === "BOTH" };
    const fmtD = m => `${fmtNum(m)} M / ${fmtNum(m / 0.3048)} FT`;
    const hdr = `<div class="opt-hdr"><b>${esc(ap.icao)} ${esc(end.id)}</b><span>${f.intx === "FULL" ? "FULL LENGTH" : "INTX " + f.intx}</span><span>${ldg ? "LDA" : "TORA"} ${fmtNum(toraFt)} FT</span><span>ELEV ${elev} FT</span><span>${wc.head >= 0 ? "HW" : "TW"} ${Math.abs(Math.round(wc.head))} / XW ${Math.abs(Math.round(wc.cross))} KT</span><span>${esc(f.cond)}</span></div>`;
    let body = "", text = "";
    if (!ldg) {
      const r = takeoff({ ...base, tora, rating: f.rating, atmMode: f.atmMode, atmFixed: f.atmFixed ? +f.atmFixed : null, ic: f.ic === "ON", cg: f.cg ? +f.cg : null });
      const thr = r.thrustText;
      const fl = this.ac.maker === "Airbus" ? "CONF" : "FLAPS";
      if (this.state.tab === "tko") {
        const bus = this.ac.maker === "Airbus";
        const accel = this.ac.mtow > 150000 ? 1000 : 800;
        const trim = r.trim == null ? "—" : bus ? `${r.trim >= 0 ? "UP" : "DN"} ${Math.abs(r.trim).toFixed(1)}` : r.trim.toFixed(2);
        const other = this.ends.find(e => e.id === end.other);
        const slope = other?.elev != null && end.elev != null ? ((other.elev - end.elev) / end.len) * 100 : 0;
        const vrefKey = Object.keys(this.ac.ldg).at(-1);
        const big = bus ? (r.atm ? "FLEX" : "TOGA") : r.atm ? "ATM" : "FULL";
        const k = (area, l, v, cls = "") => `<div class="k ${cls}" style="grid-area:${area}"><span>${l}</span><b>${v}</b></div>`;
        const kt = v => `${v} <u>KT</u>`;
        const vs = `<div class="vs" style="grid-area:v">${[["V1", r.v1], ["VR", r.vr], ["V2", r.v2], [`Vref${esc(vrefKey)}`, r.vrefRtn]].map(([l, v]) => `<div><span>${l}</span><b>${kt(v)}</b></div>`).join("")}</div>`;
        if (!this.state.rwyg) {
          body = `<div class="tk">
            ${k("flap", "FLAP", esc(bus ? flapLabel(this.ac, f.flap).replace("CONF ", "") : f.flap), r.ok ? "" : "red")}
            ${k("acc", "EO ACCEL HT", `${accel} <u>ft AGL</u>`, "c")}
            ${k("trim", bus ? "THS" : "TRIM", trim, "c")}
            ${vs}
            ${k("rwy", "RWY / INTX", `${esc(end.id)}${f.intx === "FULL" ? "" : " / " + esc(f.intx)}`)}
            <div class="big" style="grid-area:big">${big}</div>
            ${k("togw", "TOGW", `${fmtNum(w).replace(/,/g, "")} <u>KG</u>`, w > r.perfLimit ? "red" : "")}
            ${k("rto", bus ? "N1" : "R-TO", r.n1.toFixed(1), "c")}
            ${k("sel", "SEL TEMP", r.atm ? `${r.atm} <u>C</u>` : "—", "c")}
          </div>`;
        } else {
          // AE-GO is the factored all-engine distance (115 %), so it sits near the one-engine figures as on the real output.
          const d = { ae: Math.round(r.req * 1.018), eo: Math.round(r.req), asd: Math.round(r.req * 1.005) };
          body = `<div class="tg">
            <div class="tg-t"><div class="d-ae"><span>AE-GO</span><b>${d.ae} M</b></div><div class="d-eo"><span>EO-GO</span><b>${d.eo} M</b></div><div class="d-as"><span>ACCEL-STOP</span><b>${d.asd} M</b></div></div>
            <div class="tg-t"><div><span>TORA</span><b>${Math.round(tora)} M</b></div><div><span>TODA</span><b>${Math.round(tora)} M</b></div><div><span>ASDA</span><b>${Math.round(tora)} M</b></div></div>
            <div class="tg-t"><div><span>SLOPE</span><b>${Math.abs(slope).toFixed(2)}%</b></div><div><span>WEIGHT</span><b>${w} KG</b></div></div>
            <div class="big">${big}</div>
            ${this.windsock(wdir, wspd, end.hdg, wc)}
            ${this.rwyBars(d, tora, end.id)}
          </div>`;
        }
        body += `${r.ok ? "" : `<div class="opt-warn">${w > r.perfLimit ? `TOW ${fmtNum(w)} KG EXCEEDS PERFORMANCE LIMIT ${fmtNum(r.perfLimit)} KG` : "RUNWAY TOO SHORT FOR CONDITIONS"}</div>`}${this.tlrCompare(ap.icao, end.id)}`;
        text = `OPT ${ap.icao} ${end.id} ${f.intx} ${f.cond}\nTOW ${w} ${fl} ${f.flap} ${thr} N1 ${r.n1}\nV1 ${r.v1} VR ${r.vr} V2 ${r.v2}${r.trim != null ? ` TRIM ${trim}` : ""}`;
      } else {
        body = `<div class="opt-res-grid">
          <div class="box big"><span>FULL RATED N1</span><b>${r.n1Full}%</b></div>
          <div class="box big"><span>ALL ENG TO DIST</span><b>${fmtD(r.allEngine)}</b></div>
          <div class="box big"><span>ACCEL-STOP</span><b>${fmtD(r.asd)}</b></div>
          <div class="box"><span>PRESSURE ALT</span><b>${fmtNum(r.pa)} FT</b></div>
          <div class="box"><span>DENSITY RATIO</span><b>${r.sigma.toFixed(3)}</b></div>
          <div class="box"><span>FIELD LENGTH (FULL)</span><b>${fmtNum(r.reqFull)} M</b></div>
        </div>`;
        text = `OPT ALL ENGINE ${ap.icao} ${end.id}: N1 ${r.n1Full} TODR ${r.allEngine}M`;
      }
    } else {
      const r = landing({ ...base, lda: tora, autobrake: f.ab, addSpeed: +f.addSpeed || 0, headGust: Math.max(0, wc.head / 2) });
      if (this.state.tab === "ldg") {
        body = `<div class="opt-res-grid">
          <div class="box big ${r.ok ? "" : "bad"}"><span>${this.ac.maker === "Airbus" ? "CONF" : "FLAPS"}</span><b>${f.flap}</b></div>
          <div class="box big"><span>VREF${f.flap}</span><b>${r.vref}</b></div>
          <div class="box big"><span>VAPP</span><b>${r.vapp}</b></div>
          <div class="box"><span>DISPATCH REQ</span><b>${fmtD(r.dispatchReq)}</b></div>
          <div class="box"><span>LDA</span><b>${fmtD(tora)}</b></div>
          <div class="box"><span>MAX LDG WT</span><b>${fmtNum(r.fieldLimit)} KG (${r.limitCode})</b></div>
        </div>${r.ok ? "" : `<div class="opt-warn">LANDING WEIGHT / DISTANCE NOT WITHIN DISPATCH LIMITS</div>`}`;
      } else {
        body = `<div class="opt-ldgtab"><div class="h"><span>BRAKING</span><span>ACTUAL LDG DIST</span><span>MARGIN</span></div>
          ${r.table.map(x => `<div class="${x.ab === f.ab ? "on" : ""} ${x.ok ? "" : "bad"}"><span>${x.ab === "MAX MANUAL" ? x.ab : "AUTOBRAKE " + x.ab}</span><span>${fmtD(x.d)}</span><span>${fmtNum(tora - x.d)} M</span></div>`).join("")}
          </div><div class="opt-res-grid"><div class="box big"><span>VREF${f.flap}</span><b>${r.vref}</b></div><div class="box big"><span>VAPP</span><b>${r.vapp}</b></div></div>`;
      }
      text = `OPT LDG ${ap.icao} ${end.id} ${f.cond} LW ${w} ${flapLabel(this.ac, f.flap)} VREF ${r.vref} VAPP ${r.vapp} AB ${f.ab} ${r.selected}M`;
    }
    this.lastText = text;
    out.innerHTML = (this.state.tab === "tko" ? "" : hdr) + body;
  }

  // Wind compass with a windsock, runway pointing up (HW below-left, XW above-right as on the real output).
  windsock(wdir, wspd, hdg, wc) {
    const rel = (((wdir - hdg) % 360) + 360) % 360, cx = 70, cy = 70;
    const sock = wspd ? `<g transform="rotate(${rel + 180} ${cx} ${cy})">${[0, 1, 2, 3, 4].map(i => {
      const y0 = cy - 6 - i * 8, y1 = y0 - 8, w0 = 9 - i * 1.3, w1 = 9 - (i + 1) * 1.3;
      return `<path d="M${cx - w0} ${y0} L${cx - w1} ${y1} L${cx + w1} ${y1} L${cx + w0} ${y0}Z" fill="${i % 2 ? "#fff" : "#ff8a1f"}"/>`;
    }).join("")}<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - 6}" stroke="#fff" stroke-width="2"/></g>` : "";
    return `<div class="tg-w"><svg viewBox="0 0 140 140">
      <circle cx="${cx}" cy="${cy}" r="44" class="o"/><circle cx="${cx}" cy="${cy}" r="30" class="i"/>
      ${[0, 90, 180, 270].map(a => `<line x1="${cx}" y1="${cy - 44}" x2="${cx}" y2="${cy - 50}" transform="rotate(${a} ${cx} ${cy})" class="t"/>`).join("")}
      ${sock}</svg>
      <b class="hw">${Math.abs(Math.round(wc.head))} <u>${wc.head >= 0 ? "HW" : "TW"}</u></b><b class="xw">${Math.abs(Math.round(wc.cross))} <u>XW</u></b></div>`;
  }
  // Runway bar: AE-GO / EO-GO / ACCEL-STOP lines against the TORA / TODA / ASDA block.
  // shortcut: OurAirports has no clearway/stopway, so TODA and ASDA equal TORA.
  rwyBars(d, tora, rwy) {
    const W = 1000, x0 = 16, end = 820, X = m => x0 + (m / Math.max(tora, d.ae, d.eo, d.asd)) * (end - x0);
    const line = (y, cls, lbl, m) => `<line x1="${x0 + 4}" y1="${y}" x2="${X(m)}" y2="${y}" class="${cls}"/><line x1="${X(m)}" y1="${y - 6}" x2="${X(m)}" y2="${y + 6}" class="${cls}"/>
      <rect x="${x0 + 92}" y="${y - 10}" width="${lbl.length * 9 + 12}" height="20" class="gap"/><text x="${x0 + 98}" y="${y + 5}" class="${cls}">${lbl}</text>`;
    return `<svg class="tg-bars" viewBox="0 0 ${W} 130">
      <rect x="${x0}" y="6" width="${X(tora) - x0}" height="118" class="rw"/>
      <line x1="${x0}" y1="6" x2="${x0}" y2="124" class="edge"/>
      <text x="${x0 + 26}" y="65" class="rid" transform="rotate(90 ${x0 + 26} 65)" text-anchor="middle">${esc(rwy)}</text>
      ${line(32, "d-ae", "AE-GO", d.ae)}${line(65, "d-eo", "EO-GO", d.eo)}${line(98, "d-as", "ACCEL-STOP", d.asd)}
      <rect x="${X(tora)}" y="6" width="80" height="118" class="blk"/>
      <line x1="${X(tora)}" y1="6" x2="${X(tora)}" y2="124" class="edge"/>
      <text x="${X(tora) + 8}" y="30" class="lt">TORA</text><text x="${X(tora) + 8}" y="116" class="lt">ASDA</text>
      <line x1="${X(tora) + 84}" y1="52" x2="${X(tora) + 84}" y2="78" class="edge"/><text x="${X(tora) + 90}" y="70" class="lt">TODA</text>
    </svg>`;
  }

  // Generic EOSID text (no company EOSID database): straight out to the acceleration height, then ATC.
  eosid(ap, end) {
    if (!end) return "";
    const alt = Math.ceil(((end.elev ?? ap.elev) + 3000) / 500) * 500;
    return `MAINTAIN RUNWAY HEADING ${String(Math.round(end.hdg)).padStart(3, "0")} TO ${this.ac.mtow > 150000 ? 1000 : 800} FT AGL, ACCELERATE AND CLEAN UP. CONTINUE STRAIGHT AHEAD CLIMBING TO ${fmtNum(alt)} FT QNH OR AS INSTRUCTED BY ATC. (GENERIC – NO COMPANY EOSID ON FILE)`;
  }
  // Sub-lines under WIND / OAT / QNH, as on the real form.
  subs(end) {
    const f = this.f, set = (k, v) => { const el = this.root.querySelector(`[data-sub="${k}"]`); if (el) el.textContent = v; };
    const [wd, ws] = String(f.wind || "").split("/");
    if (end && ws != null && ws !== "") {
      const wc = windComponents(end.hdg, wd === "VRB" ? end.hdg : +wd || 0, +ws || 0);
      set("wind", `${Math.abs(Math.round(wc.head))} ${wc.head >= 0 ? "HW" : "TW"}/${Math.abs(Math.round(wc.cross))} XW KT`);
    } else set("wind", "");
    set("oat", f.oat !== "" && f.oat != null && !isNaN(+f.oat) ? `${Math.round(+f.oat * 9 / 5 + 32)} F` : "");
    set("qnh", +f.qnh > 900 ? `${(+f.qnh * 0.02953).toFixed(2)} IN HG` : "");
    this.root.querySelectorAll("input[data-k]").forEach(el => this.unitPos(el));
  }
  // Unit text ("KG", "C", "HPa") follows the typed value inside the field.
  unitPos(el) {
    const u = el.nextElementSibling;
    if (!u?.matches("[data-u]")) return;
    u.style.left = `calc(14px + ${(el.value || el.placeholder || "").length * 0.56}em)`;
    u.style.visibility = el.value ? "" : "hidden";
  }

  tlrCompare(icao, rwy) {
    const t = getFlight()?.tlr?.takeoff;
    if (!t || t.conditions?.airport_icao !== icao) return "";
    const r = (Array.isArray(t.runway) ? t.runway : [t.runway]).find(x => x.identifier === rwy);
    if (!r) return "";
    return `<div class="opt-tlr">SimBrief TLR ${esc(rwy)}: FLAPS ${esc(r.flap_setting)} · ${esc(r.thrust_setting)} ${esc(r.flex_temperature || "")}${r.flex_temperature ? "°C" : ""} · V1 ${esc(r.speeds_v1)} VR ${esc(r.speeds_vr)} V2 ${esc(r.speeds_v2)}</div>`;
  }
}
