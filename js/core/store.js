// Persistent settings (localStorage) and user files (IndexedDB).
import { emit } from "./ui.js";

const KEY = "rfb.settings";
const DEFAULTS = {
  simbriefUser: "",
  navigraphClientId: "",
  navigraphClientSecret: "",
  units: "kg",
  timeSep: ".",
  chartTheme: "day",
  autoFetchOfp: true,
  fleet: {
    "B737-800": ["RF-801", "RF-802", "RF-803", "RF-804"],
    "B737-900ER": ["RF-901", "RF-902", "RF-903"],
    "B737-9": ["RF-M01", "RF-M02"],
    "TRAINING": ["SIM-01"],
  },
};

let cache;
function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }

export function settings() {
  if (!cache) {
    let saved = {};
    try { saved = JSON.parse(safeGet(KEY) || "{}"); } catch { /* corrupt */ }
    cache = { ...structuredClone(DEFAULTS), ...saved };
  }
  return cache;
}
export function setSetting(key, value) {
  settings()[key] = value;
  safeSet(KEY, JSON.stringify(cache));
  emit("settings", { key, value });
}

export const kv = {
  get(k, fallback = null) { try { const v = safeGet("rfb." + k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(k, v) { safeSet("rfb." + k, JSON.stringify(v)); },
  del(k) { try { localStorage.removeItem("rfb." + k); } catch { /* ignore */ } },
};

// ---- IndexedDB file store -------------------------------------------------
// Each record: { id, folder, name, type, size, added, blob, meta }
let dbp;
function db() {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open("rfb", 1);
    r.onupgradeneeded = () => {
      const s = r.result.createObjectStore("files", { keyPath: "id" });
      s.createIndex("folder", "folder");
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction("files", mode);
    const out = fn(t.objectStore("files"));
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = () => rej(t.error);
  });
}

export const files = {
  async put(folder, file, meta = {}) {
    const rec = { id: crypto.randomUUID(), folder, name: file.name, type: file.type, size: file.size, added: Date.now(), blob: file, meta };
    await tx("readwrite", s => s.put(rec));
    emit("files", { folder });
    return rec;
  },
  async list(folder) {
    const all = await tx("readonly", s => s.index("folder").getAll(folder));
    return all.sort((a, b) => (a.meta.order ?? a.name).toString().localeCompare((b.meta.order ?? b.name).toString(), undefined, { numeric: true }));
  },
  async listPrefix(prefix) {
    const all = await tx("readonly", s => s.getAll());
    return all.filter(r => r.folder.startsWith(prefix));
  },
  async count(folder) { return tx("readonly", s => s.index("folder").count(folder)); },
  async get(id) { return tx("readonly", s => s.get(id)); },
  async del(id) { const r = await files.get(id); await tx("readwrite", s => s.delete(id)); emit("files", { folder: r?.folder }); },
};
