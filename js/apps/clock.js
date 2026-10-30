// Clock – UTC / local / airport times, block-time chrono and countdown timer.
import { $, esc, on, pad, toast } from "../core/ui.js";
import { kv } from "../core/store.js";
import { getFlight } from "../core/flight.js";
import { I } from "../core/sf.js";

export default { mount: (root, ctx, args) => new ClockApp(root, args) };

const hms = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };

class ClockApp {
  constructor(root, args) {
    this.root = root;
    this.tab = args?.tab || "world";
    this.st = kv.get("clock", { chrono: null, chronoAcc: 0, block: {}, timerEnd: null, timerSet: 600 });
    root.innerHTML = `<div class="clk"><main></main><nav>${[["world", "World Clock", I.globe], ["block", "Block Times", I.plane], ["chrono", "Stopwatch", I.stopwatch], ["timer", "Timers", I.timer]].map(([k, l, ic]) => `<button data-t="${k}">${ic}<span>${l}</span></button>`).join("")}</nav></div>`;
    on(root, "click", "[data-t]", (e, b) => { this.tab = b.dataset.t; this.render(); });
    on(root, "click", "[data-a]", (e, b) => this.act(b.dataset.a, b));
    this.tick = setInterval(() => this.update(), 250);
    this.render();
  }
  show(args) { if (args?.tab) { this.tab = args.tab; this.render(); } }
  destroy() { clearInterval(this.tick); }
  save() { kv.set("clock", this.st); }

