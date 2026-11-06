// App catalogue + home-screen layout (which apps are installed, where they sit).
import { kv } from "./store.js";
import { emit } from "./ui.js";

export const APPS = [
  { id: "charts", name: "Charts", vendor: "Rotaidem Avionics", category: "Navigation", size: "38.2 MB", version: "26.10", bar: "light", splash: "#1f2129",
    subtitle: "Lido & airport charts, moving map", load: () => import("../apps/charts.js"),
    desc: "Aerodrome and enroute charts in an airline-style viewer. Lido SID, STAR, approach and airport charts from MSFS 2024, generated airport diagrams with your aircraft on them, your own PDF charts, and use the ENR map with your active route, FIRs, navaids, radar and SIGMETs.",
    whatsNew: "AIRAC 2610 support, USER bookmarks, night mode for imported charts." },
  { id: "enroute", name: "Enroute", vendor: "Rotaidem Avionics", category: "Navigation", size: "41.7 MB", version: "4.2", bar: "light", splash: "#1b1d22",
    subtitle: "Moving map with live aircraft", load: () => import("../apps/enroute.js"),
    desc: "Terrain moving map with your flight plan, FIR boundaries, weather radar timeline, SIGMETs and live VATSIM frequencies. Measure distances, draw, place range rings and jump straight to the procedure charts.",
    whatsNew: "Radar playback timeline and VATSIM ATC callouts." },
  { id: "opt", name: "OPT", vendor: "Rotaidem Avionics", category: "Utilities", size: "12.4 MB", version: "3.8", bar: "light", splash: "#2a2b30",
    subtitle: "Onboard performance tool", load: () => import("../apps/opt.js"),
    desc: "Takeoff and landing performance for the A320, A330, A340, A350, 737, 747, 757 and 787: FLEX / assumed temperature, N1, V-speeds, field and climb limits, landing distances for every autobrake setting. Prefills from your OFP and the live METAR. Simplified model for simulation use.",
    whatsNew: "Landing enroute tab with autobrake table." },
  { id: "briefing", name: "Briefing", vendor: "Rotaidem Avionics", category: "Productivity", size: "8.9 MB", version: "2.5", bar: "light", splash: "#151b2e",
    subtitle: "SimBrief OFP & dispatch", load: () => import("../apps/briefing.js"),
    desc: "Import your latest SimBrief OFP and read it like on the line: summary, full OFP, navlog, fuel and weights, weather, ATC flight plan and maps. Dispatch new flights through SimBrief or create an offline flight.",
    whatsNew: "In-app OFP generation through the SimBrief API." },
  { id: "weather", name: "Weather", vendor: "Rotaidem Avionics", category: "Weather", size: "6.1 MB", version: "1.9", bar: "light", splash: "#1758c9",
    subtitle: "METAR, TAF & radar", load: () => import("../apps/weather.js"),
    desc: "Decoded METARs with flight categories, crosswind for every runway, TAFs and a live radar map for your departure, destination, alternates and favourites." },
  { id: "checklist", name: "Checklist", vendor: "Rotaidem Avionics", category: "Productivity", size: "2.3 MB", version: "1.4", bar: "light", splash: "#111",
    subtitle: "Electronic normal checklist", load: () => import("../apps/checklist.js"),
    desc: "Generic jet normal checklist from preflight to secure. Tap items to complete them; the next checklist follows automatically." },
  { id: "scratchpad", name: "ScratchPad", vendor: "Rotaidem Avionics", category: "Productivity", size: "3.5 MB", version: "2.0", bar: "dark", splash: "#fbf8ee",
    subtitle: "Handwriting for clearances", load: () => import("../apps/scratchpad.js"),
    desc: "Write clearances, ATIS and takeoff data by hand with templates (CRAFT, ATIS, TOD card). Multiple pages, undo, eraser." },
  { id: "library", name: "Library", vendor: "Rotaidem Avionics", category: "Productivity", size: "4.0 MB", version: "1.6", bar: "dark", splash: "#f2f2f7",
    subtitle: "Company documents", load: () => import("../apps/library.js"),
    desc: "Your manuals and company documents in folders – B737 Manual, Checklist, Company Manual, Additional Charts and aerodrome charts. Import PDFs once and read them in any EFB app." },
  { id: "clock", name: "Clock", vendor: "Rotaidem Avionics", category: "Utilities", size: "1.8 MB", version: "1.2", bar: "light", splash: "#000",
    subtitle: "UTC, chrono & timers", load: () => import("../apps/clock.js"),
    desc: "UTC and local time, departure and destination clocks, block-time chronometer and countdown timers." },
  { id: "converter", name: "Converter", vendor: "Rotaidem Avionics", category: "Utilities", size: "1.1 MB", version: "1.0", bar: "dark", splash: "#f2f2f7",
    subtitle: "Units, fuel & altimeter", load: () => import("../apps/converter.js"),
    desc: "Convert kg/lb, litres/US gallons with fuel density, hPa/inHg, °C/°F, metres/feet and knots/km/h. Fuel uplift calculator included." },
  { id: "logbook", name: "Logbook", vendor: "Rotaidem Avionics", category: "Productivity", size: "2.2 MB", version: "1.0", bar: "dark", splash: "#f2f2f7",
    subtitle: "Pilot flight log", load: () => import("../apps/logbook.js"),
    desc: "Log your flights with block times, aircraft and route. Add the current OFP flight with one tap. Totals per aircraft type." },
  { id: "vfrmap", name: "VFR Map", vendor: "Rotaidem Avionics", category: "GA", size: "12.4 MB", version: "1.0", bar: "dark", splash: "#1b2a1e",
    subtitle: "GA moving map", load: () => import("../apps/ga.js").then(m => ({ default: m.vfrmap })),
    desc: "VFR moving map for light aircraft: terrain map, airports and navaids, your aircraft with track vector and glide-range ring, and the nearest airports with bearing, distance and runway." },
  { id: "wb", name: "W&B", vendor: "Rotaidem Avionics", category: "GA", size: "2.1 MB", version: "1.0", bar: "dark", splash: "#f2f2f7",
    subtitle: "Weight & balance", load: () => import("../apps/ga.js").then(m => ({ default: m.wb })),
    desc: "Weight and balance for the Cessna 172, Piper PA-28 and Cirrus SR22 with the CG envelope drawn for take-off and landing. Picks the aircraft loaded in the sim." },
  { id: "e6b", name: "E6B", vendor: "Rotaidem Avionics", category: "GA", size: "1.4 MB", version: "1.0", bar: "dark", splash: "#f2f2f7",
    subtitle: "Flight computer", load: () => import("../apps/ga.js").then(m => ({ default: m.e6b })),
    desc: "Wind triangle (heading, ground speed, wind correction), true airspeed and density altitude, and time / fuel / distance." },
  { id: "appstore", name: "App Store", vendor: "System", category: "Utilities", size: "—", version: "1.0", bar: "dark", splash: "#fff", core: true,
    subtitle: "Get EFB apps", load: () => import("../apps/appstore.js"), desc: "Install and remove EFB apps." },
  { id: "settings", name: "Settings", vendor: "System", category: "Utilities", size: "—", version: "1.0", bar: "dark", splash: "#f2f2f7", core: true,
    subtitle: "Device and EFB settings", load: () => import("../apps/settings.js"), desc: "Settings." },
];
export const byId = Object.fromEntries(APPS.map(a => [a.id, a]));
// Home-screen folders ("folder:<id>" in the layout), like iPadOS app folders.
export const FOLDERS = { ga: { name: "GA", apps: ["vfrmap", "wb", "e6b"] } };
const exists = id => byId[id] || FOLDERS[id.startsWith("folder:") && id.slice(7)];

