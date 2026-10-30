// iPad shell: scaling, status bar, home screen, app lifecycle, app switcher,
// Spotlight search, Control Center and home-screen editing.
import { $, $$, html, esc, on, listen, toast, pad, secToHM, fmtNum, screenScale } from "./core/ui.js";
import { APP_ICONS } from "./core/icons.js";
import { settings, setSetting } from "./core/store.js";
import { getFlight, fetchSimbrief } from "./core/flight.js";
import { loadAirports, searchAirports } from "./core/airports.js";
import { APPS, byId, layout, uninstall, moveApp } from "./core/registry.js";
import { WALLPAPERS } from "./core/wallpapers.js";
import { widgetsHTML, updateWidgets, tickClock } from "./core/widgets.js";
import { applyPairing, connectSheet, installHint, isStandalone, isIOS } from "./core/pair.js";
import { startSim, simState, onSim } from "./core/sim.js";
import { I } from "./core/sf.js";

const screen = $("#screen");
const windows = $("#windows");
const statusbar = $("#statusbar");
const indicator = $("#home-indicator");
const running = new Map(); // id -> { win, inst, def }
let active = null;

// ---- device scaling -------------------------------------------------------
const params = new URLSearchParams(location.search);
const justPaired = applyPairing();
// Installed on a real iPad: iPadOS draws its own status bar over the top inset.
if (isStandalone() && isIOS()) document.body.classList.add("native-sb");
const autoFull = matchMedia("(display-mode: standalone)").matches || (matchMedia("(pointer: coarse)").matches && Math.min(innerWidth, innerHeight) >= 700);
const isFull = () => params.has("fullscreen") || settings().frame === "off" || (settings().frame !== "on" && autoFull && !params.has("frame"));

function fit() {
  document.body.classList.toggle("fullscreen", isFull());
  const ipad = $("#ipad");
  if (isFull()) { ipad.style.transform = ""; return; }
  const w = 1180 + 40, h = 820 + 40;
  const s = Math.min((innerWidth - 24) / w, (innerHeight - 24) / h, 1.4);
  ipad.style.transform = `translate(-50%, -50%) scale(${s})`;
}
const deskPill = html(`<button class="desk-connect" title="Open this EFB on your iPad"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="2.5" width="16" height="19" rx="2.5"/><path d="M10 18.5h4"/></svg> Connect iPad</button>`);
deskPill.addEventListener("click", () => connectSheet());
$("#stage").append(deskPill);
addEventListener("resize", () => { fit(); for (const r of running.values()) r.inst?.show?.(); });
fit();

// ---- display: wallpaper, brightness, night shift ---------------------------
const dim = html(`<div id="dim"></div>`), warm = html(`<div id="warm"></div>`);
screen.append(dim, warm);
function applyDisplay() {
  const s = settings();
  $("#wallpaper").style.background = WALLPAPERS[s.wallpaper || 0]?.css || "";
  $("#wallpaper").classList.toggle("custom", !!s.wallpaper);
  dim.style.opacity = String((1 - (s.brightness ?? 1)) * 0.75);
  warm.style.opacity = s.nightShift ? "1" : "0";
}
applyDisplay();

// ---- status bar -----------------------------------------------------------
let battery = { level: 1, charging: false };
navigator.getBattery?.().then(b => {
  const upd = () => { battery = { level: b.level, charging: b.charging }; renderStatus(); };
  b.addEventListener("levelchange", upd); b.addEventListener("chargingchange", upd); upd();
}).catch(() => {});

