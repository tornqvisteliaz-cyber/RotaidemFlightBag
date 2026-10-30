// Generated airport pages (diagram + information) drawn as SVG from the open
// airport database. They are always available, even without Navigraph, and are
// clearly marked as not for navigation.
import { esc } from "./ui.js";
import { fmtLatLon } from "./geo.js";
import { SURFACE } from "./airports.js";

export const PAGE_W = 620, PAGE_H = 940;
const FONT = `font-family="Arial Narrow, Arial, Helvetica, sans-serif"`;

function header(ap, index, title, airac) {
  const city = [ap.city, ap.country].filter(Boolean).join(", ").toUpperCase();
  const name = ap.name.toUpperCase();
  const fit = (txt, size, max) => (txt.length * size * 0.56 > max ? `textLength="${max}" lengthAdjust="spacingAndGlyphs"` : "");
  return `
  <text x="22" y="30" ${FONT} font-size="17" font-weight="700">${esc(ap.icao)}${ap.iata ? "/" + esc(ap.iata) : ""}</text>
  <text x="22" y="52" ${FONT} font-size="10.5">${esc(title)}${airac ? "  ·  AIRAC " + esc(airac) : ""}</text>
  <rect x="${PAGE_W - 92}" y="14" width="70" height="22" fill="none" stroke="#000" stroke-width="1.2"/>
  <text x="${PAGE_W - 57}" y="30" ${FONT} font-size="14" font-weight="700" text-anchor="middle">${esc(index)}</text>
  <text x="${PAGE_W - 102}" y="30" ${FONT} font-size="11" text-anchor="end" ${fit(city, 11, 240)}>${esc(city)}</text>
  <text x="${PAGE_W - 22}" y="54" ${FONT} font-size="16" font-weight="700" text-anchor="end" ${fit(name, 16, 400)}>${esc(name)}</text>
  <line x1="14" y1="62" x2="${PAGE_W - 14}" y2="62" stroke="#000" stroke-width="1.4"/>`;
}

function freqStrip(ap, y) {
  const order = ["ATIS", "D-ATIS", "CLD", "DEL", "GND", "TWR", "APP", "A/D", "DEP", "ARR", "CTAF", "UNIC"];
  const fs = [...ap.freqs].sort((a, b) => (order.indexOf(a.type) + 99) % 99 - (order.indexOf(b.type) + 99) % 99).slice(0, 6);
  if (!fs.length) return { svg: "", h: 0 };
  const w = (PAGE_W - 28) / fs.length;
  const svg = fs.map((f, i) => `
    <rect x="${14 + i * w}" y="${y}" width="${w}" height="34" fill="none" stroke="#000" stroke-width=".8"/>
    <text x="${14 + i * w + w / 2}" y="${y + 13}" ${FONT} font-size="9.5" text-anchor="middle">${esc((f.desc || f.type).toUpperCase().slice(0, Math.floor(w / 5.4)))}</text>
    <text x="${14 + i * w + w / 2}" y="${y + 28}" ${FONT} font-size="13" font-weight="700" text-anchor="middle">${f.mhz.toFixed(f.mhz * 1000 % 10 ? 3 : 2)}</text>`).join("");
  return { svg, h: 34 };
}

function footer() {
  return `<line x1="14" y1="${PAGE_H - 34}" x2="${PAGE_W - 14}" y2="${PAGE_H - 34}" stroke="#000" stroke-width="1"/>
  <text x="22" y="${PAGE_H - 18}" ${FONT} font-size="9">GENERATED FROM OURAIRPORTS OPEN DATA – FOR SIMULATION USE ONLY – NOT FOR NAVIGATION</text>
  <text x="${PAGE_W - 22}" y="${PAGE_H - 18}" ${FONT} font-size="9" text-anchor="end">ROTAIDEM FLIGHT BAG</text>`;
}

