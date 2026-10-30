// Simplified takeoff / landing performance model for common airliners.
// Each type is scaled from a few published reference figures (MTOW field length,
// V2 at MTOW, VREF at MLW, landing distance at MLW). The results are plausible
// for flight simulation but are NOT certified data and must never be used for
// real-world flight operations.

// to/ldg: flap label -> { v: speed factor, d: distance factor } relative to the default setting.
const BOEING_NB_TO = { 1: { v: 1.06, d: 1.12 }, 5: { v: 1.0, d: 1.0 }, 10: { v: 0.975, d: 0.955 }, 15: { v: 0.96, d: 0.925 }, 25: { v: 0.935, d: 0.9 } };
const BOEING_NB_LDG = { 15: { v: 1.08, d: 1.15 }, 30: { v: 1.0, d: 1.0 }, 40: { v: 0.96, d: 0.95 } };
const AIRBUS_TO = { "1+F": { v: 1.0, d: 1.0 }, 2: { v: 0.975, d: 0.95 }, 3: { v: 0.955, d: 0.92 } };
const AIRBUS_LDG = { 3: { v: 1.04, d: 1.08 }, FULL: { v: 1.0, d: 1.0 } };

const ac = o => ({ maker: "Boeing", ratingFactor: {}, ...o });
export const AIRCRAFT = {
  "A320": ac({ maker: "Airbus", name: "A320-200", mtow: 78000, mlw: 66000, mzfw: 62500, tofl: 2100, v2: 158, vref: 138, ld: 900, engines: "CFM56-5B",
    to: AIRBUS_TO, ldg: AIRBUS_LDG, defTo: "1+F", defLdg: "FULL", ratings: ["TOGA"], base: "TOGA", n1: 92.5 }),
  "A330-300": ac({ maker: "Airbus", name: "A330-300", mtow: 242000, mlw: 187000, mzfw: 175000, tofl: 2770, v2: 166, vref: 140, ld: 1060, engines: "Trent 772B",
    to: AIRBUS_TO, ldg: AIRBUS_LDG, defTo: "1+F", defLdg: "FULL", ratings: ["TOGA"], base: "TOGA", n1: 96 }),
  "A340-600": ac({ maker: "Airbus", name: "A340-600", mtow: 380000, mlw: 265000, mzfw: 251000, tofl: 3100, v2: 176, vref: 152, ld: 1300, engines: "Trent 556",
    to: AIRBUS_TO, ldg: AIRBUS_LDG, defTo: "1+F", defLdg: "FULL", ratings: ["TOGA"], base: "TOGA", n1: 95 }),
  "A350-900": ac({ maker: "Airbus", name: "A350-900", mtow: 283000, mlw: 207000, mzfw: 195700, tofl: 2600, v2: 164, vref: 140, ld: 1080, engines: "Trent XWB-84",
    to: AIRBUS_TO, ldg: AIRBUS_LDG, defTo: "1+F", defLdg: "FULL", ratings: ["TOGA"], base: "TOGA", n1: 94 }),
  "B737-800": ac({ name: "737-800", mtow: 79010, mlw: 66361, mzfw: 62732, tofl: 2300, v2: 165, vref: 145, ld: 1120, engines: "CFM56-7B26",
    to: BOEING_NB_TO, ldg: BOEING_NB_LDG, defTo: "5", defLdg: "30", ratings: ["26K", "24K", "22K"], base: "26K", n1: 97.6,
    ratingFactor: { "26K": 1, "24K": 1.085, "22K": 1.19 } }),
  "B737-900ER": ac({ name: "737-900ER", mtow: 85139, mlw: 71350, mzfw: 67721, tofl: 2500, v2: 168, vref: 150, ld: 1200, engines: "CFM56-7B27",
    to: BOEING_NB_TO, ldg: BOEING_NB_LDG, defTo: "5", defLdg: "30", ratings: ["27K", "26K", "24K"], base: "27K", n1: 98,
    ratingFactor: { "27K": 1, "26K": 1.04, "24K": 1.13 } }),
  "B737-9": ac({ name: "737-9", mtow: 88314, mlw: 74344, mzfw: 70841, tofl: 2600, v2: 170, vref: 152, ld: 1250, engines: "LEAP-1B28",
    to: BOEING_NB_TO, ldg: BOEING_NB_LDG, defTo: "5", defLdg: "30", ratings: ["28K", "26K"], base: "28K", n1: 99,
    ratingFactor: { "28K": 1, "26K": 1.08 } }),
  "B747-400": ac({ name: "747-400", mtow: 396890, mlw: 295740, mzfw: 246080, tofl: 3200, v2: 180, vref: 157, ld: 1280, engines: "CF6-80C2B1F",
    to: { 10: { v: 1.0, d: 1.0 }, 20: { v: 0.965, d: 0.93 } }, ldg: { 25: { v: 1.04, d: 1.07 }, 30: { v: 1.0, d: 1.0 } }, defTo: "10", defLdg: "30",
    ratings: ["TO", "TO 1", "TO 2"], base: "TO", n1: 102, ratingFactor: { TO: 1, "TO 1": 1.11, "TO 2": 1.24 } }),
  "B757-200": ac({ name: "757-200", mtow: 115680, mlw: 89810, mzfw: 83460, tofl: 2100, v2: 155, vref: 137, ld: 840, engines: "RB211-535E4",
    to: { 5: { v: 1.0, d: 1.0 }, 15: { v: 0.97, d: 0.94 }, 20: { v: 0.955, d: 0.92 } }, ldg: { 25: { v: 1.03, d: 1.06 }, 30: { v: 1.0, d: 1.0 } }, defTo: "5", defLdg: "30",
    ratings: ["TO", "TO 1", "TO 2"], base: "TO", n1: 95, ratingFactor: { TO: 1, "TO 1": 1.11, "TO 2": 1.24 } }),
  "B787-9": ac({ name: "787-9", mtow: 254011, mlw: 192777, mzfw: 181437, tofl: 2900, v2: 170, vref: 145, ld: 1100, engines: "GEnx-1B74/75",
    to: { 5: { v: 1.02, d: 1.05 }, 10: { v: 1.0, d: 1.0 }, 15: { v: 0.985, d: 0.97 }, 17: { v: 0.98, d: 0.96 }, 18: { v: 0.977, d: 0.955 }, 20: { v: 0.97, d: 0.945 } },
    ldg: { 25: { v: 1.03, d: 1.06 }, 30: { v: 1.0, d: 1.0 } }, defTo: "10", defLdg: "30",
    ratings: ["TO", "TO 1", "TO 2"], base: "TO", n1: 98, ratingFactor: { TO: 1, "TO 1": 1.1, "TO 2": 1.22 } }),
};
AIRCRAFT.TRAINING = AIRCRAFT["B737-800"];
export const typeOf = name => AIRCRAFT[name] || AIRCRAFT[Object.keys(AIRCRAFT).find(k => name?.toUpperCase().includes(k.replace("B", "").split("-")[0]))] || AIRCRAFT["B737-800"];
export const flapLabel = (a, f) => (a.maker === "Airbus" ? `CONF ${f}` : `FLAPS ${f}`);

