// Builds the compact airport / runway / frequency / navaid database used by the EFB
// from the public-domain OurAirports dataset (https://ourairports.com/data/).
//
// Usage:
//   node tools/build-data.mjs <dir-with-ourairports-csvs>
// The directory must contain airports.csv, runways.csv, airport-frequencies.csv, navaids.csv.
// Download them from https://davidmegginson.github.io/ourairports-data/

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const src = process.argv[2];
if (!src) {
  console.error("usage: node tools/build-data.mjs <ourairports-csv-dir>");
  process.exit(1);
}
const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
mkdirSync(outDir, { recursive: true });

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

const read = f => parseCSV(readFileSync(join(src, f), "utf8"));
const num = v => (v === "" || v == null ? null : Number(v));
const r4 = v => (v == null ? null : Math.round(v * 1e5) / 1e5);
const ICAO = /^[A-Z]{4}$/;

const airports = read("airports.csv");
const keep = new Map();
for (const a of airports) {
  const big = a.type === "large_airport" || a.type === "medium_airport";
  const sched = a.type === "small_airport" && a.scheduled_service === "yes";
  if (!big && !sched) continue;
  const code = [a.icao_code, a.gps_code, a.ident].find(c => ICAO.test(c));
  if (!code || keep.has(code)) continue;
  keep.set(code, {
    ref: a.id,
    row: [code, a.iata_code || "", a.name, a.municipality || "", a.iso_country,
      r4(num(a.latitude_deg)), r4(num(a.longitude_deg)), num(a.elevation_ft) ?? 0,
      a.type === "large_airport" ? 2 : a.type === "medium_airport" ? 1 : 0],
    rwy: [], freq: [],
  });
}
const byRef = new Map([...keep.values()].map(v => [v.ref, v]));

for (const r of read("runways.csv")) {
  const ap = byRef.get(r.airport_ref);
  if (!ap || r.closed === "1" || !r.le_ident || !r.length_ft) continue;
  if (/^H/.test(r.le_ident)) continue; // helipads
  ap.rwy.push([
    r.le_ident, r.he_ident, num(r.length_ft), num(r.width_ft), r.surface,
    r4(num(r.le_latitude_deg)), r4(num(r.le_longitude_deg)), num(r.le_elevation_ft), num(r.le_heading_degT), num(r.le_displaced_threshold_ft),
    r4(num(r.he_latitude_deg)), r4(num(r.he_longitude_deg)), num(r.he_elevation_ft), num(r.he_heading_degT), num(r.he_displaced_threshold_ft),
  ]);
}

for (const f of read("airport-frequencies.csv")) {
  const ap = byRef.get(f.airport_ref);
  if (!ap || !f.frequency_mhz) continue;
  ap.freq.push([f.type, f.description, Number(f.frequency_mhz)]);
}

const out = {
  source: "OurAirports (public domain)",
  built: new Date().toISOString().slice(0, 10),
  fields: {
    airport: ["icao", "iata", "name", "city", "country", "lat", "lon", "elev", "size", "runways", "freqs"],
    runway: ["le", "he", "len", "wid", "surf", "leLat", "leLon", "leElev", "leHdg", "leDisp", "heLat", "heLon", "heElev", "heHdg", "heDisp"],
    freq: ["type", "desc", "mhz"],
  },
  airports: [...keep.values()].map(v => [...v.row, v.rwy, v.freq]),
};
writeFileSync(join(outDir, "airports.json"), JSON.stringify(out));

const navaids = read("navaids.csv")
  .filter(n => /VOR|NDB/.test(n.type) && n.latitude_deg)
  .map(n => [n.ident, n.name, n.type, Number(n.frequency_khz), r4(num(n.latitude_deg)), r4(num(n.longitude_deg))]);
writeFileSync(join(outDir, "navaids.json"), JSON.stringify({ fields: ["ident", "name", "type", "khz", "lat", "lon"], navaids }));

console.log(`airports: ${out.airports.length}, navaids: ${navaids.length}`);
