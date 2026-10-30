// Settings – iPadOS-style split view with device and EFB settings.
import { $, $$, html, esc, on, listen, toast, modal, loadScript } from "../core/ui.js";
import { settings, setSetting, kv } from "../core/store.js";
import { fetchSimbrief, getFlight, setFlight } from "../core/flight.js";
import { APPS, layout, resetLayout } from "../core/registry.js";
import { APP_ICONS } from "../core/icons.js";
import { WALLPAPERS } from "../core/wallpapers.js";
import * as NG from "../core/navigraph.js";
import { I } from "../core/sf.js";
import { connectSheet, isStandalone, shareBase } from "../core/pair.js";
import { simState, onSim, setDemo } from "../core/sim.js";

export default { mount: (root, ctx, args) => new SettingsApp(root, ctx, args) };

const G = (c, glyph) => `<span class="sic" style="background:${c}">${glyph}</span>`;
const SECTIONS = [
  { group: 0, id: "connect", label: "Connect iPad", icon: G("#0a84ff", I.ipad) },
  { group: 0, id: "sim", label: "Simulator", icon: G("#34c759", I.plane) },
  { group: 0, id: "general", label: "General", icon: G("#8e8e93", I.gear) },
  { group: 0, id: "display", label: "Display & Brightness", icon: G("#0a84ff", I.sun) },
  { group: 0, id: "homescreen", label: "Home Screen & Dock", icon: G("#5e5ce6", I.grid) },
  { group: 0, id: "wallpaper", label: "Wallpaper", icon: G("#32ade6", I.wallpaper) },
  { group: 0, id: "battery", label: "Battery", icon: G("#34c759", I.battery) },
  { group: 1, id: "simbrief", label: "SimBrief", icon: G("#e2483d", "SB") },
  { group: 1, id: "navigraph", label: "Navigraph", icon: G("#1f2b4d", "N") },
  { group: 1, id: "fleet", label: "Aircraft & Fleet", icon: G("#ff9f0a", I.plane) },
  { group: 1, id: "units", label: "Units & Time", icon: G("#30b0c7", I.ruler) },
  { group: 1, id: "data", label: "Data Sources", icon: G("#64d2ff", I.cloud) },
  { group: 2, id: "storage", label: "iPad Storage", icon: G("#8e8e93", I.disk) },
  { group: 2, id: "about", label: "About", icon: G("#8e8e93", I.info) },
];

class SettingsApp {
  constructor(root, ctx, args) {
    this.root = root; this.ctx = ctx;
    this.sec = args?.section || "general";
    root.innerHTML = `<div class="set"><aside><h1>Settings</h1><div class="srch">${I.search}<input placeholder="Search"></div>
      <div class="profile"><span class="av">${esc((settings().pilotName || "Pilot").split(" ").map(x => x[0]).join("").slice(0, 2).toUpperCase())}</span><div><b>${esc(settings().pilotName || "Pilot")}</b><small>EFB Account, SimBrief & Navigraph</small></div></div>
      <nav></nav></aside><main><header><h2></h2></header><div class="pane"></div></main></div>`;
    on(root, "click", "[data-sec]", (e, b) => { this.sec = b.dataset.sec; this.render(); });
    $(".srch input", root).addEventListener("input", e => {
      const q = e.target.value.toLowerCase();
      $$("nav [data-sec]", root).forEach(b => { b.style.display = !q || b.textContent.toLowerCase().includes(q) ? "" : "none"; });
    });
    $(".profile", root).addEventListener("click", () => { this.sec = "simbrief"; this.render(); });
    this.unsub = [listen("navigraph", () => this.sec === "navigraph" && this.render()), onSim(() => this.sec === "sim" && this.updSim())];
    this.render();
  }
  show(args) { if (args?.section) { this.sec = args.section; this.render(); } }
  destroy() { this.unsub.forEach(u => u()); }