const DEFAULT = {
  grid: ["charts", "enroute", "opt", "briefing", "folder:ga", "weather", "checklist", "scratchpad", "clock", "appstore"],
  dock: ["charts", "enroute", "opt", "briefing", "library", "settings"],
};

export function layout() {
  const saved = kv.get("home.layout", null);
  const l = saved || structuredClone(DEFAULT);
  l.grid = l.grid.filter(exists);
  l.dock = l.dock.filter(exists);
  // Built-in apps added in an update appear once on existing home screens
  // (apps the user removed stay removed: they are remembered in `known`).
  if (saved) {
    const known = new Set(saved.known || [...saved.grid, ...saved.dock, "appstore", "settings", "library", "converter", "logbook"]);
    const fresh = DEFAULT.grid.filter(id => !known.has(id) && !l.grid.includes(id) && !l.dock.includes(id));
    if (fresh.length || !saved.known) {
      l.grid.push(...fresh);
      l.known = [...new Set([...known, ...DEFAULT.grid, ...DEFAULT.dock])];
      kv.set("home.layout", l);
    }
  }
  return l;
}
export const isInstalled = id => { const l = layout(); return l.grid.includes(id) || l.dock.includes(id) || Object.entries(FOLDERS).some(([f, d]) => d.apps.includes(id) && (l.grid.includes("folder:" + f) || l.dock.includes("folder:" + f))); };
function saveLayout(l) { kv.set("home.layout", l); emit("home", l); }
export function install(id) {
  const l = layout();
  if (!isInstalled(id)) { l.grid.push(id); saveLayout(l); }
}
export function uninstall(id) {
  // Apps inside a folder come and go with the folder (remove the folder from the Home Screen).
  if (byId[id]?.core || Object.values(FOLDERS).some(f => f.apps.includes(id))) return false;
  const l = layout();
  l.grid = l.grid.filter(x => x !== id);
  l.dock = l.dock.filter(x => x !== id);
  saveLayout(l);
  return true;
}
export function moveApp(id, toDock) {
  const l = layout();
  l.grid = l.grid.filter(x => x !== id); l.dock = l.dock.filter(x => x !== id);
  if (toDock && l.dock.length < 8) l.dock.push(id); else l.grid.push(id);
  saveLayout(l);
}
export function resetLayout() { saveLayout(structuredClone(DEFAULT)); }
