// App Store – browse, install, open and delete EFB apps (iPadOS App Store look).
import { $, $$, esc, on, listen, toast } from "../core/ui.js";
import { APPS, byId, isInstalled, install, uninstall } from "../core/registry.js";
import { APP_ICONS } from "../core/icons.js";
import { I } from "../core/sf.js";

export default { mount: (root, ctx, args) => new AppStore(root, ctx, args) };

const TABS = [["today", "Today", I.today], ["apps", "Apps", I.apps], ["categories", "Categories", I.stack], ["updates", "Updates", I.download], ["search", "Search", I.search]];
const store = () => APPS.filter(a => a.id !== "settings" && a.id !== "appstore");

class AppStore {
  constructor(root, ctx, args) {
    this.root = root; this.ctx = ctx;
    this.tab = "today"; this.detail = args?.app || null; this.q = "";
    root.innerHTML = `<div class="as"><aside><h1>App Store</h1>${TABS.map(([k, l, i]) => `<button data-tab="${k}"><span>${i}</span>${l}</button>`).join("")}</aside><main></main></div>`;
    on(root, "click", "[data-tab]", (e, b) => { this.tab = b.dataset.tab; this.detail = null; this.render(); });
    on(root, "click", "[data-app]", (e, b) => { if (e.target.closest("[data-get]")) return; this.detail = b.dataset.app; this.render(); });
    on(root, "click", "[data-get]", (e, b) => { e.stopPropagation(); this.get(b.dataset.get, b); });
    on(root, "click", "[data-back]", () => { this.detail = null; this.render(); });
    on(root, "click", "[data-del]", (e, b) => { if (uninstall(b.dataset.del)) { toast(`${byId[b.dataset.del].name} deleted`); this.render(); } });
    this.unsub = [listen("home", () => this.render())];
    this.render();
  }
  show(args) { if (args?.app) { this.detail = args.app; this.render(); } }
  destroy() { this.unsub.forEach(u => u()); }

  btn(a, big) {
    const inst = isInstalled(a.id);
    return `<button class="get ${big ? "big" : ""} ${inst ? "open" : ""}" data-get="${a.id}">${inst ? "OPEN" : "GET"}</button>`;
  }
  get(id, b) {
    if (isInstalled(id)) return this.ctx.open(id);
    b.classList.add("loading");
    b.innerHTML = `<svg viewBox="0 0 36 36" width="30" height="30"><circle cx="18" cy="18" r="15" fill="none" stroke="#d1d1d6" stroke-width="3"/><circle class="prog" cx="18" cy="18" r="15" fill="none" stroke="#0a84ff" stroke-width="3" stroke-dasharray="94.2" stroke-dashoffset="94.2" transform="rotate(-90 18 18)"/><rect x="13.5" y="13.5" width="9" height="9" rx="1.5" fill="#0a84ff"/></svg>`;
    requestAnimationFrame(() => $(".prog", b)?.setAttribute("style", "transition:stroke-dashoffset 1.4s ease-in-out;stroke-dashoffset:0"));
    setTimeout(() => { install(id); toast(`${byId[id].name} installed on your Home Screen`); }, 1500);
  }
  row(a) {
    return `<div class="as-row" data-app="${a.id}"><span class="ic">${APP_ICONS[a.id]}</span><div class="t"><b>${esc(a.name)}</b><small>${esc(a.subtitle)}</small></div>${this.btn(a)}</div>`;
  }

  render() {
    $$("aside [data-tab]", this.root).forEach(b => b.classList.toggle("on", b.dataset.tab === this.tab));
    const main = $("main", this.root);
    main.scrollTop = 0;
    main.innerHTML = this.detail ? this.page(byId[this.detail]) : this[this.tab]();
    if (this.tab === "search" && !this.detail) {
      const i = $("input", main);
      i.value = this.q;
      i.addEventListener("input", () => { this.q = i.value; $(".results", main).innerHTML = this.results(); });
      setTimeout(() => i.focus(), 50);
    }
  }