  render() {
    const nav = $("nav", this.root);
    nav.innerHTML = [0, 1, 2].map(g => `<div class="grp">${SECTIONS.filter(s => s.group === g).map(s => `<button data-sec="${s.id}" class="${this.sec === s.id ? "on" : ""}">${s.icon}<span>${s.label}</span></button>`).join("")}</div>`).join("");
    const s = SECTIONS.find(x => x.id === this.sec);
    $("main h2", this.root).textContent = s.label;
    const pane = $(".pane", this.root);
    pane.innerHTML = this[this.sec]();
    this.bind(pane);
  }

  // ---- helpers ----
  row(label, ctl, sub = "") { return `<div class="row"><div class="l"><span>${label}</span>${sub ? `<small>${sub}</small>` : ""}</div><div class="c">${ctl}</div></div>`; }
  sw(key, val) { return `<button class="ios-switch ${val ? "on" : ""}" data-sw="${key}"></button>`; }
  input(key, val, ph = "", type = "text") { return `<input class="tf" data-in="${key}" value="${esc(val ?? "")}" placeholder="${esc(ph)}" type="${type}" autocomplete="off" spellcheck="false">`; }
  seg(key, opts, val) { return `<div class="segc">${opts.map(([v, l]) => `<button data-seg="${key}" data-v="${esc(v)}" class="${String(val) === String(v) ? "on" : ""}">${esc(l)}</button>`).join("")}</div>`; }
  group(title, rows, foot = "") { return `${title ? `<h4>${title}</h4>` : ""}<div class="card">${rows.join("")}</div>${foot ? `<p class="foot">${foot}</p>` : ""}`; }

  bind(pane) {
    on(pane, "click", "[data-sw]", (e, b) => { const k = b.dataset.sw; setSetting(k, !settings()[k]); b.classList.toggle("on", !!settings()[k]); });
    on(pane, "change", "[data-in]", (e, i) => setSetting(i.dataset.in, i.type === "number" ? +i.value : i.value.trim()));
    on(pane, "click", "[data-seg]", (e, b) => { setSetting(b.dataset.seg, b.dataset.v); this.render(); });
    on(pane, "click", "[data-do]", (e, b) => this.do(b.dataset.do, b));
    on(pane, "input", "[data-range]", (e, r) => setSetting(r.dataset.range, +r.value));
    on(pane, "click", "[data-wall]", (e, b) => { setSetting("wallpaper", +b.dataset.wall); this.render(); });
  }

  async do(a, b) {
    if (a === "sbtest") {
      b.textContent = "Importing…";
      try { const f = await fetchSimbrief(); toast(`OK – ${f.callsign} ${f.orig.icao}–${f.dest.icao}`); } catch (e) { toast(e.message); }
      this.render();
    }
    if (a === "sbapi") {
      try {
        const r = await fetch("api/simbrief.php?api_req=TEST");
        const j = await r.json();
        toast(j.api_code ? "SimBrief API endpoint is configured ✓" : j.error || "Endpoint error");
      } catch { toast("No PHP endpoint – in-app generation unavailable on this host"); }
    }
    if (a === "ngsignin") {
      const m = modal({ title: "Sign in to Navigraph", done: "Cancel", body: `<div class="ng-flow"><div class="spinner dark"></div><p>Requesting a sign-in code…</p></div>` });
      try {
        const s = await NG.signIn(async p => {
          let qr = "";
          try { await loadScript("https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"); const q = window.qrcode(0, "M"); q.addData(p.verification_uri_complete); q.make(); qr = q.createSvgTag({ cellSize: 4, margin: 2 }); } catch { /* optional */ }
          $(".ng-flow", m.el).innerHTML = `${qr}<p>Scan the code or open<br><a href="${esc(p.verification_uri_complete)}" target="_blank" rel="noopener">${esc(p.verification_uri)}</a></p><div class="ng-code">${esc(p.user_code)}</div><p class="dim">Waiting for confirmation…</p>`;
        });
        m.el.addEventListener("click", e => { if (e.target.closest("[data-x]")) s.cancel(); });
        const u = await s.promise;
        m.close(); toast(`Signed in as ${u.preferred_username}`); this.render();
      } catch (e) { $(".ng-flow", m.el).innerHTML = `<p style="color:#c00">${esc(e.message || "Sign-in failed")}</p>`; }
    }
    if (a === "ngsignout") { await NG.signOut(); toast("Signed out"); this.render(); }
    if (a === "fleetsave") {
      const fleet = {};
      $$("[data-fleet]", this.root).forEach(t => { fleet[t.dataset.fleet] = t.value.split(/[\s,]+/).map(x => x.trim().toUpperCase()).filter(Boolean); });
      setSetting("fleet", fleet); toast("Fleet saved");
    }
    if (a === "pair") connectSheet();
    if (a === "demo") { setDemo(!settings().simDemo); this.render(); }
    if (a === "resetlayout") { resetLayout(); toast("Home Screen layout reset"); }
    if (a === "clearflight") { setFlight(null); toast("Flight cleared"); }
    if (a === "reset") {
      if (!confirm("Erase all EFB settings, flights, bookmarks and imported documents on this device?")) return;
      try { localStorage.clear(); indexedDB.deleteDatabase("rfb"); } catch { /* ignore */ }
      location.reload();
    }
  }

