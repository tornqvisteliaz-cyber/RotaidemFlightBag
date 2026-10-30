// Simplified 737 takeoff / landing performance model.
// Calibrated to give plausible numbers for flight simulation. It is NOT
// certified data and must never be used for real-world flight operations.

export const AIRCRAFT = {
  "B737-800": { mtow: 79010, mlw: 66361, mzfw: 62732, ratings: ["26K", "24K", "22K"], base: "26K", acf: 1.0, vk: 18.6, vrefK: 17.8, toFlaps: [1, 5, 10, 15, 25], ldgFlaps: [15, 30, 40] },
  "B737-900ER": { mtow: 85139, mlw: 71350, mzfw: 67721, ratings: ["27K", "26K", "24K"], base: "27K", acf: 1.04, vk: 18.8, vrefK: 17.9, toFlaps: [1, 5, 10, 15, 25], ldgFlaps: [15, 30, 40] },
  "B737-9": { mtow: 88314, mlw: 74344, mzfw: 70841, ratings: ["28K", "26K"], base: "28K", acf: 0.99, vk: 18.7, vrefK: 17.7, toFlaps: [1, 5, 10, 15, 25], ldgFlaps: [15, 30, 40] },
};
AIRCRAFT.TRAINING = AIRCRAFT["B737-800"];

const FLAP_TO = { 1: { v: 1.06, d: 1.12 }, 5: { v: 1.0, d: 1.0 }, 10: { v: 0.975, d: 0.955 }, 15: { v: 0.96, d: 0.925 }, 25: { v: 0.935, d: 0.9 } };
const FLAP_LDG = { 15: { v: 1.08, d: 1.15 }, 30: { v: 1.0, d: 1.0 }, 40: { v: 0.96, d: 0.95 } };
const COND = {
  DRY: { to: 1.0, v1: 0, ldg: 1.0, ab: 1.0 },
  WET: { to: 1.15, v1: -8, ldg: 1.32, ab: 1.15 },
  "STANDING WATER": { to: 1.38, v1: -14, ldg: 1.85, ab: 1.6 },
  SLUSH: { to: 1.42, v1: -15, ldg: 1.9, ab: 1.65 },
  "COMPACT SNOW": { to: 1.3, v1: -12, ldg: 1.65, ab: 1.45 },
  ICE: { to: 1.6, v1: -20, ldg: 3.0, ab: 2.6 },
};
export const CONDITIONS = Object.keys(COND);
const RATING_FACTOR = r => ({ "28K": 0.93, "27K": 0.96, "26K": 1.0, "24K": 1.085, "22K": 1.19 }[r] || 1);
const AUTOBRAKE = { "MAX MANUAL": 1.0, MAX: 1.18, "3": 1.5, "2": 1.82, "1": 2.12 };
export const AUTOBRAKES = Object.keys(AUTOBRAKE);

function atmosphere(elevFt, qnh, oat) {
  const pa = elevFt + (1013.25 - (qnh || 1013.25)) * 27;
  const p = Math.pow(1 - 6.8756e-6 * pa, 5.2559);
  const t = (oat + 273.15) / 288.15;
  return { pa, sigma: p / t, flat: 30 - (pa / 1000) * 2 };
}
const thrustFactor = (temp, flat) => 1 - 0.0105 * Math.max(0, temp - flat);
const windFactor = (head, kind) => head >= 0 ? 1 - (kind === "ldg" ? 0.0035 : 0.0028) * head * 0.5 : 1 + 0.018 * -head * 1.5;

/** Field length (m) needed for takeoff at the given conditions. */
function fieldLength({ ac, w, flap, rating, temp, elev, qnh, head, cond, ai, packs, ic, rev }) {
  const a = atmosphere(elev, qnh, temp);
  const t = thrustFactor(temp, a.flat) * (ai ? 0.985 : 1) * (packs ? 1 : 1.01);
  let d = 0.3685 * (w / 1000) ** 2 * FLAP_TO[flap].d * RATING_FACTOR(rating) * ac.acf / (a.sigma * t);
  d *= windFactor(head, "to") * COND[cond].to * (ic ? 1.04 : 1);
  if (!rev && cond !== "DRY") d *= 1.05;
  return d;
}