function renderStatus() {
  const d = new Date();
  const sep = settings().timeSep || ".";
  const day = d.toLocaleDateString("en-GB", { weekday: "short" });
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const pct = Math.round(battery.level * 100);
  statusbar.innerHTML = `
    <div class="sb-left"><span>${pad(d.getHours())}${sep}${pad(d.getMinutes())}</span><span class="date">${day} ${date}</span></div>
    <div class="sb-right">
      <svg width="11" height="11" viewBox="0 0 12 12"><path d="M11 1 L1 5.5 L5.6 6.4 L6.5 11z"/></svg>
      <svg width="17" height="12" viewBox="0 0 17 12"><path d="M8.5 2.2c2.5 0 4.8 1 6.5 2.6l1.3-1.3C14.2 1.4 11.5.2 8.5.2S2.8 1.4.7 3.5L2 4.8c1.7-1.6 4-2.6 6.5-2.6zm0 3.6c1.5 0 2.9.6 3.9 1.6l1.3-1.3C12.3 4.8 10.5 4 8.5 4S4.7 4.8 3.3 6.1l1.3 1.3c1-1 2.4-1.6 3.9-1.6zm0 3.5c-.6 0-1.1.2-1.5.6L8.5 11.4 10 9.9c-.4-.4-.9-.6-1.5-.6z"/></svg>
      ${settings().dnd ? `<svg width="11" height="12" viewBox="0 0 12 12"><path d="M7.5 1A5.5 5.5 0 1 0 11 9.6 4.6 4.6 0 0 1 7.5 1z"/></svg>` : ""}
      <span class="batt"><span>${pct}%</span><span class="batt-body"><span class="batt-fill ${pct <= 20 && !battery.charging ? "low" : ""}" style="width:${Math.max(6, pct)}%"></span></span></span>
    </div>`;
}
setInterval(renderStatus, 10e3);
renderStatus();

function setBar(style) {
  statusbar.classList.toggle("dark", style === "dark");
  indicator.classList.toggle("dark", style === "dark");
}

// ---- home screen ----------------------------------------------------------
let editing = false;
function iconHTML(id) {
  const a = byId[id];
  if (!a) return "";
  return `<div class="app-icon" data-app="${id}">
    <div class="ic">${APP_ICONS[id] || ""}</div>
    ${!a.core ? `<button class="rm" data-rm="${id}" aria-label="Remove ${esc(a.name)}">−</button>` : ""}
    <span class="name">${esc(a.name)}</span></div>`;
}

function renderHome() {
  const l = layout();
  const recents = [...running.keys()].filter(id => !l.dock.includes(id) && byId[id]).slice(-3);
  $("#home").innerHTML = `
    <div class="hs">${widgetsHTML()}${l.grid.map(iconHTML).join("")}</div>
    <div class="page-dots"><i class="on"></i><i></i></div>
    <div class="dock">${l.dock.map(iconHTML).join("")}<div class="sep"></div>${recents.map(iconHTML).join("")}
      <div class="app-icon al-dock" data-library><div class="ic">${libraryIcon()}</div><span class="name">App Library</span></div></div>
    ${editing ? `<button class="edit-done" data-done>Done</button>` : ""}`;
  $("#home").classList.toggle("editing", editing);
  renderWidgets();
}
const libraryIcon = () => {
  const ids = APPS.filter(a => !a.core).slice(0, 4).map(a => a.id);
  return `<div class="lib-ic">${ids.map(id => `<span>${APP_ICONS[id]}</span>`).join("")}</div>`;
};

function renderWidgets() { updateWidgets(); }

// App Library: every installed app, grouped by category (as on iPadOS).
function appLibrary() {
  if ($(".applib")) return;
  const l = layout(), inst = new Set([...l.grid, ...l.dock]);
  const cats = {};
  for (const a of APPS) if (inst.has(a.id)) (cats[a.category] ||= []).push(a);
  const lib = html(`<div class="applib"><div class="al-box">
    <div class="al-search">${I.search}<input placeholder="App Library" autocomplete="off"></div>
    <div class="al-grid">${Object.entries(cats).map(([c, apps]) => `<div class="al-folder"><div class="al-tile">${apps.slice(0, 4).map(a => `<button data-open="${a.id}" title="${esc(a.name)}">${APP_ICONS[a.id]}</button>`).join("")}</div><span>${esc(c)}</span></div>`).join("")}</div>
    <div class="al-list hidden"></div></div></div>`);
  $("#overlay-root").append(lib);
  requestAnimationFrame(() => lib.classList.add("show"));
  const inp = $("input", lib), list = $(".al-list", lib);
  inp.addEventListener("input", () => {
    const q = inp.value.trim().toLowerCase();
    $(".al-grid", lib).classList.toggle("hidden", !!q);
    list.classList.toggle("hidden", !q);
    list.innerHTML = APPS.filter(a => inst.has(a.id) && a.name.toLowerCase().includes(q)).map(a => `<button data-open="${a.id}"><span class="ic">${APP_ICONS[a.id]}</span>${esc(a.name)}</button>`).join("");
  });
  lib.addEventListener("click", e => {
    const b = e.target.closest("[data-open]");
    if (b) { lib.remove(); openApp(b.dataset.open); return; }
    if (e.target === lib) { lib.classList.remove("show"); setTimeout(() => lib.remove(), 200); }
  });
}
setInterval(tickClock, 1000);
setInterval(renderWidgets, 15e3);
listen("flight", renderWidgets);
listen("home", renderHome);
listen("settings", ({ key }) => { renderStatus(); renderWidgets(); applyDisplay(); if (key === "frame") fit(); });

