// Lido charts from MSFS 2024, relayed by the "Flight Bag Lido" toolbar panel
// through the PC server (lido_bridge.py). Only works while the EFB is served by
// the PC app / serve.py and the panel is open in the sim.
const CAT = t => {
  t = String(t || "").toUpperCase();
  if (/^SID|OBSTDEP/.test(t)) return "SID";
  if (/^STAR/.test(t)) return "STAR";
  if (/^IAC|^VAC/.test(t)) return "APPR";
  if (/^AGC|^AFC/.test(t)) return "TAXI";
  return "GEN";
};
const rwy = r => (typeof r === "string" ? r : `${r?.number ?? ""}${r?.designator ?? ""}`.trim());
const proc = p => (typeof p === "string" ? p : p?.ident || p?.name || "");

export async function lidoStatus() {
  try { const r = await fetch("lido/status", { cache: "no-store" }); return r.ok ? await r.json() : { bridge: false, server: false }; }
  catch { return { bridge: false, server: false }; }
}

/** Chart list for an airport in the Charts app's format, or [] when unavailable. */
export async function lidoIndex(icao) {
  const r = await fetch(`lido/index?icao=${encodeURIComponent(icao)}`, { cache: "no-store" });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error === "bridge-offline" ? "Open the Flight Bag Lido panel in MSFS 2024" : j.error || "Lido unavailable");
  const out = [];
  for (const cat of j.data?.charts || []) {
    for (const c of cat.charts || []) {
      out.push({
        source: "lido", id: c.guid, guid: c.guid, icao, cat: CAT(c.type || cat.name),
        index: String(c.type || cat.name || "").toUpperCase(), name: c.name || "Chart", short: (c.name || "").slice(0, 18),
        procs: (c.procedures || []).map(proc).filter(Boolean), runways: (c.runways || []).map(rwy).filter(Boolean),
      });
    }
  }
  return out;
}

/** Image URLs (one per page) for a Lido chart. Prefers the light/day image. */
export async function lidoPageImages(chart, night) {
  const r = await fetch(`lido/pages?guid=${encodeURIComponent(chart.guid)}`, { cache: "no-store" });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "Lido pages unavailable");
  return (j.data?.pages || []).map(p => {
    const urls = p.urls || [];
    const pick = urls.find(u => (night ? /dark|night/i : /light|day/i).test(u.name)) || urls.find(u => /png|image/i.test(u.name)) || urls[0];
    return pick ? `lido/image?url=${encodeURIComponent(pick.url)}` : null;
  }).filter(Boolean);
}
