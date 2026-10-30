// Small DOM / UI helpers shared by every app.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Parse an HTML string into a single element (or fragment when it has several roots). */
export function html(str) {
  const t = document.createElement("template");
  t.innerHTML = str.trim();
  return t.content.childElementCount === 1 ? t.content.firstElementChild : t.content;
}

/** Delegated event listener: on(root, "click", "[data-act]", (e, el) => …) */
export function on(root, type, selector, fn) {
  root.addEventListener(type, e => {
    const el = e.target.closest(selector);
    if (el && root.contains(el)) fn(e, el);
  });
}

// ---- tiny event bus ------------------------------------------------------
const bus = new EventTarget();
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));
export const listen = (name, fn) => {
  const h = e => fn(e.detail);
  bus.addEventListener(name, h);
  return () => bus.removeEventListener(name, h);
};

// ---- overlays ------------------------------------------------------------
const overlayRoot = () => document.getElementById("overlay-root");

let toastTimer;
export function toast(msg, ms = 2400) {
  let t = overlayRoot().querySelector(".toast");
  if (!t) { t = html(`<div class="toast"></div>`); overlayRoot().append(t); }
  t.textContent = msg;
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}

/** iOS style modal sheet. Returns { el, close }. */
export function modal({ title, body, done = "Done", onClose, width }) {
  const el = html(`<div class="modal-backdrop">
    <div class="modal" ${width ? `style="width:${width}px"` : ""}>
      <header><button data-x>${done ? "" : "Cancel"}</button><h3>${esc(title)}</h3><button data-x>${esc(done || "")}</button></header>
      <div class="body"></div>
    </div></div>`);
  const b = el.querySelector(".body");
  if (typeof body === "string") b.innerHTML = body; else if (body) b.append(body);
  const close = () => { el.remove(); onClose?.(); };
  el.addEventListener("click", e => { if (e.target === el || e.target.closest("[data-x]")) close(); });
  overlayRoot().append(el);
  return { el, body: b, close };
}

/** Popover anchored to an element, positioned inside the screen. */
export function popover(anchor, content, { side = "bottom", className = "", width } = {}) {
  closePopovers();
  const screen = document.getElementById("screen");
  const scale = screenScale();
  const sr = screen.getBoundingClientRect();
  const ar = anchor.getBoundingClientRect();
  const pop = html(`<div class="popover ${className}"><div class="popover-inner"></div></div>`);
  const inner = pop.firstElementChild;
  if (typeof content === "string") inner.innerHTML = content; else inner.append(content);
  if (width) pop.style.width = width + "px";
  const shield = html(`<div class="popover-shield"></div>`);
  shield.addEventListener("pointerdown", e => { e.preventDefault(); closePopovers(); });
  overlayRoot().append(shield, pop);
  const a = {
    l: (ar.left - sr.left) / scale, t: (ar.top - sr.top) / scale,
    r: (ar.right - sr.left) / scale, b: (ar.bottom - sr.top) / scale,
  };
  const W = screen.offsetWidth, H = screen.offsetHeight;
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let x, y;
  if (side === "bottom") { x = a.l; y = a.b + 6; }
  else if (side === "top") { x = a.l; y = a.t - ph - 6; }
  else if (side === "left") { x = a.l - pw - 6; y = a.t; }
  else { x = a.r + 6; y = a.t; }
  x = Math.max(8, Math.min(W - pw - 8, x));
  y = Math.max(30, Math.min(H - ph - 8, y));
  pop.style.left = x + "px";
  pop.style.top = y + "px";
  return { el: pop, inner, close: closePopovers };
}
export function closePopovers() {
  overlayRoot().querySelectorAll(".popover, .popover-shield").forEach(n => n.remove());
}

/** Current CSS scale of the virtual screen (1 in fullscreen mode). */
export function screenScale() {
  const s = document.getElementById("screen");
  return s.getBoundingClientRect().width / s.offsetWidth || 1;
}

// ---- formatting ----------------------------------------------------------
export const pad = (n, l = 2) => String(n).padStart(l, "0");
export const zulu = (d = new Date()) => `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}Z`;
export const hhmm = d => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
export const fmtNum = (n, digits = 0) =>
  n == null || isNaN(n) ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
export const secToHM = s => {
  if (s == null || isNaN(s)) return "—";
  const m = Math.round(s / 60);
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};

/** Load a classic script once (for UMD libraries). */
const loaded = new Map();
export function loadScript(src) {
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = () => rej(new Error("Failed to load " + src));
      document.head.append(s);
    }));
  }
  return loaded.get(src);
}

/** Make an element pannable/zoomable (mouse wheel, drag, pinch). Returns controller. */
export function panZoom(viewport, content, { min = 0.2, max = 8, onChange } = {}) {
  let s = 1, x = 0, y = 0;
  const pts = new Map();
  let last = null;
  const apply = () => {
    content.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    onChange?.({ s, x, y });
  };
  const local = e => {
    const r = viewport.getBoundingClientRect(), k = screenScale();
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
  };
  const zoomAt = (px, py, f) => {
    const ns = Math.max(min, Math.min(max, s * f));
    f = ns / s;
    x = px - (px - x) * f; y = py - (py - y) * f; s = ns;
    apply();
  };
  viewport.addEventListener("wheel", e => {
    e.preventDefault();
    const p = local(e);
    zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)));
  }, { passive: false });
  viewport.addEventListener("pointerdown", e => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    viewport.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, local(e));
    last = null;
  });
  viewport.addEventListener("pointermove", e => {
    if (!pts.has(e.pointerId)) return;
    const p = local(e);
    const prev = pts.get(e.pointerId);
    pts.set(e.pointerId, p);
    if (pts.size === 1) { x += p.x - prev.x; y += p.y - prev.y; apply(); }
    else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (last) { x += c.x - last.c.x; y += c.y - last.c.y; zoomAt(c.x, c.y, d / last.d); }
      last = { d, c };
    }
  });
  const end = e => { pts.delete(e.pointerId); last = null; };
  viewport.addEventListener("pointerup", end);
  viewport.addEventListener("pointercancel", end);
  viewport.addEventListener("dblclick", e => { const p = local(e); zoomAt(p.x, p.y, 2); });
  return {
    fit(w, h, mode = "contain") {
      const vw = viewport.clientWidth, vh = viewport.clientHeight;
      s = mode === "width" ? (vw - 40) / w : Math.min((vw - 40) / w, (vh - 40) / h);
      x = (vw - w * s) / 2; y = mode === "width" ? 20 : (vh - h * s) / 2;
      apply();
    },
    zoom(f) { zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, f); },
    get state() { return { s, x, y }; },
  };
}