const wrap = (body, dark) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_W} ${PAGE_H}" width="${PAGE_W}" height="${PAGE_H}">
  <rect width="${PAGE_W}" height="${PAGE_H}" fill="#fff"/><g fill="#000" color="#000">${body}</g></svg>`;

/** 10-9 style airport diagram. */
export function airportDiagram(ap, { airac } = {}) {
  const top = 70;
  const fr = freqStrip(ap, top);
  const box = { x: 30, y: top + fr.h + 20, w: PAGE_W - 60, h: PAGE_H - (top + fr.h + 20) - 64 };
  const rw = ap.runways.filter(r => r.len > 0);
  const cosL = Math.cos((ap.lat * Math.PI) / 180);
  const P = (lat, lon) => ({ x: (lon - ap.lon) * cosL * 60, y: -(lat - ap.lat) * 60 }); // NM, y down
  // Runway segments in NM coordinates (synthesised when thresholds are unknown).
  const segs = rw.map((r, i) => {
    if (r.leLat != null && r.heLat != null) return { r, a: P(r.leLat, r.leLon), b: P(r.heLat, r.heLon) };
    const hdg = ((r.leHdg ?? (parseInt(r.le, 10) || 36) * 10) * Math.PI) / 180;
    const half = r.len / 6076 / 2, off = (i - (rw.length - 1) / 2) * 0.35;
    const c = { x: off * Math.cos(hdg), y: off * Math.sin(hdg) };
    return { r, a: { x: c.x - Math.sin(hdg) * half, y: c.y + Math.cos(hdg) * half }, b: { x: c.x + Math.sin(hdg) * half, y: c.y - Math.cos(hdg) * half }, synth: true };
  });
  const xs = segs.flatMap(s => [s.a.x, s.b.x]), ys = segs.flatMap(s => [s.a.y, s.b.y]);
  let minX = Math.min(...xs, -0.5), maxX = Math.max(...xs, 0.5), minY = Math.min(...ys, -0.5), maxY = Math.max(...ys, 0.5);
  const pad = 0.35 * Math.max(maxX - minX, maxY - minY);
  minX -= pad; maxX += pad; minY -= pad; maxY += pad;
  const k = Math.min(box.w / (maxX - minX), box.h / (maxY - minY));
  const ox = box.x + (box.w - (maxX - minX) * k) / 2, oy = box.y + (box.h - (maxY - minY) * k) / 2;
  const X = p => ox + (p.x - minX) * k, Y = p => oy + (p.y - minY) * k;

  let body = header(ap, "10-9", "AIRPORT DIAGRAM", airac) + fr.svg;
  body += `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="none" stroke="#000" stroke-width="1.2"/>`;

  // Lat/lon ticks along the frame (every minute when it fits).
  const latAt = y => ap.lat - (minY + (y - oy) / k) / 60, lonAt = x => ap.lon + (minX + (x - ox) / k) / 60 / cosL;
  const step = (box.h / k) * 60 > 30 ? 5 / 60 : 1 / 60;
  const lat0 = latAt(box.y + box.h), lat1 = latAt(box.y);
  for (let la = Math.ceil(lat0 / step) * step; la < lat1; la += step) {
    const y = oy + ((ap.lat - la) * 60 - minY) * k;
    const mm = Math.round((Math.abs(la) % 1) * 60);
    body += `<line x1="${box.x}" y1="${y}" x2="${box.x + 8}" y2="${y}" stroke="#000"/><line x1="${box.x + box.w - 8}" y1="${y}" x2="${box.x + box.w}" y2="${y}" stroke="#000"/>
      <text x="${box.x + 11}" y="${y + 3}" ${FONT} font-size="8.5">${Math.floor(Math.abs(la))}-${String(mm).padStart(2, "0")}</text>`;
  }
  const lon0 = lonAt(box.x), lon1 = lonAt(box.x + box.w);
  for (let lo = Math.ceil(lon0 / step) * step; lo < lon1; lo += step) {
    const x = ox + ((lo - ap.lon) * cosL * 60 - minX) * k;
    const mm = Math.round((Math.abs(lo) % 1) * 60);
    body += `<line x1="${x}" y1="${box.y}" x2="${x}" y2="${box.y + 8}" stroke="#000"/><line x1="${x}" y1="${box.y + box.h - 8}" x2="${x}" y2="${box.y + box.h}" stroke="#000"/>
      <text x="${x}" y="${box.y + box.h - 11}" ${FONT} font-size="8.5" text-anchor="middle">${Math.floor(Math.abs(lo))}-${String(mm).padStart(2, "0")}</text>`;
  }

  // Runways
  for (const { r, a, b } of segs) {
    const ax = X(a), ay = Y(a), bx = X(b), by = Y(b);
    const ang = Math.atan2(by - ay, bx - ax), deg = (ang * 180) / Math.PI;
    const len = Math.hypot(bx - ax, by - ay);
    const wpx = Math.max(5, ((r.wid || 150) / 6076) * k);
    body += `<g transform="translate(${ax} ${ay}) rotate(${deg})">
      <rect x="0" y="${-wpx / 2}" width="${len}" height="${wpx}" fill="#111"/>
      <line x1="4" y1="0" x2="${len - 4}" y2="0" stroke="#fff" stroke-width=".8" stroke-dasharray="6 5"/>
      ${r.leDisp ? `<rect x="0" y="${-wpx / 2}" width="${(r.leDisp / 6076) * k}" height="${wpx}" fill="#fff" stroke="#111" stroke-width="1"/>` : ""}
      ${r.heDisp ? `<rect x="${len - (r.heDisp / 6076) * k}" y="${-wpx / 2}" width="${(r.heDisp / 6076) * k}" height="${wpx}" fill="#fff" stroke="#111" stroke-width="1"/>` : ""}
    </g>`;
    // Length / width label alongside
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const rot = deg > 90 || deg < -90 ? deg + 180 : deg;
    body += `<text transform="translate(${mx} ${my}) rotate(${rot}) translate(0 ${-wpx / 2 - 5})" ${FONT} font-size="9.5" text-anchor="middle">${r.len.toLocaleString("en-US")}' ${Math.round(r.len * 0.3048)}m${r.wid ? ` · ${r.wid}'` : ""}</text>`;
    // End labels: ident + true course + elevation
    const end = (x, y, ident, hdg, elev, dir) => {
      const lx = x - Math.cos(ang) * 26 * dir, ly = y - Math.sin(ang) * 26 * dir;
      return `<g transform="translate(${lx} ${ly})">
        <text ${FONT} font-size="15" font-weight="700" text-anchor="middle" y="0">${esc(ident)}</text>
        ${hdg != null ? `<text ${FONT} font-size="9" text-anchor="middle" y="11">${String(Math.round(hdg)).padStart(3, "0")}°T</text>` : ""}
        ${elev != null ? `<text ${FONT} font-size="8.5" text-anchor="middle" y="21">ELEV ${elev}'</text>` : ""}</g>`;
    };
    body += end(ax, ay, r.le, r.leHdg, r.leElev, 1);
    if (r.he) body += end(bx, by, r.he, r.heHdg, r.heElev, -1);
  }

  // ARP, north arrow, scale bar, elevation box
  const arp = { x: X({ x: 0, y: 0 }), y: Y({ x: 0, y: 0 }) };
  body += `<g transform="translate(${arp.x} ${arp.y})"><circle r="5" fill="none" stroke="#000" stroke-width="1.2"/><path d="M-5 0 H5 M0 -5 V5" stroke="#000"/></g>
    <text x="${arp.x + 8}" y="${arp.y - 7}" ${FONT} font-size="9">ARP</text>`;
  body += `<g transform="translate(${box.x + box.w - 40} ${box.y + 50})"><path d="M0 -26 L9 14 L0 7 L-9 14Z" fill="#000"/><text y="-30" ${FONT} font-size="12" font-weight="700" text-anchor="middle">N</text></g>`;
  const scaleNm = [0.25, 0.5, 1, 2, 5].find(s => s * k > 90) || 5;
  const sx = box.x + 20, sy = box.y + box.h - 30, sw = scaleNm * k;
  body += `<g ${FONT} font-size="9"><rect x="${sx}" y="${sy}" width="${sw / 2}" height="5" fill="#000"/><rect x="${sx + sw / 2}" y="${sy}" width="${sw / 2}" height="5" fill="#fff" stroke="#000" stroke-width=".8"/>
    <text x="${sx}" y="${sy - 4}">0</text><text x="${sx + sw}" y="${sy - 4}" text-anchor="end">${scaleNm} NM / ${Math.round(scaleNm * 6076)} FT</text></g>`;
  body += `<g transform="translate(${box.x + 14} ${box.y + 16})" ${FONT}>
    <rect width="150" height="44" fill="#fff" stroke="#000" stroke-width=".8"/>
    <text x="8" y="17" font-size="11" font-weight="700">ELEV ${ap.elev}'</text>
    <text x="8" y="33" font-size="9.5">ARP ${esc(fmtLatLon(ap.lat, ap.lon))}</text></g>`;
  if (segs.some(s => s.synth)) body += `<text x="${box.x + box.w / 2}" y="${box.y + box.h - 12}" ${FONT} font-size="9" text-anchor="middle" font-style="italic">Runway positions approximated – threshold coordinates not available</text>`;
  body += `<text x="${box.x + box.w - 14}" y="${box.y + box.h - 12}" ${FONT} font-size="8.5" text-anchor="end">Taxiways and aprons not depicted</text>`;
  body += footer();
  return wrap(body);
}

