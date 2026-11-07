// Self-check for the ChartFox response reader in js/core/chartfox.js:  node tools/test-chartfox.mjs
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../js/core/chartfox.js", import.meta.url), "utf8").replace(/^import .*$/m, "const settings = () => ({});");
const { parseCharts, cfCategory } = await import("data:text/javascript," + encodeURIComponent(src));
let bad = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log("FAIL", name, "→", JSON.stringify(got), "want", JSON.stringify(want)); } };

// 1. Laravel envelope, flat list
const flat = parseCharts({ data: [
  { id: 11, name: "ILS or LOC RWY 27L", code: "AD 2.EGLL-8-1", type_key: "APP", url: "https://x/1.pdf" },
  { id: 12, name: "Aerodrome Chart", type: "GND", url: "https://x/2.pdf" },
  { id: 13, name: "BPK 5J Departure", type_key: "SID" },
] }, "EGLL");
eq("flat count", flat.length, 3);
eq("flat cats", flat.map(c => c.cat), ["APPR", "TAXI", "SID"]);
eq("runway parsed", flat[0].runways, ["27L"]);
eq("url kept / missing", flat.map(c => c.cf.url), ["https://x/1.pdf", "https://x/2.pdf", null]);
eq("index from code", flat[0].index, "AD 2.EGLL-8-1");

// 2. grouped by type name
const grouped = parseCharts({ data: { STAR: [{ id: 1, name: "LAM 3A" }], General: [{ id: 2, name: "Aerodrome data" }] } }, "EGLL");
eq("grouped cats", grouped.map(c => c.cat), ["STAR", "GEN"]);

// 3. bare array
eq("bare array", parseCharts([{ id: 5, name: "RNP Y RWY 09R" }], "EGLL").map(c => [c.cat, c.runways[0]]), [["APPR", "09R"]]);

// 4. category words
eq("categories", ["Standard Instrument Departure", "Arrival", "VOR approach", "Parking stands", "Noise abatement"].map(n => cfCategory(null, n)), ["SID", "STAR", "APPR", "TAXI", "GEN"]);

console.log(bad ? `${bad} failed` : "all chartfox checks passed");
process.exit(bad ? 1 : 0);
