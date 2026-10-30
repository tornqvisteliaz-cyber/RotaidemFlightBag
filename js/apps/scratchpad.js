// ScratchPad – handwriting pages with clearance / ATIS / takeoff-data templates.
import { $, $$, esc, on, toast, screenScale } from "../core/ui.js";
import { kv } from "../core/store.js";
import { UI } from "../core/icons.js";

export default { mount: root => new ScratchPad(root) };

const W = 1180, H = 700;
const TEMPLATES = {
  blank: { name: "Blank", rows: [] },
  craft: { name: "CRAFT", rows: ["C  Clearance limit", "R  Route / SID", "A  Altitude", "F  Frequency", "T  Transponder"] },
  atis: { name: "ATIS", rows: ["Information", "Time", "Runway", "Wind", "Visibility", "Cloud", "Temp / Dew", "QNH", "Remarks"] },
  tod: { name: "TO Data", rows: ["RWY / INTX", "FLAPS", "THRUST / ATM", "V1", "VR", "V2", "TRIM", "TOW / ZFW"] },
};
const COLORS = ["#1c1c1e", "#0a5bd6", "#d22f2f", "#1a9e4b"];

class ScratchPad {
  constructor(root) {
    this.root = root;
    this.pages = kv.get("scratch.pages", [{ tpl: "craft", img: null }]);
    this.cur = 0; this.color = COLORS[0]; this.size = 3; this.erase = false; this.undo = [];
    root.innerHTML = `<div class="sp"><div class="sp-bar">
      <div class="tabs"></div><button data-a="add" title="New page">${UI.plus}</button>
      <div class="sp-tools">${COLORS.map((c, i) => `<button data-c="${c}" class="dot ${i ? "" : "on"}" style="--c:${c}"></button>`).join("")}
        <button data-a="thin" class="sz on">Fine</button><button data-a="thick" class="sz">Bold</button>
        <button data-a="erase" title="Eraser">${UI.eraser}</button><button data-a="undo" title="Undo">${UI.undo}</button>
        <select data-tpl>${Object.entries(TEMPLATES).map(([k, t]) => `<option value="${k}">${t.name}</option>`).join("")}</select>
        <button data-a="clear" class="red">Clear</button><button data-a="del" title="Delete page">${UI.trash}</button></div></div>
      <div class="sp-paper"><canvas width="${W * 2}" height="${H * 2}"></canvas><div class="sp-tpl"></div></div></div>`;
    this.cv = $("canvas", root); this.cx = this.cv.getContext("2d");
    this.cx.scale(2, 2);
    on(root, "click", "[data-a]", (e, b) => this.act(b.dataset.a, b));
    on(root, "click", "[data-c]", (e, b) => { this.color = b.dataset.c; this.erase = false; $$(".dot", root).forEach(x => x.classList.toggle("on", x === b)); $('[data-a="erase"]', root).classList.remove("on"); });
    on(root, "click", "[data-p]", (e, b) => { this.save(); this.cur = +b.dataset.p; this.load(); });
    $("[data-tpl]", root).addEventListener("change", e => { this.pages[this.cur].tpl = e.target.value; this.save(); this.load(); });
    this.bindDraw();
    this.load();
  }
  bindDraw() {
    let last = null;
    const pos = e => { const r = this.cv.getBoundingClientRect(), k = screenScale(); return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k, p: e.pressure || 0.5 }; };
    this.cv.addEventListener("pointerdown", e => {
      this.cv.setPointerCapture(e.pointerId);
      this.undo.push(this.cx.getImageData(0, 0, this.cv.width, this.cv.height));
      if (this.undo.length > 30) this.undo.shift();
      last = pos(e);
    });
    this.cv.addEventListener("pointermove", e => {
      if (!last) return;
      const p = pos(e), c = this.cx;
      c.globalCompositeOperation = this.erase ? "destination-out" : "source-over";
      c.strokeStyle = this.color; c.lineCap = "round"; c.lineJoin = "round";
      c.lineWidth = this.erase ? 26 : this.size * (e.pointerType === "pen" ? 0.6 + p.p : 1);
      c.beginPath(); c.moveTo(last.x, last.y); c.lineTo(p.x, p.y); c.stroke();
      last = p;
    });
    const end = () => { if (last) { last = null; this.save(); } };
    this.cv.addEventListener("pointerup", end);
    this.cv.addEventListener("pointercancel", end);
  }
  act(a, b) {
    if (a === "add") { this.save(); this.pages.push({ tpl: "blank", img: null }); this.cur = this.pages.length - 1; this.load(); }
    if (a === "thin" || a === "thick") { this.size = a === "thin" ? 3 : 6; $$(".sz", this.root).forEach(x => x.classList.toggle("on", x === b)); }
    if (a === "erase") { this.erase = !this.erase; b.classList.toggle("on", this.erase); }
    if (a === "undo") { const d = this.undo.pop(); if (d) { this.cx.putImageData(d, 0, 0); this.save(); } }
    if (a === "clear") { this.undo.push(this.cx.getImageData(0, 0, this.cv.width, this.cv.height)); this.cx.clearRect(0, 0, W, H); this.save(); }
    if (a === "del") {
      if (this.pages.length === 1) { this.pages[0] = { tpl: "blank", img: null }; }
      else this.pages.splice(this.cur, 1);
      this.cur = Math.max(0, this.cur - 1); kv.set("scratch.pages", this.pages); this.load(); toast("Page deleted");
    }
  }
  save() {
    this.pages[this.cur].img = this.cv.toDataURL("image/png");
    try { kv.set("scratch.pages", this.pages); } catch { toast("Storage full – delete some pages"); }
  }
  load() {
    const p = this.pages[this.cur];
    this.undo = [];
    $(".tabs", this.root).innerHTML = this.pages.map((pg, i) => `<button data-p="${i}" class="${i === this.cur ? "on" : ""}">Page ${i + 1}<small>${TEMPLATES[pg.tpl]?.name || ""}</small></button>`).join("");
    $("[data-tpl]", this.root).value = p.tpl;
    const t = TEMPLATES[p.tpl] || TEMPLATES.blank;
    $(".sp-tpl", this.root).innerHTML = t.rows.length ? `<h3>${esc(t.name)}</h3>${t.rows.map(r => `<div class="ln"><span>${esc(r)}</span></div>`).join("")}` : "";
    this.cx.clearRect(0, 0, W, H);
    if (p.img) { const im = new Image(); im.onload = () => { this.cx.save(); this.cx.setTransform(1, 0, 0, 1, 0, 0); this.cx.drawImage(im, 0, 0); this.cx.restore(); }; im.src = p.img; }
  }
}
