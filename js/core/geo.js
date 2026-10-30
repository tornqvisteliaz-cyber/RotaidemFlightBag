// Great-circle helpers. Distances in nautical miles, angles in degrees.
const R_NM = 3440.065;
const rad = d => (d * Math.PI) / 180;
const deg = r => (r * 180) / Math.PI;

export function distNM(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function bearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function destination(lat, lon, brg, nm) {
  const d = nm / R_NM, b = rad(brg), p1 = rad(lat), l1 = rad(lon);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [deg(p2), ((deg(l2) + 540) % 360) - 180];
}

/** Points along the great circle between two positions (inclusive). */
export function greatCircle(lat1, lon1, lat2, lon2, n = 64) {
  const p1 = rad(lat1), l1 = rad(lon1), p2 = rad(lat2), l2 = rad(lon2);
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  if (d === 0) return [[lat1, lon1]];
  const out = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    out.push([deg(Math.atan2(z, Math.hypot(x, y))), deg(Math.atan2(y, x))]);
  }
  return out;
}

/** Head-/cross-wind components for a runway true heading. Positive head = headwind, positive cross = from the right. */
export function windComponents(rwyHdg, windDir, windKt) {
  const a = rad(windDir - rwyHdg);
  return { head: windKt * Math.cos(a), cross: windKt * Math.sin(a) };
}

/** Make longitudes continuous so lines crossing the antimeridian draw correctly in Leaflet. */
export function unwrap(latlngs) {
  const out = [];
  let prev = null;
  for (const [la, lo] of latlngs) {
    let l = lo;
    if (prev != null) { while (l - prev > 180) l -= 360; while (l - prev < -180) l += 360; }
    out.push([la, l]); prev = l;
  }
  return out;
}

export function fmtLatLon(lat, lon) {
  const f = (v, p, n, w) => {
    const a = Math.abs(v), d = Math.floor(a), m = (a - d) * 60;
    return `${v >= 0 ? p : n}${String(d).padStart(w, "0")} ${m.toFixed(1).padStart(4, "0")}`;
  };
  return `${f(lat, "N", "S", 2)} ${f(lon, "E", "W", 3)}`;
}
