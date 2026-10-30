// Logbook – personal flight log stored on the device.
import { $, esc, on, toast, pad } from "../core/ui.js";
import { kv } from "../core/store.js";
import { getFlight } from "../core/flight.js";

export default { mount: root => new Logbook(root) };

const dur = (a, b) => (a && b ? (b - a) / 60000 : 0);
const hm = m => `${Math.floor(m / 60)}:${pad(Math.round(m % 60))}`;
const zt = t => (t ? `${pad(new Date(t).getUTCHours())}${pad(new Date(t).getUTCMinutes())}` : "");

class Logbook {
  constructor(root) {
    this.root = root;
    on(root, "click", "[data-a]", (e, b) => this.act(b.dataset.a, b));
    this.render();
  }
  logs() { return kv.get("logbook", []); }
  act(a, b) {
    const logs = this.logs();
    if (a === "addflight") {
      const f = getFlight();
      if (!f) return toast("No flight loaded");
      logs.unshift({ id: Date.now(), date: new Date(f.times?.out || Date.now()).toISOString().slice(0, 10), from: f.orig.icao, to: f.dest.icao, type: f.aircraft?.icao || "", reg: f.aircraft?.reg || "", flt: f.callsign, out: f.times?.out, off: f.times?.off, on: f.times?.on, in: f.times?.in || (f.times?.on ? f.times.on + 8 * 60e3 : null) });
      kv.set("logbook", logs); toast("Planned flight added – edit times in Clock › Block Times for actuals");
    }
    if (a === "add") {
      const fd = Object.fromEntries([...this.root.querySelectorAll(".new input")].map(i => [i.name, i.value.trim().toUpperCase()]));
      if (!fd.from || !fd.to) return toast("Enter From and To");
      const toMs = s => (/^\d{4}$/.test(s) ? Date.parse(`${fd.date || new Date().toISOString().slice(0, 10)}T${s.slice(0, 2)}:${s.slice(2)}:00Z`) : null);
      logs.unshift({ id: Date.now(), date: fd.date || new Date().toISOString().slice(0, 10), from: fd.from, to: fd.to, type: fd.type, reg: fd.reg, flt: fd.flt, out: toMs(fd.out), in: toMs(fd.in) });
      kv.set("logbook", logs);
    }
    if (a === "del") { kv.set("logbook", logs.filter(l => String(l.id) !== b.dataset.id)); }
    if (a === "csv") {
      const rows = [["Date", "Flight", "From", "To", "Type", "Reg", "Out", "Off", "On", "In", "Block"], ...logs.map(l => [l.date, l.flt, l.from, l.to, l.type, l.reg, zt(l.out), zt(l.off), zt(l.on), zt(l.in), hm(dur(l.out, l.in))])];
      const url = URL.createObjectURL(new Blob([rows.map(r => r.join(",")).join("\n")], { type: "text/csv" }));
      const link = document.createElement("a"); link.href = url; link.download = "logbook.csv"; link.click();
    }
    this.render();
  }
  render() {
    const logs = this.logs();
    const total = logs.reduce((s, l) => s + dur(l.out, l.in), 0);
    const byType = {};
    for (const l of logs) byType[l.type || "—"] = (byType[l.type || "—"] || 0) + dur(l.out, l.in);
    this.root.innerHTML = `<div class="logb"><header><h1>Logbook</h1><div><button class="ios-btn small secondary" data-a="csv">Export CSV</button> <button class="ios-btn small" data-a="addflight">+ Current flight</button></div></header>
      <div class="totals"><div><small>Flights</small><b>${logs.length}</b></div><div><small>Block time</small><b>${hm(total)}</b></div>${Object.entries(byType).slice(0, 4).map(([t, m]) => `<div><small>${esc(t)}</small><b>${hm(m)}</b></div>`).join("")}</div>
      <div class="new">${[["date", "Date", new Date().toISOString().slice(0, 10)], ["flt", "Flight"], ["from", "From"], ["to", "To"], ["type", "Type"], ["reg", "Reg"], ["out", "Out (UTC)"], ["in", "In (UTC)"]].map(([n, p, v]) => `<input name="${n}" placeholder="${p}" value="${v || ""}">`).join("")}<button class="ios-btn small" data-a="add">Add</button></div>
      <table><thead><tr><th>Date</th><th>Flight</th><th>Route</th><th>Aircraft</th><th>Out</th><th>In</th><th>Block</th><th></th></tr></thead><tbody>
      ${logs.map(l => `<tr><td>${esc(l.date)}</td><td>${esc(l.flt || "")}</td><td><b>${esc(l.from)}</b> → <b>${esc(l.to)}</b></td><td>${esc(l.type)} ${esc(l.reg || "")}</td><td>${zt(l.out)}</td><td>${zt(l.in)}</td><td>${l.out && l.in ? hm(dur(l.out, l.in)) : "—"}</td><td><button class="x" data-a="del" data-id="${l.id}">✕</button></td></tr>`).join("") || `<tr><td colspan="8" class="empty">No flights logged yet.</td></tr>`}
      </tbody></table></div>`;
  }
}