const home = $("#home");
on(home, "click", "[data-fetch]", async e => {
  e.stopPropagation();
  if (!settings().simbriefUser) return openApp("briefing");
  try { await fetchSimbrief(); toast("Latest SimBrief OFP imported"); } catch (err) { toast(err.message); }
});
on(home, "click", "[data-rm]", (e, b) => { e.stopPropagation(); confirmRemove(b.dataset.rm); });
on(home, "click", "[data-done]", () => { editing = false; renderHome(); });
on(home, "click", "[data-spot]", () => spotlight());
on(home, "click", "[data-library]", e => { e.stopPropagation(); appLibrary(); });
on(home, "click", "[data-open-sim]", () => openApp("settings", { section: "sim" }));
on(home, "click", "[data-app]", (e, el) => {
  if (longPressed) { longPressed = false; return; }
  if (editing || e.target.closest("[data-rm], [data-fetch]")) return;
  openApp(el.dataset.app);
});

// Long press → context menu (iPadOS style); "Edit Home Screen" → jiggle mode.
let pressTimer = null, longPressed = false;
home.addEventListener("pointerdown", e => {
  const icon = e.target.closest(".app-icon");
  longPressed = false;
  clearTimeout(pressTimer);
  if (!icon || editing) return;
  const x0 = e.clientX, y0 = e.clientY;
  pressTimer = setTimeout(() => { longPressed = true; navigator.vibrate?.(10); iconMenu(icon); }, 520);
  const cancelOnMove = ev => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 10) clearTimeout(pressTimer); };
  home.addEventListener("pointermove", cancelOnMove);
  home.addEventListener("pointerup", () => home.removeEventListener("pointermove", cancelOnMove), { once: true });
});
["pointerup", "pointerleave", "pointercancel"].forEach(t => home.addEventListener(t, () => clearTimeout(pressTimer)));
// Touch long-press already opens the menu; only a mouse right-click needs this.
home.addEventListener("contextmenu", e => { e.preventDefault(); const icon = e.target.closest(".app-icon"); if (icon && !longPressed) { longPressed = true; iconMenu(icon); } });
// Pull down on empty home screen → Spotlight
home.addEventListener("pointerdown", e => {
  if (e.target.closest(".app-icon, .wg, .dock, button")) return;
  const y0 = e.clientY;
  const up = ev => { removeEventListener("pointerup", up); if ((ev.clientY - y0) / screenScale() > 50) spotlight(); };
  addEventListener("pointerup", up);
});

function iconMenu(icon) {
  const id = icon.dataset.app, a = byId[id];
  const inDock = layout().dock.includes(id);
  const s = screen.getBoundingClientRect(), r = icon.getBoundingClientRect(), k = screenScale();
  const x = (r.left - s.left) / k, y = (r.top - s.top) / k;
  const below = y + 300 < screen.offsetHeight;
  const menu = html(`<div class="ctx-wrap"><div class="ctx-blur"></div>
    <div class="ctx-icon" style="left:${x}px;top:${y}px">${icon.querySelector(".ic").outerHTML}</div>
    <div class="ctx-menu" style="left:${Math.min(Math.max(10, x - 10), screen.offsetWidth - 280)}px;top:${below ? y + 92 : y - 16 - (a.core ? 150 : 200)}px">
      <button data-c="open">Open ${esc(a.name)}<span>${I.arrowUpRight}</span></button>
      <button data-c="move">${inDock ? "Move to Home Screen" : "Move to Dock"}<span>${I.move}</span></button>
      <button data-c="edit">Edit Home Screen<span>${I.pencil}</span></button>
      ${a.core ? "" : `<button data-c="rm" class="red">Remove App<span>${I.minusCircle}</span></button>`}
    </div></div>`);
  $("#overlay-root").append(menu);
  menu.addEventListener("click", e => {
    const c = e.target.closest("[data-c]")?.dataset.c;
    menu.remove();
    if (c === "open") openApp(id);
    if (c === "move") moveApp(id, !inDock);
    if (c === "edit") { editing = true; renderHome(); }
    if (c === "rm") confirmRemove(id);
  });
}