export function takeoff(i) {
  const ac = AIRCRAFT[i.type];
  const tora = i.tora; // metres
  const base = { ...i, ac, temp: i.oat, rating: i.rating };
  const req = fieldLength(base);
  // Assumed temperature: highest temp (≤ 25 % thrust reduction, ≤ 70 °C) that still fits.
  let atm = null;
  const a0 = atmosphere(i.elev, i.qnh, i.oat);
  const canDerate = i.atmMode !== "OFF" && (i.cond === "DRY" || i.cond === "WET");
  if (canDerate && i.atmFixed != null && !isNaN(i.atmFixed)) {
    atm = i.atmFixed > i.oat && fieldLength({ ...base, temp: i.atmFixed }) <= tora ? i.atmFixed : null;
  } else if (canDerate) {
    for (let ta = Math.ceil(Math.max(i.oat, a0.flat)) + 1; ta <= 70; ta++) {
      const red = 1 - thrustFactor(ta, a0.flat) / thrustFactor(i.oat, a0.flat);
      if (red > 0.25) break;
      if (fieldLength({ ...base, temp: ta }) <= tora) atm = ta; else break;
    }
  }
  const useT = atm ?? i.oat;
  const reqUsed = fieldLength({ ...base, temp: useT });
  // V speeds
  const wt = i.w / 1000;
  let v2 = ac.vk * Math.sqrt(wt) * FLAP_TO[i.flap].v + (i.ic ? 6 : 0);
  v2 = Math.max(v2, 118);
  const vr = v2 - 5;
  const margin = (tora - reqUsed) / tora;
  let v1 = vr - 2 - Math.max(0, 6 - margin * 40) + COND[i.cond].v1;
  v1 = Math.max(Math.min(v1, vr), 108 + (i.elev / 1000) * 1.2);
  // N1
  const n1Full = Math.min(101.5, 97.6 + (a0.pa / 1000) * 0.55 + 0.04 * Math.min(i.oat, a0.flat) - 0.12 * Math.max(0, i.oat - a0.flat)) + (RATING_FACTOR(i.rating) - 1) * -14;
  const n1 = atm ? n1Full - 0.27 * (atm - Math.max(i.oat, a0.flat)) : n1Full;
  // Limits
  const fieldLimit = Math.sqrt((tora * a0.sigma * thrustFactor(i.oat, a0.flat)) / (0.3685 * FLAP_TO[i.flap].d * RATING_FACTOR(i.rating) * ac.acf * windFactor(i.head, "to") * COND[i.cond].to)) * 1000;
  const climbLimit = ac.mtow * (1.12 - 0.0045 * Math.max(0, i.oat - a0.flat + 15) - 0.028 * (a0.pa / 1000)) * (i.flap >= 15 ? 0.97 : 1);
  const limits = [["FIELD", fieldLimit], ["CLIMB", climbLimit], ["STRUCT", ac.mtow]];
  const [code, perfLimit] = limits.reduce((m, x) => (x[1] < m[1] ? x : m));
  const trim = Math.max(2.5, Math.min(8.5, 6.4 - 0.16 * ((i.cg ?? 22) - 15) + (i.w - 65000) / 20000));
  return {
    v1: Math.round(v1), vr: Math.round(vr), v2: Math.round(v2),
    atm, n1: +n1.toFixed(1), n1Full: +n1Full.toFixed(1),
    req: Math.round(reqUsed), reqFull: Math.round(req), allEngine: Math.round(req * 0.74), asd: Math.round(req * 0.97),
    margin: Math.round(tora - reqUsed), perfLimit: Math.round(perfLimit), limitCode: code, trim: +trim.toFixed(1),
    ok: i.w <= perfLimit && reqUsed <= tora, sigma: a0.sigma, pa: Math.round(a0.pa),
    vref30: Math.round(ac.vrefK * Math.sqrt(wt)),
  };
}

export function landing(i) {
  const ac = AIRCRAFT[i.type];
  const a = atmosphere(i.elev, i.qnh, i.oat);
  const wt = i.w / 1000;
  const vref = ac.vrefK * Math.sqrt(wt) * FLAP_LDG[i.flap].v;
  const envF = (1 + 0.035 * (a.pa / 1000)) * (1 + 0.0025 * (i.oat - 15)) * windFactor(i.head, "ldg") * FLAP_LDG[i.flap].d * (wt / 60) * (i.ai ? 1.02 : 1);
  const baseDry = 1010 * envF; // max manual braking, dry, with reversers, metres
  const dist = ab => {
    const c = COND[i.cond];
    let d = baseDry * AUTOBRAKE[ab] * (ab === "MAX MANUAL" ? c.ldg : c.ab);
    if (!i.rev) d *= i.cond === "DRY" ? 1.04 : 1.12;
    return Math.round(d * (1 + 0.003 * (i.addSpeed || 0) * 2));
  };
  const dispatchReq = Math.round(baseDry * COND.DRY.ldg * 1.67 * (i.cond !== "DRY" ? 1.15 : 1));
  const fieldLimit = (i.lda / (1.67 * (i.cond !== "DRY" ? 1.15 : 1) * 1010 * envF / wt)) * 1000;
  return {
    vref: Math.round(vref), vapp: Math.round(vref + Math.max(5, Math.min(20, (i.headGust || 0)))),
    table: AUTOBRAKES.map(ab => ({ ab, d: dist(ab), ok: dist(ab) <= i.lda })),
    selected: dist(i.autobrake), dispatchReq, fieldLimit: Math.round(Math.min(fieldLimit, ac.mlw)),
    limitCode: fieldLimit < ac.mlw ? "FIELD" : "STRUCT",
    ok: dispatchReq <= i.lda && i.w <= Math.min(fieldLimit, ac.mlw),
  };
}