/** 10-1P style airport information page. */
export function airportInfo(ap, { airac, metar = "" } = {}) {
  let y = 70;
  let body = header(ap, "10-1P", "AIRPORT INFORMATION", airac);
  const sect = t => { const s = `<rect x="14" y="${y}" width="${PAGE_W - 28}" height="18" fill="#000"/><text x="22" y="${y + 13}" ${FONT} font-size="11" font-weight="700" fill="#fff">${esc(t)}</text>`; y += 30; return s; };
  body += sect("GENERAL");
  const gen = [
    ["Airport reference point", fmtLatLon(ap.lat, ap.lon)],
    ["Elevation", `${ap.elev} ft / ${Math.round(ap.elev * 0.3048)} m`],
    ["Location", [ap.city, ap.country].filter(Boolean).join(", ")],
    ["Runways", String(ap.runways.length)],
  ];
  for (const [k, v] of gen) { body += `<text x="22" y="${y}" ${FONT} font-size="11">${esc(k)}</text><text x="230" y="${y}" ${FONT} font-size="11" font-weight="700">${esc(v)}</text>`; y += 17; }
  y += 8;
  body += sect("RUNWAYS");
  const cols = [22, 72, 128, 210, 268, 350, 420];
  ["RWY", "TRUE", "LENGTH", "WIDTH", "SURFACE", "THR ELEV", "THRESHOLD"].forEach((h, i) => { body += `<text x="${cols[i]}" y="${y}" ${FONT} font-size="9.5" font-weight="700">${h}</text>`; });
  y += 6; body += `<line x1="14" y1="${y}" x2="${PAGE_W - 14}" y2="${y}" stroke="#000" stroke-width=".6"/>`; y += 14;
  for (const r of ap.runways) {
    for (const e of [{ id: r.le, hdg: r.leHdg, el: r.leElev, la: r.leLat, lo: r.leLon, disp: r.leDisp }, { id: r.he, hdg: r.heHdg, el: r.heElev, la: r.heLat, lo: r.heLon, disp: r.heDisp }]) {
      if (!e.id) continue;
      const vals = [e.id, e.hdg != null ? String(Math.round(e.hdg)).padStart(3, "0") + "°" : "—", `${r.len.toLocaleString("en-US")}'`, r.wid ? `${r.wid}'` : "—", SURFACE(r.surf), e.el != null ? `${e.el}'` : "—", e.la != null ? fmtLatLon(e.la, e.lo) : "—"];
      vals.forEach((v, i) => { body += `<text x="${cols[i]}" y="${y}" ${FONT} font-size="10.5" ${i === 0 ? 'font-weight="700"' : ""}>${esc(v)}</text>`; });
      if (e.disp) { y += 13; body += `<text x="72" y="${y}" ${FONT} font-size="9" font-style="italic">Displaced threshold ${e.disp}'  ·  LDA approx ${(r.len - e.disp).toLocaleString("en-US")}'</text>`; }
      y += 16;
    }
  }
  y += 8;
  body += sect("COMMUNICATIONS");
  const fr = ap.freqs.length ? ap.freqs : [{ type: "—", desc: "No frequencies in database", mhz: 0 }];
  fr.slice(0, 16).forEach((f, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 22 + col * 296, yy = y + row * 17;
    body += `<text x="${x}" y="${yy}" ${FONT} font-size="10.5">${esc(f.type)} ${esc(f.desc !== f.type ? f.desc : "")}</text>
      <text x="${x + 250}" y="${yy}" ${FONT} font-size="10.5" font-weight="700" text-anchor="end">${f.mhz ? f.mhz.toFixed(3) : ""}</text>`;
  });
  y += Math.ceil(Math.min(16, fr.length) / 2) * 17 + 10;
  if (metar) {
    body += sect("LATEST METAR");
    const words = metar.split(" ");
    let line = "";
    for (const w of words) {
      if ((line + " " + w).length > 90) { body += `<text x="22" y="${y}" font-family="Courier New, monospace" font-size="11">${esc(line)}</text>`; y += 15; line = w; }
      else line = line ? line + " " + w : w;
    }
    body += `<text x="22" y="${y}" font-family="Courier New, monospace" font-size="11">${esc(line)}</text>`;
  }
  body += footer();
  return wrap(body);
}
