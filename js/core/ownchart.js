// Own-ship on geo-referenced charts ("moving charts"): the aircraft symbol drawn on
// a chart that carries geo-reference data, like own-ship on airline EFB airport charts.
import { geoToChart } from "./genchart.js";

const PLANE = `<path d="M0 -15 C1.3 -15 2 -13.5 2 -11.5 V-5 L13 1.5 V4 L2 1 V8 L5.5 10.8 V12.8 L0 11.4 L-5.5 12.8 V10.8 L-2 8 V1 L-13 4 V1.5 L-2 -5 V-11.5 C-2 -13.5 -1.3 -15 0 -15Z"
  fill="#d22fc9" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>`;

/**
 * Attach own-ship to a chart SVG. Returns null when the chart is not geo-referenced.
 * update(simState) moves the symbol and returns its chart position (or null when off the chart).
 */
export function chartOwnship(svg) {
  const host = svg?.querySelector(".geo-own");
  if (!host) return null;
  const geo = JSON.parse(host.dataset.geo);
  host.innerHTML = `<g class="own-ac" style="display:none">${PLANE}</g>`;
  const ac = host.firstElementChild;
  let rot = null;
  return {
    geo,
    update(s) {
      if (!s?.connected || s.lat == null) { ac.style.display = "none"; return null; }
      const p = geoToChart(geo, s.lat, s.lon);
      const inside = p.x >= geo.bx && p.x <= geo.bx + geo.bw && p.y >= geo.by && p.y <= geo.by + geo.bh;
      ac.style.display = inside ? "" : "none";
      if (!inside) return null;
      const h = (s.onGround ? s.hdg : s.trk ?? s.hdg) ?? 0;
      // Keep the angle continuous so the CSS transition turns the short way round.
      rot = rot == null ? h : rot + ((((h - rot) % 360) + 540) % 360 - 180);
      ac.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`;
      return p;
    },
  };
}
