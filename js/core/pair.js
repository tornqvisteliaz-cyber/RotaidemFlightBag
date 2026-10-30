// Putting the EFB on a real iPad: QR pairing (scan from the iPad camera, like
// Waymark FlightBag Pro's second-screen pairing), carrying your SimBrief
// username across, and the "Add to Home Screen" install guide.
import { $, esc, html, loadScript, toast } from "./ui.js";
import { settings, setSetting, kv } from "./store.js";

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;
export const isStandalone = () => matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches || navigator.standalone === true;
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** Base URL an iPad on the same network can open. */
export async function shareBase() {
  const path = location.pathname.replace(/index\.html$/, "");
  if (!LOCAL.test(location.hostname)) return { url: location.origin + path, lan: !/^https:/.test(location.protocol) };
  try {
    const r = await fetch("lan.json", { cache: "no-store" });
    const j = await r.json();
    if (j.ips?.length) return { url: `http://${j.ips[0]}:${j.port || location.port}${path}`, alt: j.ips.slice(1).map(ip => `http://${ip}:${j.port || location.port}${path}`), lan: true };
  } catch { /* not started with serve.py */ }
  return { url: null };
}

/** Settings worth carrying to the iPad (never secrets). */
function pairParams() {
  const s = settings(), q = new URLSearchParams();
  if (s.simbriefUser) q.set("sb", s.simbriefUser);
  if (s.pilotName) q.set("pilot", s.pilotName);
  if (s.units && s.units !== "kg") q.set("units", s.units);
  if (s.wallpaper) q.set("wp", s.wallpaper);
  q.set("pair", "1");
  return q.toString();
}

/** Apply ?pair parameters on the receiving iPad, then clean the address bar. */
export function applyPairing() {
  const p = new URLSearchParams(location.search);
  if (!p.has("pair")) return false;
  if (p.get("sb")) setSetting("simbriefUser", p.get("sb"));
  if (p.get("pilot")) setSetting("pilotName", p.get("pilot"));
  if (p.get("units")) setSetting("units", p.get("units"));
  if (p.get("wp")) setSetting("wallpaper", +p.get("wp"));
  setSetting("frame", "off");
  kv.set("paired", Date.now());
  for (const k of ["pair", "sb", "pilot", "units", "wp", "connect"]) p.delete(k);
  history.replaceState(null, "", location.pathname + (p.toString() ? "?" + p : ""));
  return true;
}

/** The Connect iPad sheet with QR code and steps. */
export async function connectSheet() {
  document.querySelector(".pair-wrap")?.remove();
  const wrap = html(`<div class="pair-wrap"><div class="pair">
    <button class="pair-x" aria-label="Close">✕</button>
    <div class="pair-l"><div class="qr"><div class="spinner dark"></div></div><div class="url"></div></div>
    <div class="pair-r">
      <h2>Connect your iPad</h2>
      <p class="lead">Scan the code with the iPad camera to open Rotaidem Flight Bag on your iPad. Your SimBrief username comes along.</p>
      <ol>
        <li><b>Same Wi-Fi.</b> Put the iPad on the same network as this computer.</li>
        <li><b>Scan.</b> Open the Camera app and point it at the code, then tap the link.</li>
        <li><b>Install.</b> In Safari tap <span class="ios-share">⬆</span> Share → <b>Add to Home Screen</b>. It opens full-screen like an app.</li>
      </ol>
      <div class="note"></div>
    </div></div></div>`);
  (document.getElementById("overlay-root") || document.body).append(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener("click", e => { if (e.target === wrap || e.target.closest(".pair-x")) close(); });

  const base = await shareBase();
  const note = $(".note", wrap);
  if (!base.url) {
    $(".qr", wrap).innerHTML = `<div class="noqr">⌁</div>`;
    note.innerHTML = `<b>Not reachable from the iPad yet.</b> This page runs on <code>localhost</code>. Start the EFB with <code>Start EFB.bat</code> (or <code>python serve.py</code>) so the iPad can reach it over Wi-Fi, or publish the folder to GitHub Pages and open that address.`;
    return;
  }
  const full = `${base.url}?${pairParams()}`;
  try {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js");
    const q = window.qrcode(0, "M"); q.addData(full); q.make();
    $(".qr", wrap).innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  } catch { $(".qr", wrap).textContent = "QR unavailable offline"; }
  $(".url", wrap).innerHTML = `<code>${esc(base.url)}</code><button class="copy">Copy link</button>`;
  $(".copy", wrap).onclick = () => navigator.clipboard?.writeText(full).then(() => toast("Link copied"));
  note.innerHTML = base.lan
    ? `Local network mode${base.alt?.length ? ` · other addresses: ${base.alt.map(esc).join(", ")}` : ""}. Keep this computer awake and the server running while you fly. If the iPad can't connect, allow Python through the Windows firewall for private networks.${location.protocol === "http:" ? " Offline caching needs HTTPS (e.g. GitHub Pages)." : ""}`
    : `Hosted mode – the iPad loads the EFB from the internet and caches it for offline use.`;
}

/** iPadOS-style hint shown in Safari on an iPad that hasn't installed the EFB yet. */
export function installHint() {
  if (!isIOS() || isStandalone() || kv.get("installHintDismissed")) return;
  const b = html(`<div class="install-hint"><span class="ic"><img src="assets/apple-touch-icon.png" alt=""></span>
    <div><b>Install Flight Bag</b><small>Tap <span class="ios-share">⬆</span> then “Add to Home Screen” for full-screen use.</small></div><button>✕</button></div>`);
  document.getElementById("overlay-root").append(b);
  b.querySelector("button").onclick = () => { b.remove(); kv.set("installHintDismissed", true); };
  setTimeout(() => b.classList.add("show"), 800);
}
