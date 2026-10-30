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

export default { mount: (root, ctx) => new OptApp(root, ctx) };

const TABS = [["tko", "TKO Dispatch"], ["tkoall", "TKO All Engine"], ["ldg", "LDG Dispatch"], ["ldgenr", "LDG Enroute"]];
const INTX = [["FULL", 0], ["-1000 FT", 1000], ["-2000 FT", 2000], ["-3000 FT", 3000]];

class OptApp {
  constructor(root, ctx) {
    this.root = root; this.ctx = ctx;
    this.state = kv.get("opt.state", { type: null, reg: null, tab: "tko" });
    this.f = kv.get("opt.form", {});
    this.open = {};
    this.unsub = [listen("flight", () => this.prefill(true))];
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
    on(r, "input", "input[data-k]", (e, el) => { this.f[el.dataset.k] = el.value.toUpperCase(); this.save(); });
    on(r, "keydown", "input[data-k]", e => { if (e.key === "Enter") this.result(true); });
    on(r, "click", "[data-a]", (e, b) => this.act(b.dataset.a, b));
    on(r, "click", "[data-tab]", (e, b) => { this.state.tab = b.dataset.tab; this.save(); this.calc(); });
    on(r, "click", "[data-bar]", (e, b) => this.bar(b.dataset.bar));
    this.state.type ? this.calc() : this.picker();
  }
  destroy() { this.unsub.forEach(u => u()); }
  save() { kv.set("opt.state", this.state); kv.set("opt.form", this.f); }

  // ---------------------------------------------------------------- aircraft picker
  picker() {
    const fleet = settings().fleet;
    this.root.innerHTML = `<div class="opt">
      <div class="opt-head"><div class="ttl">ONBOARD PERFORMANCE TOOL<small>Select Registration</small></div><div class="ico"><span class="inbox"><i>${Object.keys(fleet).length + 2}</i></span><span class="cog">${I.gear}</span></div></div>
      <div class="opt-pick">
        <div class="back">‹ Select Aircraft</div>
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
    const sel = (k, opts) => {
      const norm = opts.map(o => (Array.isArray(o) ? o : [o, o]));
      const cur = norm.find(([v]) => String(f[k]) === String(v)) || norm[0];
      return `<label class="sel"><select data-k="${k}">${norm.map(([v, l]) => `<option value="${esc(v)}" ${cur && v === cur[0] ? "selected" : ""}>${esc(l)}</option>`).join("")}</select><span>${esc(cur?.[1] ?? "")}</span></label>`;
    };
    const inp = (k, ph, unit = "") => `<label class="inp"><input data-k="${k}" value="${esc(f[k] ?? "")}" placeholder="${esc(ph)}" inputmode="decimal">${unit ? `<em>${unit}</em>` : ""}</label>`;
    const row = (lbl, ctl) => `<div class="r"><b>${lbl}</b>${ctl}</div>`;
    this.root.innerHTML = `<div class="opt">
      <div class="opt-head calc"><button class="back" data-a="aircraft">‹</button><div class="ttl">${esc(t)} <span>${esc(this.state.reg)}</span></div><div class="ico"><span class="inbox"><i>6</i></span><span class="cog" data-a="info">${I.gear}</span></div></div>
      <div class="opt-bar">${["Info", "Add Airport", "NOTAM", "MEL", "CDL", "Send Output", "Nav Plates"].map(x => `<button data-bar="${x}">${x}</button>`).join("")}</div>
      <div class="opt-form">
        <div class="c">
          ${row("ARPT", `<label class="sel srch" data-a="arpt"><span class="v">${esc(f.arpt || "ARPT SEARCH")}</span><i>▾</i></label>`)}
          ${row("RWY", sel("rwy", ends.length ? ends.map(e => [e.id, `${e.id}  ${fmtNum(e.len)} FT`]) : [["", "RUNWAYS"]], ""))}
          ${row("INTX", sel("intx", INTX.map(x => x[0]), ""))}
          ${row("COND", sel("cond", CONDITIONS, ""))}
          ${row("WIND", inp("wind", "DDD/SS"))}
          ${row("OAT", inp("oat", "°C"))}
          ${row("QNH", inp("qnh", "HPA"))}
        </div>
        <div class="c">
          ${ldg ? row("AB", sel("ab", autobrakes(ac).map(a => [a, a === "MAX MANUAL" ? "MAX MANUAL" : "AUTOBRAKE " + a]), "")) : row("RTG", sel("rating", ac.ratings.map(r => [r, ac.maker === "Airbus" ? "TOGA / FLEX" : r + (r === ac.base ? "" : " DERATE")]), ""))}
          ${ldg ? row("VAPP", inp("addSpeed", "+ KT")) : row("ATM", inp("atmFixed", "AUTO", "°C"))}
          ${row("REV", sel("rev", [["BOTH", "BOTH OPERATIVE"], ["INOP", "ONE INOP"]], ""))}
          ${row("FLAP", sel("flap", Object.keys(ldg ? ac.ldg : ac.to).map(x => [x, flapLabel(ac, x)]), ""))}
          ${row("A/C", sel("ac", [["AUTO", "PACKS AUTO"], ["OFF", "PACKS OFF"]], ""))}
          ${row("A/I", sel("ai", [["OFF", "A/I OFF"], ["ENG", "ENG A/I ON"], ["ALL", "ENG+WING ON"]], ""))}
          ${ldg ? "" : row("IC", sel("ic", [["OFF", "IMPR CLIMB OFF"], ["ON", "IMPR CLIMB ON"]], ""))}
        </div>
        <div class="c w">
          ${ldg ? row("LW:", inp("lw", "", "KG")) : row("TOW:", inp("tow", "", "KG"))}
          ${row("CG(%):", inp("cg", "MAC"))}
          ${row("ZFW:", inp("zfw", "", "KG"))}
          <button class="calc" data-a="calc">Calculate</button>
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
  }

