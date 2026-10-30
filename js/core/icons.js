// App icons (100x100 artboards) and small UI glyphs.
const svg = (body, defs = "") => `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>${body}</svg>`;
const grad = (id, a, b, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;

export const APP_ICONS = {
  charts: svg(
    `<rect width="100" height="100" fill="url(#gc)"/>
     <path d="M14 47 L86 24 L44 58 Z" fill="#fff"/>
     <path d="M44 58 L86 24 L58 72 Z" fill="#e3f1fb"/>
     <path d="M44 58 L48 76 L56 64 Z" fill="#fff"/>
     <path d="M44 58 L56 64 L48 76 Z" fill="#cfe4f3"/>`,
    grad("gc", "#3aa7ea", "#1c86d1")),
  enroute: svg(
    `<rect width="100" height="100" fill="url(#ge)"/>
     <path d="M0 74 C 30 60 60 66 100 56 L100 100 L0 100Z" fill="#8a8cf0" opacity=".55"/>
     <path d="M20 36 L82 20 L58 80 L52 52 Z" fill="#fff"/>
     <path d="M52 52 L82 20 L58 80 Z" fill="#d4d5f7"/>
     <text x="64" y="86" font-family="Arial" font-weight="700" font-style="italic" font-size="13" fill="#fff">PRO</text>`,
    grad("ge", "#6466d8", "#4446bd")),
  opt: svg(
    `<rect width="100" height="100" fill="#1e3a9e"/>
     <path d="M100 0 L100 100 L0 100Z" fill="#1a3290"/>
     <line x1="8" y1="96" x2="92" y2="10" stroke="#fff" stroke-width="1.2" opacity=".85"/>
     <g transform="translate(36 32) rotate(-45) scale(.9)" fill="#fff">
       <path d="M-2 -14 h4 l1 9 l12 7 v3 l-12 -3 l-1 8 l4 3 v2 l-6 -1.5 l-6 1.5 v-2 l4 -3 l-1 -8 l-12 3 v-3 l12 -7z"/></g>
     <text x="52" y="72" text-anchor="middle" font-family="Arial" font-weight="800" font-size="27" fill="#fff">OPT</text>`),
  briefing: svg(
    `<rect width="100" height="100" fill="url(#gb)"/>
     <rect x="24" y="16" width="52" height="68" rx="5" fill="#fff"/>
     <rect x="31" y="26" width="26" height="5" rx="2" fill="#1f2b4d"/>
     <g fill="#9aa6c3"><rect x="31" y="37" width="38" height="3" rx="1.5"/><rect x="31" y="44" width="34" height="3" rx="1.5"/><rect x="31" y="51" width="38" height="3" rx="1.5"/><rect x="31" y="58" width="28" height="3" rx="1.5"/></g>
     <text x="50" y="76" text-anchor="middle" font-family="Arial" font-weight="800" font-size="11" fill="#e2483d">OFP</text>`,
    grad("gb", "#2b3a63", "#121a33")),
  weather: svg(
    `<rect width="100" height="100" fill="url(#gw)"/>
     <circle cx="62" cy="38" r="15" fill="#ffd34d"/>
     <path d="M26 70 a14 14 0 0 1 4 -27 a18 18 0 0 1 34 4 a12 12 0 0 1 2 23 z" fill="#fff"/>
     <g stroke="#7fc2ff" stroke-width="4" stroke-linecap="round"><line x1="36" y1="80" x2="33" y2="88"/><line x1="50" y1="80" x2="47" y2="88"/><line x1="64" y1="80" x2="61" y2="88"/></g>`,
    grad("gw", "#3b8ff0", "#1758c9")),
  checklist: svg(
    `<rect width="100" height="100" fill="url(#gk)"/>
     <rect x="22" y="14" width="56" height="74" rx="6" fill="#fff"/>
     <rect x="38" y="9" width="24" height="10" rx="3" fill="#cfd5dc"/>
     <g stroke="#1fa64a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none">
       <path d="M30 34 l5 5 l9 -10"/><path d="M30 52 l5 5 l9 -10"/></g>
     <g fill="#c7ccd3"><rect x="50" y="32" width="20" height="4" rx="2"/><rect x="50" y="50" width="20" height="4" rx="2"/><rect x="31" y="68" width="39" height="4" rx="2"/></g>`,
    grad("gk", "#38c96b", "#1d9a49")),
  scratchpad: svg(
    `<rect width="100" height="100" fill="#fff"/>
     <rect width="100" height="22" fill="url(#gs)"/>
     <g stroke="#e7e2cf" stroke-width="2"><line x1="0" y1="40" x2="100" y2="40"/><line x1="0" y1="56" x2="100" y2="56"/><line x1="0" y1="72" x2="100" y2="72"/><line x1="0" y1="88" x2="100" y2="88"/></g>
     <path d="M24 64 c8 -14 14 6 22 -6 s10 8 18 -4" stroke="#2a63d6" stroke-width="3.5" fill="none" stroke-linecap="round"/>
     <path d="M70 72 L86 40 L92 43 L76 75 L69 78 Z" fill="#555"/><path d="M86 40 L88 36 L94 39 L92 43Z" fill="#f0a020"/>`,
    grad("gs", "#ffd85a", "#f7c41b")),
  library: svg(
    `<rect width="100" height="100" fill="#fff"/>
     <path d="M14 30 a5 5 0 0 1 5 -5 h20 l6 7 h36 a5 5 0 0 1 5 5 v40 a5 5 0 0 1 -5 5 h-62 a5 5 0 0 1 -5 -5z" fill="url(#gl)"/>
     <rect x="14" y="40" width="72" height="42" rx="5" fill="#3e9bf5"/>`,
    grad("gl", "#5cb1fb", "#2a86ea")),
  clock: svg(
    `<rect width="100" height="100" fill="#111"/>
     <circle cx="50" cy="50" r="38" fill="#fff"/>
     <g stroke="#111" stroke-width="2">${Array.from({ length: 12 }, (_, i) => `<line x1="50" y1="15" x2="50" y2="21" transform="rotate(${i * 30} 50 50)"/>`).join("")}</g>
     <text x="50" y="68" text-anchor="middle" font-family="Arial" font-weight="700" font-size="9" fill="#e2483d">UTC</text>
     <line x1="50" y1="50" x2="50" y2="28" stroke="#111" stroke-width="4" stroke-linecap="round" class="hand-m"/>
     <line x1="50" y1="50" x2="66" y2="50" stroke="#111" stroke-width="4" stroke-linecap="round" class="hand-h"/>
     <circle cx="50" cy="50" r="3" fill="#e2483d"/>`),
  appstore: svg(
    `<rect width="100" height="100" fill="url(#ga)"/>
     <g stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none">
       <path d="M40 26 L62 66"/><path d="M60 26 L38 66"/><path d="M28 66 H72"/><path d="M60 72 L66 80"/></g>`,
    grad("ga", "#1fc8ff", "#1270f0")),
  converter: svg(
    `<rect width="100" height="100" fill="url(#gv)"/>
     <rect x="20" y="16" width="60" height="68" rx="8" fill="#2c2c2e"/>
     <rect x="27" y="23" width="46" height="16" rx="3" fill="#9fe870"/>
     <text x="70" y="36" text-anchor="end" font-family="Arial" font-weight="700" font-size="11" fill="#1d3b12">kg⇄lb</text>
     ${[0, 1, 2].map(r => [0, 1, 2].map(c => `<rect x="${27 + c * 16}" y="${45 + r * 12}" width="13" height="9" rx="2" fill="${c === 2 ? "#ff9f0a" : "#636366"}"/>`).join("")).join("")}`,
    grad("gv", "#e5e5ea", "#aeaeb2")),
  logbook: svg(
    `<rect width="100" height="100" fill="url(#gL)"/>
     <rect x="24" y="14" width="54" height="72" rx="5" fill="#8b5a2b"/>
     <rect x="30" y="14" width="48" height="72" rx="4" fill="#a86b33"/>
     <rect x="40" y="30" width="30" height="14" rx="2" fill="#f3e3c3"/>
     <path d="M47 60 L62 54 L56 66 L54 60Z" fill="#f3e3c3"/>`,
    grad("gL", "#f4d29c", "#d99b4c")),
  settings: svg(
    `<rect width="100" height="100" fill="url(#gg)"/>
     <g transform="translate(50 50)">
       <circle r="30" fill="#4a4d52"/>
       ${Array.from({ length: 12 }, (_, i) => `<rect x="-4" y="-38" width="8" height="12" rx="2" fill="#4a4d52" transform="rotate(${i * 30})"/>`).join("")}
       <circle r="24" fill="#b9bcc1"/><circle r="19" fill="#4a4d52"/>
       ${Array.from({ length: 3 }, (_, i) => `<rect x="-2" y="-18" width="4" height="18" fill="#b9bcc1" transform="rotate(${i * 120})"/>`).join("")}
       <circle r="6" fill="#b9bcc1"/></g>`,
    grad("gg", "#c9ccd1", "#8d9096")),
};

/** Small stroke icons used inside apps (24x24). */
const i = (d, extra = "") => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
export const UI = {
  search: i(`<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 L21 21"/>`),
  sliders: i(`<path d="M5 4v16M12 4v16M19 4v16"/><rect x="3" y="7" width="4" height="3" fill="currentColor"/><rect x="10" y="14" width="4" height="3" fill="currentColor"/><rect x="17" y="9" width="4" height="3" fill="currentColor"/>`),
  plane: i(`<path d="M2 12 L22 4 L15 21 L12 14 Z" fill="currentColor" stroke="none"/>`),
  menuPlane: `<svg viewBox="0 0 60 40" width="60" height="40"><path d="M2 22 L58 4 L24 30 Z" fill="#fff"/><path d="M24 30 L58 4 L36 36Z" fill="#d6efea"/><path d="M24 30 L27 38 L33 33Z" fill="#fff"/></svg>`,
  route: i(`<circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="6" r="2.5"/><path d="M7 16 C 12 16, 8 8, 17 7"/>`),
  wx: i(`<path d="M7 18 a4.5 4.5 0 0 1 .5-9 a6 6 0 0 1 11.5 2 a3.5 3.5 0 0 1 0 7z"/><path d="M12 3 v2"/>`),
  gear: i(`<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>`),
  lock: i(`<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>`),
  unlock: i(`<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 7.6-1.6"/>`),
  pen: i(`<path d="M4 20 l4-1 L19 8 l-3-3 L5 16z"/><path d="M14 7 l3 3"/>`),
  ruler: i(`<path d="M3 17 L17 3 L21 7 L7 21Z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>`),
  layers: i(`<path d="M12 3 L22 8 L12 13 L2 8Z"/><path d="M2 12 L12 17 L22 12"/><path d="M2 16 L12 21 L22 16"/>`),
  terrain: i(`<path d="M2 19 L9 8 L13 14 L16 10 L22 19Z" fill="currentColor" stroke="none"/>`),
  headset: i(`<path d="M4 15 v-3 a8 8 0 0 1 16 0 v3"/><rect x="3" y="14" width="4" height="6" rx="1.5" fill="currentColor"/><rect x="17" y="14" width="4" height="6" rx="1.5" fill="currentColor"/>`),
  rings: i(`<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="10.5" stroke-dasharray="2 2"/>`),
  chevL: i(`<path d="M15 4 L7 12 L15 20"/>`),
  chevR: i(`<path d="M9 4 L17 12 L9 20"/>`),
  chevD: i(`<path d="M5 9 L12 16 L19 9"/>`),
  play: i(`<path d="M7 4 L20 12 L7 20Z" fill="currentColor"/>`),
  pause: i(`<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>`),
  north: i(`<path d="M12 2 L17 20 L12 16 L7 20Z" fill="currentColor"/>`),
  clip: i(`<path d="M20 11 L12 19 a5 5 0 0 1 -7 -7 L13 4 a3.5 3.5 0 0 1 5 5 L10 17 a2 2 0 0 1 -3 -3 L14 7"/>`),
  plus: i(`<path d="M12 5v14M5 12h14"/>`),
  x: i(`<path d="M6 6l12 12M18 6L6 18"/>`),
  sun: i(`<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`),
  moon: i(`<path d="M20 14.5 A8.5 8.5 0 1 1 9.5 4 a7 7 0 0 0 10.5 10.5z"/>`),
  rotate: i(`<path d="M20 11 a8 8 0 1 0 -2.3 5.7"/><path d="M20 4 v7 h-7"/>`),
  fit: i(`<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>`),
  refresh: i(`<path d="M20 12 a8 8 0 1 1 -2.3 -5.7"/><path d="M20 4v6h-6"/>`),
  doc: i(`<path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5"/>`),
  trash: i(`<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>`),
  share: i(`<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/>`),
  star: i(`<path d="M12 3 l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>`),
  info: i(`<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>`),
  eraser: i(`<path d="M8 20h12"/><path d="M4 16 L14 6 L20 12 L12 20 H8Z"/>`),
  undo: i(`<path d="M9 14 L4 9 L9 4"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>`),
};