function confirmRemove(id) {
  const a = byId[id];
  const al = html(`<div class="alert-wrap"><div class="alert"><b>Remove “${esc(a.name)}”?</b><p>The app is removed from the Home Screen and closed. You can get it again from the App Store.</p>
    <button data-x="rm" class="red">Delete App</button><button data-x="cancel">Cancel</button></div></div>`);
  $("#overlay-root").append(al);
  al.addEventListener("click", e => {
    const x = e.target.closest("[data-x]")?.dataset.x;
    if (!x) return;
    al.remove();
    if (x === "rm") { closeApp(id); uninstall(id); toast(`${a.name} removed`); }
  });
}

// ---- Spotlight --------------------------------------------------------------
function spotlight() {
  if ($(".spot")) return;
  const s = html(`<div class="spot"><div class="spot-box">
    <div class="spot-in"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 L21 21"/></svg><input placeholder="Search apps, airports…" autocomplete="off" spellcheck="false"><button data-x>Cancel</button></div>
    <div class="spot-res"></div></div></div>`);
  $("#overlay-root").append(s);
  const inp = $("input", s), res = $(".spot-res", s);
  const run = async () => {
    const q = inp.value.trim();
    const l = layout(), inst = l.grid.concat(l.dock);
    const apps = APPS.filter(a => inst.includes(a.id) && (!q || a.name.toLowerCase().includes(q.toLowerCase()) || a.subtitle.toLowerCase().includes(q.toLowerCase())));
    const aps = q.length >= 2 ? await searchAirports(q, 6) : [];
    res.innerHTML = `${apps.length ? `<h5>${q ? "Apps" : "Suggestions"}</h5><div class="spot-apps">${apps.slice(0, 8).map(a => `<button data-open="${a.id}"><span class="ic">${APP_ICONS[a.id]}</span>${esc(a.name)}</button>`).join("")}</div>` : ""}
      ${aps.length ? `<h5>Airports</h5>${aps.map(a => `<button class="row" data-apt="${a.icao}"><b>${a.icao}</b><span>${esc(a.name)} · ${esc(a.city || "")} ${esc(a.country)}</span><em>Charts ›</em></button>`).join("")}` : ""}
      ${q && !apps.length && !aps.length ? `<p class="none">No Results</p>` : ""}`;
  };
  inp.addEventListener("input", run);
  inp.addEventListener("keydown", e => { if (e.key === "Enter") $("[data-open], [data-apt]", res)?.click(); if (e.key === "Escape") s.remove(); });
  s.addEventListener("click", e => {
    if (e.target === s || e.target.closest("[data-x]")) return s.remove();
    const t = e.target.closest("[data-open], [data-apt]");
    if (!t) return;
    s.remove();
    if (t.dataset.open) openApp(t.dataset.open);
    if (t.dataset.apt) openApp("charts", { icao: t.dataset.apt });
  });
  run();
  inp.focus();
}

