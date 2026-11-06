// Self-check for js/core/aircraft.js detection rules:  node tools/test-aircraft.mjs
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../js/core/aircraft.js", import.meta.url), "utf8").replace(/^import .*$/m, "const simState = () => null, onSim = () => {};");
const { detectAircraft } = await import("data:text/javascript," + encodeURIComponent(src));
const cases = [
  ["TT:ATCCOM.AC_MODEL_A320.0.text", "Airbus A320 Neo Asobo", "A320"], ["", "FlyByWire A32NX", "A320"], ["", "Fenix A320 IAE", "A320"],
  ["B738", "PMDG 737-800", "B737-800"], ["", "PMDG 737-900ER", "B737-900ER"], ["", "Boeing 737 MAX 8", "B737-9"],
  ["", "iniBuilds A350-900", "A350-900"], ["", "Headwind A330-900neo", "A330-300"], ["B748", "Salty 747-8i", "B747-400"],
  ["", "Boeing 787-10 Asobo", "B787-9"], ["", "Cessna Skyhawk G1000 Asobo", "GA:C172"], ["C172", "", "GA:C172"],
  ["", "Just Flight PA-28R Arrow III", "GA:PA28"], ["", "Cirrus SR22T", "GA:SR22"], ["", "Beechcraft King Air 350i", "GA:BE20"],
];
let bad = 0;
for (const [acModel, title, want] of cases) {
  const r = detectAircraft({ connected: true, acModel, title });
  const got = r.opt || (r.ga ? "GA:" + r.ga : null);
  if (got !== want) { bad++; console.log("FAIL", title || acModel, "->", got, "want", want); }
}
console.log(bad ? `${bad} failed` : `all ${cases.length} passed`);
process.exit(bad ? 1 : 0);