const COND = {
  DRY: { to: 1.0, v1: 0, ldg: 1.0, ab: 1.0 },
  WET: { to: 1.15, v1: -8, ldg: 1.32, ab: 1.15 },
  "STANDING WATER": { to: 1.38, v1: -14, ldg: 1.85, ab: 1.6 },
  SLUSH: { to: 1.42, v1: -15, ldg: 1.9, ab: 1.65 },
  "COMPACT SNOW": { to: 1.3, v1: -12, ldg: 1.65, ab: 1.45 },
  ICE: { to: 1.6, v1: -20, ldg: 3.0, ab: 2.6 },
};
export const CONDITIONS = Object.keys(COND);
const AUTOBRAKE = { "MAX MANUAL": 1.0, MAX: 1.18, "4": 1.32, "3": 1.5, "2": 1.82, "1": 2.12, HI: 1.2, MED: 1.55, LO: 2.05 };
export const autobrakes = a => (a.maker === "Airbus" ? ["MAX MANUAL", "HI", "MED", "LO"] : a.name.startsWith("737") ? ["MAX MANUAL", "MAX", "3", "2", "1"] : ["MAX MANUAL", "MAX", "4", "3", "2", "1"]);
export const AUTOBRAKES = Object.keys(AUTOBRAKE);