// ---- Control Center -----------------------------------------------------------
const ccHot = html(`<div id="cc-hot" title="Control Center"></div>`);
screen.append(ccHot);
ccHot.addEventListener("click", () => controlCenter());
function controlCenter() {
  if ($(".cc")) return;
  const s = settings(), f = getFlight();
  const cc = html(`<div class="cc"><div class="cc-grid">
    <div class="cc-tile now"><small>FLIGHT</small><b>${esc(f ? `${f.callsign} ${f.orig.icao}–${f.dest.icao}` : "No flight")}</b><button data-cc="sb">↻ Refresh OFP</button></div>
    <div class="cc-slider" title="Brightness"><input type="range" min="0.25" max="1" step="0.01" value="${s.brightness ?? 1}" data-cc="bright"><i>${I.sunDim}</i></div>
    <button class="cc-sq ${s.dnd ? "on" : ""}" data-cc="dnd"><span>${I.moon}</span><small>Do Not Disturb</small></button>
    <button class="cc-sq ${s.nightShift ? "on warm" : ""}" data-cc="night"><span>${I.nightShift}</span><small>Night Shift</small></button>
    <button class="cc-sq ${s.chartTheme === "night" ? "on" : ""}" data-cc="charts"><span>${I.contrast}</span><small>Charts Night</small></button>
    <button class="cc-sq ${isFull() ? "on" : ""}" data-cc="frame"><span>${I.expand}</span><small>Full Screen</small></button>
    <button class="cc-sq" data-cc="timer"><span>${I.timer}</span><small>Timer</small></button>
    <button class="cc-sq" data-cc="conv"><span>${I.arrows}</span><small>Converter</small></button>
    <button class="cc-sq" data-cc="settings"><span>${I.gear}</span><small>Settings</small></button>
    <button class="cc-sq" data-cc="search"><span>${I.search}</span><small>Search</small></button>
    <button class="cc-wide" data-cc="sim"><span class="${simState().connected ? "live" : ""}">${I.plane}</span><div><b>${simState().connected ? esc(simState().source) + " connected" : "Simulator"}</b><small>${esc(simState().connected ? (simState().callsign || simState().title || "Live aircraft position") : (simState().status || "Not connected"))}</small></div></button>
    <button class="cc-wide" data-cc="pair"><span>${I.ipad}</span><div><b>Connect iPad</b><small>Scan a QR code to open the EFB on your iPad</small></div></button>
  </div></div>`);
  $("#overlay-root").append(cc);
  requestAnimationFrame(() => cc.classList.add("show"));
  const close = () => { cc.classList.remove("show"); setTimeout(() => cc.remove(), 250); };
  cc.addEventListener("click", e => {
    if (e.target === cc) return close();
    const b = e.target.closest("[data-cc]");
    if (!b || b.dataset.cc === "bright") return;
    const k = b.dataset.cc;
    if (k === "dnd") { setSetting("dnd", !settings().dnd); b.classList.toggle("on"); }
    if (k === "night") { setSetting("nightShift", !settings().nightShift); b.classList.toggle("on"); b.classList.toggle("warm"); }
    if (k === "charts") { setSetting("chartTheme", settings().chartTheme === "night" ? "day" : "night"); b.classList.toggle("on"); }
    if (k === "frame") { setSetting("frame", isFull() ? "on" : "off"); b.classList.toggle("on", isFull()); }
    if (k === "timer") { close(); openApp("clock", { tab: "timer" }); }
    if (k === "conv") { close(); const l = layout(); l.grid.concat(l.dock).includes("converter") ? openApp("converter") : openApp("appstore", { app: "converter" }); }
    if (k === "settings") { close(); openApp("settings"); }
    if (k === "pair") { close(); connectSheet(); }
    if (k === "sim") { close(); openApp("settings", { section: "sim" }); }
    if (k === "search") { close(); goHome(); setTimeout(spotlight, 300); }
    if (k === "sb") { close(); fetchSimbrief().then(fl => toast(`Imported ${fl.callsign}`)).catch(err => toast(err.message)); }
  });
  $("[data-cc=bright]", cc).addEventListener("input", e => setSetting("brightness", +e.target.value));
}

// ---- app lifecycle --------------------------------------------------------
const ctx = {
  open: (id, args) => openApp(id, args),
  home: () => goHome(),
  isActive: id => active === id,
};

function iconRect(id) {
  if (active) return null;
  const ic = $(`#home .app-icon[data-app="${id}"] .ic`);
  if (!ic) return null;
  const s = screen.getBoundingClientRect(), r = ic.getBoundingClientRect(), k = screenScale();
  if (!r.width) return null;
  return { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k };
}
function transformFromRect(r) {
  const W = screen.offsetWidth, H = screen.offsetHeight;
  if (!r) return "scale(.85)";
  return `translate(${r.x + r.w / 2 - W / 2}px, ${r.y + r.h / 2 - H / 2}px) scale(${r.w / W}, ${r.h / H})`;
}