  render() {
    this.root.querySelectorAll("nav button").forEach(b => b.classList.toggle("on", b.dataset.t === this.tab));
    const m = $("main", this.root);
    if (this.tab === "world") {
      const f = getFlight();
      const tz = (h, label, icao) => ({ h, label, icao });
      const zones = [tz(0, "UTC", "ZULU"), tz(-new Date().getTimezoneOffset() / 60, "Local", "This iPad")];
      this.zones = zones;
      if (f?.orig) zones.push(tz(this.flightTz("orig"), f.orig.icao, f.orig.name || ""));
      if (f?.dest) zones.push(tz(this.flightTz("dest"), f.dest.icao, f.dest.name || ""));
      m.innerHTML = `<div class="world">${zones.filter(z => z.h != null).map((z, i) => `<div class="zone"><div class="face" data-z="${i}">${Array.from({ length: 12 }, (_, k) => `<i style="transform:rotate(${k * 30}deg)"></i>`).join("")}<b class="h"></b><b class="m"></b><b class="s"></b></div>
        <div class="tx"><b>${esc(z.label)}</b><small>${esc(z.icao)}</small><span class="dig" data-d="${i}"></span><small>UTC${z.h >= 0 ? "+" : "−"}${Math.abs(z.h)}</small></div></div>`).join("")}</div>`;
    }
    if (this.tab === "block") {
      const b = this.st.block, f = getFlight();
      const ev = [["out", "OUT", "Off blocks"], ["off", "OFF", "Takeoff"], ["on", "ON", "Landing"], ["in", "IN", "On blocks"]];
      const z = t => (t ? `${pad(new Date(t).getUTCHours())}:${pad(new Date(t).getUTCMinutes())}Z` : "--:--");
      m.innerHTML = `<div class="block"><h2>${esc(f ? `${f.callsign} ${f.orig.icao}–${f.dest.icao}` : "Block times")}</h2>
        <div class="oooi">${ev.map(([k, l, d]) => `<button data-a="b-${k}" class="${b[k] ? "set" : ""}"><small>${d}</small><b>${l}</b><span>${z(b[k])}</span>${f?.times?.[k] ? `<em>Plan ${z(f.times[k])}</em>` : ""}</button>`).join("")}</div>
        <div class="tot"><div><small>Block time</small><b>${b.out && b.in ? hms(b.in - b.out).slice(0, 5) : b.out ? `<span data-run="out"></span>` : "--:--"}</b></div><div><small>Flight time</small><b>${b.off && b.on ? hms(b.on - b.off).slice(0, 5) : b.off ? `<span data-run="off"></span>` : "--:--"}</b></div></div>
        <div class="row"><button class="ios-btn secondary" data-a="b-reset">Reset</button><button class="ios-btn" data-a="b-log">Save to Logbook</button></div></div>`;
    }
    if (this.tab === "chrono") {
      m.innerHTML = `<div class="chrono"><div class="big" id="chr"></div><div class="row"><button class="round grey" data-a="c-reset">Reset</button><button class="round ${this.st.chrono ? "red" : "green"}" data-a="c-toggle">${this.st.chrono ? "Stop" : "Start"}</button></div></div>`;
    }
    if (this.tab === "timer") {
      m.innerHTML = this.st.timerEnd ? `<div class="chrono"><div class="big" id="tmr"></div><div class="row"><button class="round grey" data-a="t-cancel">Cancel</button></div></div>`
        : `<div class="chrono"><div class="presets">${[1, 2, 3, 5, 10, 15, 20, 30, 45, 60].map(m2 => `<button data-a="t-${m2}" class="${this.st.timerSet === m2 * 60 ? "on" : ""}">${m2} min</button>`).join("")}</div>
          <div class="big">${hms(this.st.timerSet * 1000)}</div><div class="row"><button class="round green" data-a="t-start">Start</button></div></div>`;
    }
    this.update();
  }
  flightTz(which) {
    // SimBrief gives airport UTC offsets; otherwise estimate from longitude.
    const a = getFlight()?.[which];
    if (!a) return null;
    return a.tz ?? Math.round(a.lon / 15);
  }
  update() {
    const now = Date.now();
    if (this.tab === "world" && this.zones) {
      this.zones.forEach((z, i) => {
        const d = new Date(now + z.h * 3600e3);
        const h = d.getUTCHours(), mi = d.getUTCMinutes(), s = d.getUTCSeconds();
        const face = this.root.querySelector(`[data-z="${i}"]`);
        if (!face) return;
        face.querySelector(".h").style.transform = `rotate(${(h % 12) * 30 + mi / 2}deg)`;
        face.querySelector(".m").style.transform = `rotate(${mi * 6}deg)`;
        face.querySelector(".s").style.transform = `rotate(${s * 6}deg)`;
        face.classList.toggle("night", h < 6 || h >= 18);
        this.root.querySelector(`[data-d="${i}"]`).textContent = `${pad(h)}:${pad(mi)}`;
      });
    }
    this.root.querySelectorAll("[data-run]").forEach(el => { el.textContent = hms(now - this.st.block[el.dataset.run]).slice(0, 5); });
    const chr = $("#chr", this.root);
    if (chr) chr.textContent = hms(this.st.chronoAcc + (this.st.chrono ? now - this.st.chrono : 0));
    const tmr = $("#tmr", this.root);
    if (tmr) {
      const left = this.st.timerEnd - now;
      tmr.textContent = hms(left);
      if (left <= 0) { this.st.timerEnd = null; this.save(); toast("⏱ Timer done", 5000); this.beep(); this.render(); }
    }
  }
  beep() {
    try { const a = new AudioContext(), o = a.createOscillator(); o.frequency.value = 880; o.connect(a.destination); o.start(); o.stop(a.currentTime + 0.6); } catch { /* no audio */ }
  }
  act(a) {
    const now = Date.now();
    if (a.startsWith("b-")) {
      const k = a.slice(2);
      if (k === "reset") this.st.block = {};
      else if (k === "log") {
        const logs = kv.get("logbook", []);
        const b = this.st.block, f = getFlight();
        if (!b.out) return toast("Set OUT first");
        logs.unshift({ id: now, date: new Date(b.out).toISOString().slice(0, 10), from: f?.orig?.icao || "", to: f?.dest?.icao || "", type: f?.aircraft?.icao || "", reg: f?.aircraft?.reg || "", flt: f?.callsign || "", out: b.out, off: b.off, on: b.on, in: b.in });
        kv.set("logbook", logs); toast("Saved to Logbook");
      } else this.st.block[k] = this.st.block[k] ? null : now;
    }
    if (a === "c-toggle") { if (this.st.chrono) { this.st.chronoAcc += now - this.st.chrono; this.st.chrono = null; } else this.st.chrono = now; }
    if (a === "c-reset") { this.st.chrono = null; this.st.chronoAcc = 0; }
    if (/^t-\d+$/.test(a)) this.st.timerSet = +a.slice(2) * 60;
    if (a === "t-start") this.st.timerEnd = now + this.st.timerSet * 1000;
    if (a === "t-cancel") this.st.timerEnd = null;
    this.save(); this.render();
  }
}