function atmosphere(elevFt, qnh, oat) {
  const pa = elevFt + (1013.25 - (qnh || 1013.25)) * 27;
  const p = Math.pow(1 - 6.8756e-6 * pa, 5.2559);
  const t = (oat + 273.15) / 288.15;
  return { pa, sigma: p / t, flat: 30 - (pa / 1000) * 2 };
}
const thrustFactor = (temp, flat) => 1 - 0.0105 * Math.max(0, temp - flat);
const windFactor = (head, kind) => (head >= 0 ? 1 - (kind === "ldg" ? 0.0035 : 0.0028) * head * 0.5 : 1 + 0.018 * -head * 1.5);
const flapTo = (a, f) => a.to[f] || a.to[a.defTo];
const flapLdg = (a, f) => a.ldg[f] || a.ldg[a.defLdg];
const rf = (a, r) => a.ratingFactor[r] || 1;

/** Field length (m) needed for takeoff. */
function fieldLength({ a, w, flap, rating, temp, elev, qnh, head, cond, ai, packs, ic, rev }) {
  const at = atmosphere(elev, qnh, temp);
  const t = thrustFactor(temp, at.flat) * (ai ? 0.985 : 1) * (packs ? 1 : 1.01);
  let d = a.tofl * (w / a.mtow) ** 2 * flapTo(a, flap).d * rf(a, rating) / (at.sigma * t);
  d *= windFactor(head, "to") * COND[cond].to * (ic ? 1.04 : 1);
  if (!rev && cond !== "DRY") d *= 1.05;
  return d;
}

