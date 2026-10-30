// Checklist – electronic normal checklist (generic twin-jet flow, simulation use).
import { $, esc, on } from "../core/ui.js";
import { kv } from "../core/store.js";

export default { mount: root => new ChecklistApp(root) };

const LISTS = [
  ["PREFLIGHT", [["Oxygen", "Tested, 100%"], ["Navigation transfer and display switches", "NORMAL, AUTO"], ["Window heat", "On"], ["Pressurization mode selector", "AUTO"], ["Flight instruments", "Heading __, Altimeter __"], ["Parking brake", "Set"], ["Engine start levers", "CUTOFF"]]],
  ["BEFORE START", [["Flight deck door", "Closed and locked"], ["Fuel", "____ KGS, Pumps ON"], ["Passenger signs", "Set"], ["Windows", "Locked"], ["MCP", "V2 __, HDG __, ALT __"], ["Takeoff speeds", "V1 __, VR __, V2 __"], ["CDU preflight", "Completed"], ["Rudder and aileron trim", "Free and 0"], ["Taxi and takeoff briefing", "Completed"], ["Anti collision light", "On"]]],
  ["BEFORE TAXI", [["Generators", "On"], ["Probe heat", "On"], ["Anti-ice", "As required"], ["Isolation valve", "AUTO"], ["Engine start switches", "CONT"], ["Recall", "Checked"], ["Autobrake", "RTO"], ["Engine start levers", "IDLE detent"], ["Flight controls", "Checked"], ["Ground equipment", "Clear"]]],
  ["BEFORE TAKEOFF", [["Flaps", "__, Green light"], ["Stabilizer trim", "__ Units"], ["Cabin", "Secure"], ["Transponder", "TA/RA"], ["Takeoff clearance", "Received"]]],
  ["AFTER TAKEOFF", [["Engine bleeds", "On"], ["Packs", "AUTO"], ["Landing gear", "UP and OFF"], ["Flaps", "UP, No lights"], ["Altimeters", "Set STD at transition"]]],
  ["DESCENT", [["Pressurization", "LAND ALT __"], ["Recall", "Checked"], ["Autobrake", "__"], ["Landing data", "VREF __, Minimums __"], ["Approach briefing", "Completed"]]],
  ["APPROACH", [["Altimeters", "QNH __"], ["Seat belt sign", "On"], ["Approach aids", "Set and identified"]]],
  ["LANDING", [["Engine start switches", "CONT"], ["Speedbrake", "ARMED"], ["Landing gear", "Down, 3 green"], ["Flaps", "__, Green light"]]],
  ["SHUTDOWN", [["Fuel pumps", "Off"], ["Probe heat", "Off"], ["Hydraulic panel", "Set"], ["Flaps", "UP"], ["Parking brake", "Set"], ["Engine start levers", "CUTOFF"], ["Weather radar", "Off"]]],
  ["SECURE", [["IRS mode selectors", "OFF"], ["Emergency exit lights", "OFF"], ["Window heat", "Off"], ["Packs", "OFF"]]],
];

class ChecklistApp {
  constructor(root) {
    this.root = root;
    this.st = kv.get("checklist", { cur: 0, done: {} });
    on(root, "click", "[data-l]", (e, b) => { this.st.cur = +b.dataset.l; this.render(); });
    on(root, "click", "[data-i]", (e, b) => { const k = `${this.st.cur}.${b.dataset.i}`; this.st.done[k] = !this.st.done[k]; this.render(); });
    on(root, "click", "[data-a]", (e, b) => {
      const a = b.dataset.a;
      if (a === "next") this.st.cur = Math.min(LISTS.length - 1, this.st.cur + 1);
      if (a === "reset") { for (const k of Object.keys(this.st.done)) if (k.startsWith(this.st.cur + ".")) delete this.st.done[k]; }
      if (a === "resetall") this.st = { cur: 0, done: {} };
      if (a === "override") LISTS[this.st.cur][1].forEach((_, i) => { this.st.done[`${this.st.cur}.${i}`] = true; });
      this.render();
    });
    this.render();
  }
  isDone(l) { return LISTS[l][1].every((_, i) => this.st.done[`${l}.${i}`]); }
  render() {
    kv.set("checklist", this.st);
    const [name, items] = LISTS[this.st.cur];
    const next = items.findIndex((_, i) => !this.st.done[`${this.st.cur}.${i}`]);
    this.root.innerHTML = `<div class="ckl"><aside><h1>NORMAL</h1>${LISTS.map(([n], i) => `<button data-l="${i}" class="${i === this.st.cur ? "on" : ""} ${this.isDone(i) ? "done" : ""}">${this.isDone(i) ? "✓ " : ""}${n}</button>`).join("")}
      <button class="reset" data-a="resetall">RESET ALL</button></aside>
      <main><h2>${name}</h2><div class="items">${items.map(([a, b], i) => {
        const d = this.st.done[`${this.st.cur}.${i}`];
        return `<button data-i="${i}" class="${d ? "done" : ""} ${i === next ? "next" : ""}"><span class="box">${d ? "✓" : ""}</span><span class="a">${esc(a)}</span><span class="dots"></span><span class="b">${esc(b)}</span></button>`;
      }).join("")}</div>
      ${next === -1 ? `<div class="complete">${name} CHECKLIST COMPLETE</div>` : ""}
      <div class="bar"><button data-a="reset">CHKL RESET</button><button data-a="override">ITEM OVRD</button><button data-a="next" class="go">NORMAL ›</button></div></main></div>`;
  }
}