  // ---- sections ----
  sim() {
    setTimeout(() => this.updSim(), 0);
    return `<div class="card pad simhero"><div class="simstat"><i></i><div><b id="simtitle">—</b><small id="simsub"></small></div></div>
      <div class="simgrid" id="simgrid"></div></div>` +
      this.group("Source", [
        this.row("Demo flight", this.sw("simDemoUi", settings().simDemo).replace('data-sw="simDemoUi"', 'data-do="demo"'), "Flies the loaded route without a simulator, for trying the moving maps"),
      ]) +
      this.group("Set up on the simulator PC", [
        `<div class="steps"><p><b>1.</b> Start the EFB with <code>Start EFB.bat</code> (or <code>python serve.py</code>) on the PC running the simulator.</p>
        <p><b>2. Microsoft Flight Simulator:</b> install the SimConnect package once with <code>pip install SimConnect</code>. The EFB connects automatically when MSFS is running.</p>
        <p><b>3. X-Plane 12:</b> nothing to install – the EFB uses X-Plane's built-in web API (port 8086).</p>
        <p><b>4.</b> Open the EFB on your iPad with Connect iPad. Position updates four times a second over Wi-Fi.</p></div>`,
      ], "Live data needs the PC server. When the EFB is opened from GitHub Pages it cannot reach the simulator.");
  }
  updSim() {
    const s = simState(), el = id => $("#" + id, this.root);
    if (!el("simtitle")) return;
    this.root.querySelector(".simhero")?.classList.toggle("live", !!s.connected);
    el("simtitle").textContent = s.connected ? `${s.source} connected` : "Not connected";
    el("simsub").textContent = s.connected ? (s.title || s.callsign || "") : (s.status || "");
    const r = v => (v == null ? "—" : Math.round(v).toLocaleString());
    el("simgrid").innerHTML = s.connected ? [["Latitude", s.lat?.toFixed(4)], ["Longitude", s.lon?.toFixed(4)], ["Altitude", r(s.alt) + " ft"], ["Ground speed", r(s.gs) + " kt"], ["Heading", r(s.hdg) + "°"], ["Vertical speed", r(s.vs) + " fpm"], ["On ground", s.onGround ? "Yes" : "No"]]
      .map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join("") : "";
  }
  connect() {
    setTimeout(async () => {
      const b = await shareBase();
      const el = $("#pairaddr", this.root);
      if (el) el.textContent = b.url || "Not reachable – start with Start EFB.bat / serve.py";
    }, 0);
    return `<div class="card pad pairhero"><div class="dev">${I.plane}</div><div><b>Use the EFB on your iPad</b><p>Show a QR code, scan it with the iPad camera and add the EFB to the Home Screen. It runs full-screen, keeps your SimBrief username and works offline once loaded over HTTPS.</p><button class="ios-btn" data-do="pair">Show QR Code</button></div></div>` +
      this.group("Status", [
        this.row("This device", isStandalone() ? "Installed (Home Screen app)" : "Browser"),
        this.row("iPad address", `<span class="dim" id="pairaddr">Checking…</span>`),
      ], "On a PC, double-click “Start EFB.bat” (or run python serve.py) so the iPad can reach it over Wi-Fi. Alternatively publish the folder with GitHub Pages and scan that address.");
  }
  general() {
    const s = settings();
    return this.group("", [
      this.row("About", `<button class="chev" data-sec="about">›</button>`),
      this.row("iPad Storage", `<button class="chev" data-sec="storage">›</button>`),
    ]) + this.group("Pilot", [
      this.row("Name", this.input("pilotName", s.pilotName, "Your name")),
      this.row("Crew ID", this.input("crewId", s.crewId, "Optional")),
    ]) + this.group("Startup", [
      this.row("Import OFP on launch", this.sw("autoFetchOfp", s.autoFetchOfp), "Loads your latest SimBrief OFP when the EFB starts"),
      this.row("Do Not Disturb", this.sw("dnd", s.dnd)),
    ]);
  }
  display() {
    const s = settings();
    return this.group("Brightness", [`<div class="row slider">${I.sunDim}<input type="range" min="0.25" max="1" step="0.01" value="${s.brightness ?? 1}" data-range="brightness">${I.sun}</div>`,
      this.row("Night Shift", this.sw("nightShift", s.nightShift), "Warmer colours for night flights"),
    ]) + this.group("Charts", [
      this.row("Chart theme", this.seg("chartTheme", [["day", "Day"], ["night", "Night"]], s.chartTheme || "day")),
    ]) + this.group("Device frame", [
      this.row("Show iPad frame", this.seg("frame", [["", "Automatic"], ["on", "Always"], ["off", "Never"]], s.frame || ""), "Automatic hides the frame on tablets and when installed to the Home Screen"),
    ]);
  }
  homescreen() {
    const l = layout();
    const inst = l.grid.concat(l.dock);
    return this.group("Apps on this iPad", APPS.map(a => this.row(`<span class="mini">${APP_ICONS[a.id]}</span>${esc(a.name)}`, inst.includes(a.id) ? `<span class="dim">${l.dock.includes(a.id) ? "Dock" : "Home Screen"}</span>` : `<span class="dim">Not installed</span>`)),
      "Long-press an icon on the Home Screen to move or remove it. Get more apps in the App Store.") +
      this.group("", [this.row("Reset Home Screen Layout", `<button class="lnk" data-do="resetlayout">Reset</button>`)]);
  }
  wallpaper() {
    const cur = settings().wallpaper || 0;
    return `<div class="walls">${WALLPAPERS.map((w, i) => `<button data-wall="${i}" class="${i === cur ? "on" : ""}"><span style="background:${w.css || w.preview}"></span><b>${esc(w.name)}</b></button>`).join("")}</div>`;
  }
  battery() {
    setTimeout(() => navigator.getBattery?.().then(b => { const el = $("#battlvl", this.root); if (el) el.textContent = `${Math.round(b.level * 100)}%${b.charging ? " · Charging" : ""}`; }).catch(() => {}), 0);
    return this.group("", [this.row("Battery level", `<span class="dim" id="battlvl">Not reported by this browser</span>`)], "The status bar shows this device's battery when the browser reports it.");
  }
  simbrief() {
    const s = settings(), f = getFlight();
    return this.group("Account", [
      this.row("Username or Pilot ID", this.input("simbriefUser", s.simbriefUser, "e.g. jdoe or 123456")),
      this.row("Import latest OFP", `<button class="lnk" data-do="sbtest">Import now</button>`),
    ], "Your Navigraph/SimBrief username, or the numeric Pilot ID from SimBrief › Account Settings.") +
    this.group("Current flight", [
      this.row("Loaded", f ? `${esc(f.callsign)} ${esc(f.orig.icao)}–${esc(f.dest.icao)}` : `<span class="dim">None</span>`),
      this.row("Clear current flight", `<button class="lnk red" data-do="clearflight">Clear</button>`),
    ]) +
    this.group("In-app OFP generation (API)", [
      this.row("API endpoint", `<button class="lnk" data-do="sbapi">Test</button>`, "api/simbrief.php signs requests with your API key on the server"),
    ], "Your SimBrief API key lives only in api/config.php on the server and is never sent to the browser. On static hosting (e.g. GitHub Pages) use “Plan on SimBrief.com” instead.");
  }
  navigraph() {
    const s = settings();
    const configured = NG.isConfigured();
    const out = this.group("Developer client", [
      this.row("Client ID", this.input("navigraphClientId", s.navigraphClientId, "from Navigraph")),
      this.row("Client secret", this.input("navigraphClientSecret", s.navigraphClientSecret, "from Navigraph", "password")),
    ], "Navigraph's Charts API needs a client from the Navigraph developer programme (navigraph.com/partners). Changing the client requires reopening the app.");
    const acct = `<div class="card" id="ngacct">${this.row("Account", configured ? `<span class="dim">Checking…</span>` : `<span class="dim">Add a client first</span>`)}</div>`;
    setTimeout(async () => {
      if (!configured) return;
      const u = await NG.currentUser().catch(() => null);
      const box = $("#ngacct", this.root);
      if (box) box.innerHTML = u
        ? this.row(`Signed in as <b>${esc(u.preferred_username)}</b>`, `<button class="lnk red" data-do="ngsignout">Sign Out</button>`, esc((u.subscriptions || []).join(", ")))
        : this.row("Not signed in", `<button class="lnk" data-do="ngsignin">Sign In</button>`, "Sign in with your Navigraph account (Charts subscription) to load Jeppesen charts");
    }, 0);
    return out + `<h4>Navigraph account</h4>` + acct;
  }
  fleet() {
    const f = settings().fleet;
    return this.group("Registrations per type (used by OPT)", Object.entries(f).map(([t, regs]) => this.row(esc(t), `<input class="tf wide" data-fleet="${esc(t)}" value="${esc(regs.join(", "))}">`)),
      "Separate registrations with commas.") + `<div class="btnrow"><button class="ios-btn" data-do="fleetsave">Save Fleet</button></div>`;
  }
  units() {
    const s = settings();
    return this.group("", [
      this.row("Weight", this.seg("units", [["kg", "KG"], ["lb", "LB"]], s.units)),
      this.row("Time separator", this.seg("timeSep", [[".", "20.47"], [":", "20:47"]], s.timeSep || ".")),
    ]);
  }
  data() {
    const rows = [
      ["Airports, runways, frequencies", "OurAirports (public domain), bundled"],
      ["Coastlines & borders", "Natural Earth via world-atlas"],
      ["FIR boundaries & names", "VATSpy data project"],
      ["Live ATC frequencies", "VATSIM data feed"],
      ["METAR", "VATSIM METAR service"],
      ["TAF & SIGMET", "aviationweather.gov via api/wx.php (needs PHP hosting)"],
      ["Weather radar", "RainViewer"],
      ["Terrain map", "Esri World Physical"],
      ["Flight plans", "SimBrief"],
      ["Jeppesen charts", "Navigraph Charts API"],
    ];
    return this.group("", rows.map(([a, b]) => this.row(a, `<span class="dim">${b}</span>`)), "All data is for flight simulation use only.");
  }
  storage() {
    setTimeout(async () => {
      const e = await navigator.storage?.estimate?.().catch(() => null);
      const el = $("#stor", this.root);
      if (el && e) el.innerHTML = `<div class="bar"><i style="width:${Math.max(2, (e.usage / e.quota) * 100)}%"></i></div><p>${(e.usage / 1e6).toFixed(1)} MB used of ${(e.quota / 1e9).toFixed(1)} GB available to the EFB</p>`;
    }, 0);
    return `<div class="card pad" id="stor"><p class="dim">Calculating…</p></div>` + this.group("", [this.row("Erase All Content and Settings", `<button class="lnk red" data-do="reset">Erase</button>`)]);
  }
  about() {
    return this.group("", [
      this.row("Name", "Rotaidem Flight Bag"), this.row("Software Version", "1.0 (26.10)"), this.row("Model", "iPad Air (web)"),
      this.row("Apps", String(layout().grid.length + layout().dock.length)),
      this.row("Navigraph", NG.isConfigured() ? "Configured" : "Not configured"),
    ], "An electronic flight bag for flight simulation, modelled on airline EFB workflows. Not for real-world navigation or performance calculations.");
  }
}