export function takeoff(i) {
  const a = AIRCRAFT[i.type] || AIRCRAFT["B737-800"];
  const tora = i.tora;
  const base = { ...i, a, temp: i.oat };
  const req = fieldLength(base);
  const a0 = atmosphere(i.elev, i.qnh, i.oat);
  // Assumed temperature / FLEX: highest temp (≤ 25 % thrust reduction, ≤ 70 °C) that still fits.
  let atm = null;
  const canDerate = i.atmMode !== "OFF" && (i.cond === "DRY" || i.cond === "WET");
  if (canDerate && i.atmFixed != null && !isNaN(i.atmFixed)) {
    atm = i.atmFixed > i.oat && fieldLength({ ...base, temp: i.atmFixed }) <= tora ? i.atmFixed : null;
  } else if (canDerate) {
    for (let ta = Math.ceil(Math.max(i.oat, a0.flat)) + 1; ta <= 70; ta++) {
      if (1 - thrustFactor(ta, a0.flat) / thrustFactor(i.oat, a0.flat) > 0.25) break;
      if (fieldLength({ ...base, temp: ta }) <= tora) atm = ta; else break;
    }
  }
  const reqUsed = fieldLength({ ...base, temp: atm ?? i.oat });
  const v2 = Math.max(a.v2 * Math.sqrt(i.w / a.mtow) * flapTo(a, i.flap).v + (i.ic ? 6 : 0), 115);
  const vr = v2 - (a.maker === "Airbus" ? 4 : 5);
  const margin = (tora - reqUsed) / tora;
  let v1 = vr - 2 - Math.max(0, 6 - margin * 40) + COND[i.cond].v1;
  v1 = Math.max(Math.min(v1, vr), 108 + (i.elev / 1000) * 1.2);
  const n1Full = Math.min(a.n1 + 4, a.n1 + (a0.pa / 1000) * 0.55 + 0.04 * Math.min(i.oat, a0.flat) - 0.12 * Math.max(0, i.oat - a0.flat)) - (rf(a, i.rating) - 1) * 14;
  const n1 = atm ? n1Full - 0.27 * (atm - Math.max(i.oat, a0.flat)) : n1Full;
  const fieldLimit = a.mtow * Math.sqrt((tora * a0.sigma * thrustFactor(i.oat, a0.flat)) / (a.tofl * flapTo(a, i.flap).d * rf(a, i.rating) * windFactor(i.head, "to") * COND[i.cond].to));
  const climbLimit = a.mtow * (1.12 - 0.0045 * Math.max(0, i.oat - a0.flat + 15) - 0.028 * (a0.pa / 1000)) * (flapTo(a, i.flap).d < 0.95 ? 0.97 : 1);
  const [code, perfLimit] = [["FIELD", fieldLimit], ["CLIMB", climbLimit], ["STRUCT", a.mtow]].reduce((m, x) => (x[1] < m[1] ? x : m));
  const trim = a.maker === "Airbus"
    ? (i.cg != null ? Math.max(-3, Math.min(4, 2.5 - 0.18 * (i.cg - 20))) : null) // THS degrees UP/DN
    : Math.max(2.5, Math.min(8.5, 6.4 - 0.16 * ((i.cg ?? 22) - 15) + (i.w / a.mtow - 0.82) * 4));
  return {
    v1: Math.round(v1), vr: Math.round(vr), v2: Math.round(v2), atm,
    n1: +n1.toFixed(1), n1Full: +n1Full.toFixed(1),
    req: Math.round(reqUsed), reqFull: Math.round(req), allEngine: Math.round(req * 0.74), asd: Math.round(req * 0.97),
    margin: Math.round(tora - reqUsed), perfLimit: Math.round(perfLimit), limitCode: code,
    trim: trim == null ? null : +trim.toFixed(1), ok: i.w <= perfLimit && reqUsed <= tora,
    sigma: a0.sigma, pa: Math.round(a0.pa),
    vrefRtn: Math.round(a.vref * Math.sqrt(i.w / a.mlw)),
    thrustText: a.maker === "Airbus" ? (atm ? `FLX ${atm}` : "TOGA") : atm ? `${i.rating} / ${atm}°C` : i.rating,
  };
}

export function landing(i) {
  const a = AIRCRAFT[i.type] || AIRCRAFT["B737-800"];
  const at = atmosphere(i.elev, i.qnh, i.oat);
  const vref = a.vref * Math.sqrt(i.w / a.mlw) * flapLdg(a, i.flap).v;
  const envF = (1 + 0.035 * (at.pa / 1000)) * (1 + 0.0025 * (i.oat - 15)) * windFactor(i.head, "ldg") * flapLdg(a, i.flap).d * (i.ai ? 1.02 : 1);
  const baseDry = a.ld * (i.w / a.mlw) * envF; // max manual braking, dry, reversers, metres
  const dist = ab => {
    const c = COND[i.cond];
    let d = baseDry * (AUTOBRAKE[ab] || 1.5) * (ab === "MAX MANUAL" ? c.ldg : c.ab);
    if (!i.rev) d *= i.cond === "DRY" ? 1.04 : 1.12;
    return Math.round(d * (1 + 0.006 * (i.addSpeed || 0)));
  };
  const fac = 1.67 * (i.cond !== "DRY" ? 1.15 : 1);
  const dispatchReq = Math.round(baseDry * fac);
  const fieldLimit = (i.lda / (fac * a.ld * envF)) * a.mlw;
  const table = autobrakes(a).map(ab => ({ ab, d: dist(ab), ok: dist(ab) <= i.lda }));
  return {
    vref: Math.round(vref), vapp: Math.round(vref + Math.max(5, Math.min(20, i.headGust || 0))),
    table, selected: dist(i.autobrake), dispatchReq,
    fieldLimit: Math.round(Math.min(fieldLimit, a.mlw)), limitCode: fieldLimit < a.mlw ? "FIELD" : "STRUCT",
    ok: dispatchReq <= i.lda && i.w <= Math.min(fieldLimit, a.mlw),
  };
}
