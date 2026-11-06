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