async function openApp(id, args) {
  const def = byId[id];
  if (!def) return;
  $$(".spot, .ctx-wrap, .popover, .popover-shield").forEach(n => n.remove());
  if (screen.classList.contains("switcher")) exitSwitcher();
  const fromHome = !active;
  const startRect = iconRect(id);
  if (active && active !== id) hideWindow(active, false);
  let rec = running.get(id);
  const fresh = !rec;
  if (fresh) {
    const win = html(`<div class="app-window" data-win="${id}"><div class="app-root"></div>
      <div class="launch" style="background:${def.splash}"><div class="launch-ic">${APP_ICONS[id]}</div></div></div>`);
    windows.append(win);
    rec = { win, def, inst: null };
    running.set(id, rec);
  }
  const { win } = rec;
  active = id;
  screen.classList.add("app-open");
  setBar(def.bar);
  win.classList.add("visible", "opening");
  win.style.transition = "none";
  win.style.opacity = "1";
  win.style.transform = fromHome ? transformFromRect(startRect) : "translateX(60px) scale(.97)";
  win.getBoundingClientRect();
  win.style.transition = "";
  win.style.transform = "none";
  setTimeout(() => win.classList.remove("opening"), 430);
  if (fresh) {
    try {
      const mod = await def.load();
      rec.inst = await mod.default.mount(win.querySelector(".app-root"), ctx, args);
    } catch (err) {
      console.error(err);
      win.querySelector(".app-root").innerHTML = `<div class="app-crash">${esc(def.name)} quit unexpectedly.<small>${esc(err.message)}</small></div>`;
    }
    setTimeout(() => win.querySelector(".launch")?.classList.add("gone"), 150);
    setTimeout(() => win.querySelector(".launch")?.remove(), 700);
  } else {
    win.querySelector(".launch")?.remove();
    rec.inst?.show?.(args);
  }
}

function hideWindow(id, animate = true) {
  const rec = running.get(id);
  if (!rec) return;
  const { win } = rec;
  rec.inst?.hide?.();
  if (!animate) { win.classList.remove("visible"); return; }
  win.classList.add("closing");
  active = null;
  win.style.transform = transformFromRect(iconRect(id));
  win.style.opacity = "0";
  setTimeout(() => { win.classList.remove("visible", "closing"); win.style.opacity = ""; }, 400);
}

function goHome() {
  $$(".popover, .popover-shield, .spot, .cc, .ctx-wrap").forEach(n => n.remove());
  if (screen.classList.contains("switcher")) exitSwitcher();
  renderHome();
  if (active) hideWindow(active);
  active = null;
  screen.classList.remove("app-open");
  setBar("light");
}

function closeApp(id) {
  const rec = running.get(id);
  if (!rec) return;
  try { rec.inst?.destroy?.(); } catch (e) { console.warn(e); }
  rec.win.remove();
  running.delete(id);
  if (active === id) { active = null; screen.classList.remove("app-open"); setBar("light"); }
}

// ---- app switcher ---------------------------------------------------------
function enterSwitcher() {
  $$(".popover, .popover-shield, .at-menu").forEach(n => n.remove());
  const ids = [...running.keys()];
  screen.classList.add("switcher", "app-open");
  setBar("light");
  $$(".switcher-label, .switcher-empty", screen).forEach(n => n.remove());
  if (!ids.length) { windows.append(html(`<div class="switcher-empty">No Recent Apps</div>`)); return; }
  const W = screen.offsetWidth, H = screen.offsetHeight, k = ids.length > 3 ? 0.27 : 0.36, gap = 36;
  const cw = W * k, total = ids.length * cw + (ids.length - 1) * gap;
  const ordered = active ? [...ids.filter(i => i !== active), active] : ids;
  const shift = Math.max(0, total - W + 80);
  ordered.forEach((id, i) => {
    const { win, def } = running.get(id);
    const cx = (W - total) / 2 + i * (cw + gap) + cw / 2 - shift / 2;
    win.classList.add("visible");
    win.style.opacity = "1";
    win.style.transform = `translate(${cx - W / 2}px, 0) scale(${k})`;
    windows.append(html(`<div class="switcher-label" style="left:${cx}px;top:${H / 2 - (H * k) / 2 - 36}px"><span class="mini">${APP_ICONS[id]}</span>${esc(def.name)}</div>`));
  });
  active = null;
}
function exitSwitcher() {
  screen.classList.remove("switcher");
  $$(".switcher-label, .switcher-empty", screen).forEach(n => n.remove());
  for (const { win } of running.values()) { win.classList.remove("visible"); win.style.transform = ""; }
}