  bar(x) {
    const fl = getFlight();
    if (x === "Info") return modal({ title: "OPT", body: `<p>Aircraft <b>${esc(this.state.type)}</b> · ${esc(this.state.reg)}</p><p>Weights are in kg. Wind is true direction/speed (METAR). Runway data from OurAirports.</p><p style="color:#c00"><b>Simplified model for flight simulation only.</b> Numbers are plausible but not certified and must not be used for real flights.</p>` });
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
    if (missing || !(w > 20000)) {
      out.innerHTML = `<div class="opt-msg">${missing ? `Enter ${missing}` : `Enter ${ldg ? "LW" : "TOW"}`} and press Calculate.${getFlight() ? "" : `<br><small>Tip: load a SimBrief OFP in Briefing to prefill airport, runway and weights.</small>`}</div>`;
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
        body = `<div class="opt-res-grid">
          <div class="box big ${r.ok ? "" : "bad"}"><span>${fl}</span><b>${f.flap}</b></div>
          <div class="box big"><span>THRUST</span><b>${thr}</b></div>
          <div class="box big"><span>N1</span><b>${r.n1}%</b></div>
          <div class="box v"><span>V1</span><b>${r.v1}</b></div><div class="box v"><span>VR</span><b>${r.vr}</b></div><div class="box v"><span>V2</span><b>${r.v2}</b></div>
          <div class="box"><span>${this.ac.maker === "Airbus" ? "THS" : "STAB TRIM"}</span><b>${f.cg && r.trim != null ? (this.ac.maker === "Airbus" ? `${Math.abs(r.trim)} ${r.trim >= 0 ? "UP" : "DN"}` : r.trim) : "—"}</b></div>
          <div class="box"><span>REQ / AVAIL</span><b>${fmtNum(r.req)} / ${fmtNum(tora)} M</b></div>
          <div class="box"><span>MARGIN</span><b class="${r.margin < 0 ? "red" : ""}">${fmtNum(r.margin)} M</b></div>
          <div class="box"><span>PERF LIMIT WT</span><b>${fmtNum(r.perfLimit)} KG</b></div>
          <div class="box"><span>LIMIT CODE</span><b>${r.limitCode}</b></div>
          <div class="box"><span>VREF ${esc(this.ac.defLdg)} (RTN)</span><b>${r.vrefRtn}</b></div>
        </div>
        ${r.ok ? "" : `<div class="opt-warn">${w > r.perfLimit ? `TOW ${fmtNum(w)} KG EXCEEDS PERFORMANCE LIMIT ${fmtNum(r.perfLimit)} KG` : "RUNWAY TOO SHORT FOR CONDITIONS"}</div>`}
        ${this.tlrCompare(ap.icao, end.id)}`;
        text = `OPT ${ap.icao} ${end.id} ${f.intx} ${f.cond}\nTOW ${w} ${fl} ${f.flap} ${thr} N1 ${r.n1}\nV1 ${r.v1} VR ${r.vr} V2 ${r.v2}${f.cg ? ` TRIM ${r.trim}` : ""}`;
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
    out.innerHTML = hdr + body;
  }

  tlrCompare(icao, rwy) {
    const t = getFlight()?.tlr?.takeoff;
    if (!t || t.conditions?.airport_icao !== icao) return "";
    const r = (Array.isArray(t.runway) ? t.runway : [t.runway]).find(x => x.identifier === rwy);
    if (!r) return "";
    return `<div class="opt-tlr">SimBrief TLR ${esc(rwy)}: FLAPS ${esc(r.flap_setting)} · ${esc(r.thrust_setting)} ${esc(r.flex_temperature || "")}${r.flex_temperature ? "°C" : ""} · V1 ${esc(r.speeds_v1)} VR ${esc(r.speeds_vr)} V2 ${esc(r.speeds_v2)}</div>`;
  }
}