  today() {
    const d = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }).toUpperCase();
    const feat = [["charts", "APP OF THE DAY", "Jeppesen charts, airline style", "linear-gradient(135deg,#0f2742,#1c86d1)"],
      ["enroute", "GET STARTED", "Your route on a moving map", "linear-gradient(135deg,#2a2bb0,#7b7df0)"],
      ["opt", "PERFORMANCE", "V-speeds in seconds", "linear-gradient(135deg,#0d1f63,#2f56c9)"],
      ["briefing", "PLAN LIKE THE PROS", "Bring your SimBrief OFP", "linear-gradient(135deg,#3b0d16,#e2483d)"]];
    return `<div class="as-pad"><div class="as-date">${d}</div><h2 class="as-h">Today</h2>
      <div class="today">${feat.map(([id, k, t, bg]) => `<div class="tcard" data-app="${id}" style="background:${bg}"><small>${k}</small><h3>${t}</h3><div class="big-ic">${APP_ICONS[id]}</div>
        <div class="foot"><span class="ic">${APP_ICONS[id]}</span><div><b>${esc(byId[id].name)}</b><small>${esc(byId[id].subtitle)}</small></div>${this.btn(byId[id])}</div></div>`).join("")}</div></div>`;
  }
  apps() {
    const s = store();
    return `<div class="as-pad"><h2 class="as-h">Apps</h2>
      <h3 class="as-sh">Essential EFB apps</h3><div class="as-grid">${s.slice(0, 6).map(a => this.row(a)).join("")}</div>
      <h3 class="as-sh">More for the flight deck</h3><div class="as-grid">${s.slice(6).map(a => this.row(a)).join("")}</div></div>`;
  }
  categories() {
    const cats = [...new Set(store().map(a => a.category))];
    return `<div class="as-pad"><h2 class="as-h">Categories</h2>${cats.map(c => `<h3 class="as-sh">${esc(c)}</h3><div class="as-grid">${store().filter(a => a.category === c).map(a => this.row(a)).join("")}</div>`).join("")}</div>`;
  }
  updates() {
    const inst = store().filter(a => isInstalled(a.id));
    return `<div class="as-pad"><h2 class="as-h">Updates</h2><p class="as-muted">All apps are up to date.</p>
      <h3 class="as-sh">Recently updated</h3>${inst.map(a => `<div class="upd" data-app="${a.id}"><div class="as-row"><span class="ic">${APP_ICONS[a.id]}</span><div class="t"><b>${esc(a.name)}</b><small>Version ${esc(a.version)}</small></div>${this.btn(a)}</div><p>${esc(a.whatsNew || "Bug fixes and performance improvements.")}</p></div>`).join("")}</div>`;
  }
  search() {
    return `<div class="as-pad"><h2 class="as-h">Search</h2><div class="as-search">${I.search}<input placeholder="Games, Apps, Stories and More"></div><div class="results">${this.results()}</div></div>`;
  }
  results() {
    const q = this.q.toLowerCase();
    const r = store().filter(a => !q || (a.name + a.subtitle + a.desc + a.category).toLowerCase().includes(q));
    return r.length ? `<div class="as-grid one">${r.map(a => this.row(a)).join("")}</div>` : `<p class="as-muted">No results for “${esc(this.q)}”.</p>`;
  }

  page(a) {
    if (!a) return "";
    const inst = isInstalled(a.id);
    return `<div class="as-pad"><button class="as-back" data-back>‹ ${TABS.find(t => t[0] === this.tab)[1]}</button>
      <div class="as-hero"><span class="ic">${APP_ICONS[a.id]}</span><div class="t"><h2>${esc(a.name)}</h2><p>${esc(a.subtitle)}</p><small>${esc(a.vendor)}</small><div class="acts">${this.btn(a, true)}</div></div></div>
      <div class="as-info"><div><small>CATEGORY</small><b>${esc(a.category)}</b></div><div><small>AGE</small><b>4+</b><span>Years Old</span></div><div><small>VERSION</small><b>${esc(a.version)}</b></div><div><small>SIZE</small><b>${esc(a.size)}</b></div><div><small>DEVELOPER</small><b>${esc(a.vendor.split(" ")[0])}</b></div></div>
      ${a.whatsNew ? `<h3 class="as-sh">What's New</h3><p class="as-p">${esc(a.whatsNew)}</p>` : ""}
      <h3 class="as-sh">Preview</h3><div class="as-shots"><div class="shot" style="background:${a.splash}"><span class="ic">${APP_ICONS[a.id]}</span><b>${esc(a.name)}</b><small>${esc(a.subtitle)}</small></div><div class="shot alt"><p>${esc(a.desc)}</p></div></div>
      <h3 class="as-sh">Description</h3><p class="as-p">${esc(a.desc)}</p>
      ${inst && !a.core ? `<button class="as-del" data-del="${a.id}">Delete App</button>` : ""}</div>`;
  }
}