windows.addEventListener("pointerdown", e => {
  if (!screen.classList.contains("switcher")) return;
  const win = e.target.closest(".app-window");
  if (!win) { const y0 = e.clientY; const up = ev => { removeEventListener("pointerup", up); if (Math.abs(ev.clientY - y0) < 8) goHome(); }; addEventListener("pointerup", up); return; }
  const id = win.dataset.win, base = win.style.transform, y0 = e.clientY, k = screenScale();
  let dy = 0;
  const move = ev => { dy = Math.min(0, (ev.clientY - y0) / k); win.style.transition = "none"; win.style.transform = `translateY(${dy}px) ${base}`; };
  const up = () => {
    removeEventListener("pointermove", move); removeEventListener("pointerup", up);
    win.style.transition = "";
    if (dy < -120) { win.style.transform = `translateY(-900px) ${base}`; setTimeout(() => { closeApp(id); enterSwitcher(); }, 250); }
    else if (Math.abs(dy) < 8) { exitSwitcher(); openApp(id); }
    else win.style.transform = base;
  };
  addEventListener("pointermove", move); addEventListener("pointerup", up);
});

// Home indicator: click = home, double-click = switcher, swipe up = home, swipe up & hold = switcher.
let lastTap = 0;
indicator.addEventListener("pointerdown", e => {
  const y0 = e.clientY, t0 = Date.now(), k = screenScale();
  let moved = 0, holdTimer = null, switched = false;
  const win = active && running.get(active)?.win;
  const move = ev => {
    moved = (y0 - ev.clientY) / k;
    if (win && moved > 0) {
      win.style.transition = "none";
      win.style.transform = `translateY(${-moved * 0.6}px) scale(${Math.max(0.45, 1 - moved / 700)})`;
      win.style.borderRadius = "36px";
      clearTimeout(holdTimer);
      holdTimer = setTimeout(() => { switched = true; finish(); win.style.transition = ""; win.style.borderRadius = ""; enterSwitcher(); }, 450);
    }
  };
  const finish = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); clearTimeout(holdTimer); };
  const up = () => {
    finish();
    if (switched) return;
    if (win) { win.style.transition = ""; win.style.borderRadius = ""; }
    if (moved > 60) return goHome();
    if (win) win.style.transform = "none";
    if (Math.abs(moved) < 6 && Date.now() - t0 < 400) {
      if (Date.now() - lastTap < 350) { enterSwitcher(); lastTap = 0; return; }
      lastTap = Date.now();
      setTimeout(() => { if (lastTap && Date.now() - lastTap >= 340 && !screen.classList.contains("switcher")) { lastTap = 0; goHome(); } }, 360);
    }
  };
  addEventListener("pointermove", move); addEventListener("pointerup", up);
});

addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "h") { e.preventDefault(); goHome(); }
  if ((e.ctrlKey || e.metaKey) && e.code === "Space") { e.preventDefault(); spotlight(); }
  if (e.ctrlKey && e.key === "Tab") { e.preventDefault(); enterSwitcher(); }
  if (e.key === "Escape") $$(".spot, .cc, .ctx-wrap").forEach(n => n.remove());
});

// ---- touch: enable :active feedback on iOS, stop page pinch-zoom / double-tap zoom ----
document.addEventListener("touchstart", () => {}, { passive: true });
for (const t of ["gesturestart", "gesturechange"]) document.addEventListener(t, e => e.preventDefault());
let lastTouchEnd = 0;
document.addEventListener("touchend", e => {
  const now = Date.now();
  if (now - lastTouchEnd < 300 && !e.target.closest("input, textarea, select, .c-viewer, .lib .viewer, .leaflet-container")) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });
if (matchMedia("(hover: none)").matches) document.body.classList.add("touch");

