// Self-check for the GA maths in js/apps/ga.js:  node tools/test-ga.mjs
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../js/apps/ga.js", import.meta.url), "utf8").replace(/^import .*$/gm, "");
const { wbCalc, windTriangle, airData } = await import("data:text/javascript," + encodeURIComponent(src));
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const checks = [];
// C172S: 1680@39.6 + 340 front@37 + 53 gal@48 → 2338 lb, CG ≈ 40.36 in, inside the envelope.
const c172 = { empty: [1680, 39.6], mtow: 2550, fuelMax: 53, st: [["front", "", 37], ["rear", "", 73]], fuelArm: 48, env: [[35, 1500], [35, 1950], [41, 2550], [47.3, 2550], [47.3, 1500]] };
const r = wbCalc(c172, { front: 340, fuel: 53 });
checks.push(["W&B weight", r.ramp.w === 2338], ["W&B CG", near(r.ramp.cg, 40.36, 0.02)], ["W&B in envelope", r.ramp.ok]);
checks.push(["W&B over MTOW flagged", !wbCalc(c172, { front: 400, rear: 400, fuel: 53 }).to.ok]);
// 90° course, 110 kt TAS, wind 360/20 → WCA ≈ +10.5° (wind from the left → correct left, negative).
const w = windTriangle(90, 110, 360, 20);
checks.push(["Wind WCA", near(w.wca, -10.5, 0.3)], ["Wind GS", near(w.gs, 108, 1)], ["Pure headwind GS", near(windTriangle(90, 100, 90, 20).gs, 80, 0.01)]);
// ISA sea level: DA = PA = 0, TAS = CAS.
const a0 = airData(0, 1013.25, 15, 100);
checks.push(["ISA DA 0", near(a0.da, 0, 1)], ["ISA TAS = CAS", near(a0.tas, 100, 0.5)]);
// 5000 ft, ISA+20 → DA ≈ 7400 ft; TAS higher than CAS.
const a1 = airData(5000, 1013.25, 25, 100);
checks.push(["Hot day DA", near(a1.da, 7400, 50)], ["TAS > CAS aloft", a1.tas > 110]);
const bad = checks.filter(([, ok]) => !ok);
bad.forEach(([n]) => console.log("FAIL", n));
console.log(bad.length ? `${bad.length} failed` : `all ${checks.length} passed`);
process.exit(bad.length ? 1 : 0);
