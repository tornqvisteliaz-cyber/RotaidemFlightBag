// Which aircraft is loaded in the simulator. Matches the sim's ICAO code, ATC model,
// ATC type and title (e.g. "TT:ATCCOM.AC_MODEL_A320.0.text", "B738", "Cessna Skyhawk")
// to an OPT airliner type or a GA type for the GA apps.
import { onSim, simState } from "./sim.js";

// Order matters: the first match wins (737 MAX before 737-900 before 737).
const AIRLINER = [
  [/A35[09K]|A350/, "A350-900"],
  [/A34[0-6]|A340/, "A340-600"],
  [/A33[0-9]|A330|A339/, "A330-300"],
  [/A3(18|19|20|21)|A32NX|A[12][019]N|A320|A321|A319/, "A320"],
  [/B?78[789X]\b|787/, "B787-9"],
  [/B?74[4-8]\b|747/, "B747-400"],
  [/B?75[23]\b|757/, "B757-200"],
  [/737.?MAX|B3[789]M|\b7M[89]\b/, "B737-9"],
  [/737-?9|B739/, "B737-900ER"],
  [/737|B73[678]\b/, "B737-800"],
];
const GA = [
  [/C?172|SKYHAWK/, "C172", "Cessna 172 Skyhawk"],
  [/C?152\b/, "C152", "Cessna 152"],
  [/PA-?28|ARCHER|WARRIOR|CHEROKEE|P28A/, "PA28", "Piper PA-28"],
  [/SR-?2[02]|CIRRUS|S22T/, "SR22", "Cirrus SR22"],
  [/DA-?40|DA4\b/, "DA40", "Diamond DA40"],
  [/DA-?62|DA62/, "DA62", "Diamond DA62"],
  [/BONANZA|BE36|G36/, "BE36", "Beechcraft Bonanza"],
  [/BARON|BE58|G58/, "BE58", "Beechcraft Baron"],
  [/KING ?AIR|BE20|B350|BE9L/, "BE20", "Beechcraft King Air"],
  [/TBM|TBM9/, "TBM9", "Daher TBM"],
  [/CARAVAN|C208/, "C208", "Cessna Caravan"],
  [/PC-?12|PC12/, "PC12", "Pilatus PC-12"],
  [/\bCUB\b|J3|PA18|SAVAGE|ICON|A5\b|EXTRA|E330|CAP ?10|DV20|JMB|VL3|ZLIN|DR40/, "LSA", "Light aircraft"],
];

/** Wingspan in metres by ICAO type designator (shown in the airport moving map header). */
export const WINGSPAN = {
  A319: 35.8, A320: 35.8, A321: 35.8, A19N: 35.8, A20N: 35.8, A21N: 35.8, A332: 60.3, A333: 60.3, A339: 64.0,
  A343: 60.3, A346: 63.45, A359: 64.75, A35K: 64.75, B736: 35.79, B737: 35.79, B738: 35.79, B739: 35.79,
  B37M: 35.92, B38M: 35.92, B39M: 35.92, B744: 64.44, B748: 68.4, B752: 38.05, B753: 38.05, B772: 60.93,
  B77W: 64.8, B788: 60.12, B789: 60.12, B78X: 60.12, C172: 11.0, C152: 10.11, PA28: 10.67, SR22: 11.68, DA40: 11.94,
};
const OPT_ICAO = { "A320": "A320", "A330-300": "A333", "A340-600": "A346", "A350-900": "A359", "B737-800": "B738", "B737-900ER": "B739", "B737-9": "B39M", "B747-400": "B744", "B757-200": "B752", "B787-9": "B789" };
/** "B738 (117.42' · 35.79m)" for an ICAO code, or just the code when the span is unknown. */
export function spanLabel(icao) {
  const m = WINGSPAN[icao];
  return m ? `${icao} (${(m / 0.3048).toFixed(2)}' · ${m.toFixed(2)}m)` : icao || "";
}
/** ICAO type of the sim aircraft (detected) or of the flight plan. */
export const icaoOf = (det, flight) => (det?.opt && OPT_ICAO[det.opt]) || det?.ga || flight?.aircraft?.icao || "";

/** { opt, ga, name, tail, source } for the current sim aircraft, or null. */
export function detectAircraft(s = simState()) {
  if (!s?.connected) return null;
  const txt = [s.acIcao, s.acModel, s.acType, s.title].filter(Boolean).join(" ").toUpperCase().replace(/_/g, " ");
  if (!txt.trim()) return null;
  const base = { tail: s.callsign || "", source: s.source, raw: s.title || s.acIcao || s.acModel || "" };
  for (const [re, opt] of AIRLINER) if (re.test(txt)) return { ...base, opt, ga: null, name: opt };
  for (const [re, ga, name] of GA) if (re.test(txt)) return { ...base, opt: null, ga, name };
  return { ...base, opt: null, ga: null, name: s.title || s.acIcao || "Unknown aircraft" };
}

/** Calls fn(aircraft) whenever the detected aircraft changes (null when the sim disconnects). */
export function onAircraft(fn) {
  let last;
  return onSim(s => {
    const a = detectAircraft(s);
    const key = a ? `${a.opt}|${a.ga}|${a.name}|${a.tail}` : "";
    if (key !== last) { last = key; fn(a); }
  });
}