// ---- leaving apps on a real iPad ---------------------------------------------------
// Installed to the Home Screen, iPadOS owns the bottom-edge swipe (it closes the whole
// Flight Bag). AssistiveTouch and a three-finger swipe up return to *our* home screen.
const atOn = () => settings().assistiveTouch ?? (matchMedia("(pointer: coarse)").matches || isStandalone());
const at = html(`<button id="assistive" aria-label="AssistiveTouch"><i><b></b></i></button>`);
screen.append(at);
let atPos = (() => { try { return JSON.parse(localStorage.getItem("rfb.atpos")) || { side: "right", y: 0.62 }; } catch { return { side: "right", y: 0.62 }; } })();
let atIdle;
function placeAt() {
  at.style.display = atOn() ? "" : "none";
  const W = screen.offsetWidth, H = screen.offsetHeight;
  at.style.transform = `translate(${atPos.side === "left" ? 8 : W - 68}px, ${Math.max(40, Math.min(H - 90, atPos.y * H))}px)`;
  at.classList.remove("idle");
  clearTimeout(atIdle);
  atIdle = setTimeout(() => at.classList.add("idle"), 3000);
}
placeAt();
addEventListener("resize", placeAt);
listen("settings", ({ key }) => key === "assistiveTouch" && placeAt());
at.addEventListener("pointerdown", e => {
  e.preventDefault();
  at.setPointerCapture(e.pointerId);
  const k = screenScale(), sr = screen.getBoundingClientRect();
  const x0 = e.clientX, y0 = e.clientY, t0 = Date.now();
  let moved = false;
  at.classList.remove("idle"); at.classList.add("drag");
  const move = ev => {
    if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) moved = true;
    if (!moved) return;
    at.style.transform = `translate(${(ev.clientX - sr.left) / k - 30}px, ${(ev.clientY - sr.top) / k - 30}px)`;
  };
  const up = ev => {
    at.removeEventListener("pointermove", move); at.removeEventListener("pointerup", up);
    at.classList.remove("drag");
    if (moved) {
      const x = (ev.clientX - sr.left) / k, y = (ev.clientY - sr.top) / k;
      atPos = { side: x < screen.offsetWidth / 2 ? "left" : "right", y: y / screen.offsetHeight - 30 / screen.offsetHeight };
      try { localStorage.setItem("rfb.atpos", JSON.stringify(atPos)); } catch { /* ignore */ }
      placeAt();
    } else if (Date.now() - t0 > 550) goHome();
    else atMenu();
  };
  at.addEventListener("pointermove", move); at.addEventListener("pointerup", up);
});
function atMenu() {
  $(".at-menu")?.remove();
  const m = html(`<div class="at-menu"><div class="at-panel">
    <button data-at="cc">${I.gear}<span>Control Center</span></button>
    <button data-at="search">${I.search}<span>Search</span></button>
    <button data-at="switch">${I.apps}<span>App Switcher</span></button>
    <button data-at="pair">${I.ipad}<span>Connect iPad</span></button>
    <button data-at="settings">${I.person}<span>Settings</span></button>
    <button data-at="home" class="home"><i></i><span>Home</span></button>
  </div></div>`);
  $("#overlay-root").append(m);
  requestAnimationFrame(() => m.classList.add("show"));
  const close = () => { m.classList.remove("show"); setTimeout(() => m.remove(), 200); };
  m.addEventListener("click", e => {
    const b = e.target.closest("[data-at]");
    close();
    if (!b) return;
    const a = b.dataset.at;
    if (a === "home") goHome();
    if (a === "switch") enterSwitcher();
    if (a === "cc") controlCenter();
    if (a === "search") { goHome(); setTimeout(spotlight, 300); }
    if (a === "pair") connectSheet();
    if (a === "settings") openApp("settings");
  });
}

// Three-finger swipe up anywhere → Home (like the iPad multitasking gesture).
const fingers = new Map();
addEventListener("pointerdown", e => { if (e.pointerType === "touch") fingers.set(e.pointerId, e.clientY); }, true);
addEventListener("pointerup", e => {
  if (e.pointerType !== "touch" || !fingers.has(e.pointerId)) return;
  const many = fingers.size >= 3, dy = fingers.get(e.pointerId) - e.clientY;
  fingers.delete(e.pointerId);
  if (many && dy > 60 && active) { fingers.clear(); goHome(); }
}, true);
addEventListener("pointercancel", e => fingers.delete(e.pointerId), true);

// ---- boot ---------------------------------------------------------------------
renderHome();
loadAirports();
startSim();
let lastWidgetSim = 0;
onSim(s => {
  statusbar.classList.toggle("sim-live", !!s.connected);
  if (!active && Date.now() - lastWidgetSim > 2000) { lastWidgetSim = Date.now(); renderWidgets(); }
});
if (settings().autoFetchOfp && settings().simbriefUser) fetchSimbrief().catch(() => {});
if (justPaired) toast(settings().simbriefUser ? `Connected – SimBrief ${settings().simbriefUser} imported` : "Connected to your Flight Bag", 3500);
if (params.has("connect")) connectSheet();
installHint();
const start = params.get("app");
if (start && byId[start]) openApp(start);
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
