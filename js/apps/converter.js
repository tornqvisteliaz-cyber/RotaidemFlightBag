// Converter – aviation unit conversions and a fuel uplift calculator.
import { $, $$, on } from "../core/ui.js";
import { kv } from "../core/store.js";
import { getFlight } from "../core/flight.js";

export default { mount: root => new Converter(root) };

const PAIRS = [
  ["Mass", "kg", "lb", v => v * 2.20462, v => v / 2.20462],
  ["Pressure", "hPa", "inHg", v => v / 33.8639, v => v * 33.8639],
  ["Temperature", "°C", "°F", v => v * 9 / 5 + 32, v => (v - 32) * 5 / 9],
  ["Altitude", "m", "ft", v => v / 0.3048, v => v * 0.3048],
  ["Distance", "NM", "km", v => v * 1.852, v => v / 1.852],
  ["Speed", "kt", "km/h", v => v * 1.852, v => v / 1.852],
  ["Volume", "L", "US gal", v => v / 3.78541, v => v * 3.78541],
  ["Vertical speed", "ft/min", "m/s", v => v * 0.00508, v => v / 0.00508],
];
const r = v => (isFinite(v) ? Math.round(v * 100) / 100 : "");

class Converter {
  constructor(root) {
    this.root = root;
    const fu = kv.get("conv.fuel", { onboard: "", required: getFlight()?.fuel?.plan_ramp || "", density: 0.8 });
    root.innerHTML = `<div class="conv"><h1>Converter</h1><div class="cards">${PAIRS.map(([n, a, b], i) => `<div class="cc"><h4>${n}</h4><label><input data-i="${i}" data-s="a" inputmode="decimal"><span>${a}</span></label><div class="sw">⇅</div><label><input data-i="${i}" data-s="b" inputmode="decimal"><span>${b}</span></label></div>`).join("")}</div>
      <h2>Fuel uplift</h2><div class="cc fuel">
        <label>Fuel on board<input data-f="onboard" value="${fu.onboard}" inputmode="decimal"><span>kg</span></label>
        <label>Required block<input data-f="required" value="${fu.required}" inputmode="decimal"><span>kg</span></label>
        <label>Density<input data-f="density" value="${fu.density}" inputmode="decimal"><span>kg/L</span></label>
        <div class="out"></div></div></div>`;
    on(root, "input", "[data-i]", (e, inp) => {
      const p = PAIRS[+inp.dataset.i], v = parseFloat(inp.value);
      const other = $(`[data-i="${inp.dataset.i}"][data-s="${inp.dataset.s === "a" ? "b" : "a"}"]`, root);
      other.value = isNaN(v) ? "" : r(inp.dataset.s === "a" ? p[3](v) : p[4](v));
    });
    on(root, "input", "[data-f]", () => this.fuel());
    this.fuel();
  }
  fuel() {
    const g = k => parseFloat($(`[data-f="${k}"]`, this.root).value);
    const fob = g("onboard") || 0, req = g("required"), d = g("density") || 0.8;
    kv.set("conv.fuel", { onboard: fob || "", required: req || "", density: d });
    const out = $(".out", this.root);
    if (!req) { out.innerHTML = "Enter required block fuel."; return; }
    const up = Math.max(0, req - fob);
    out.innerHTML = `<div><small>Uplift mass</small><b>${Math.round(up).toLocaleString()} kg</b></div><div><small>Uplift volume</small><b>${Math.round(up / d).toLocaleString()} L</b></div><div><small>US gallons</small><b>${Math.round(up / d / 3.78541).toLocaleString()}</b></div>`;
    $$("[data-f]", this.root);
  }
}
