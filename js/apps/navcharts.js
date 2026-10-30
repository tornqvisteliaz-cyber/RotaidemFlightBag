// Navigraph Charts – Navigraph's own chart web app inside the Flight Bag. You sign
// in with your normal Navigraph account; no developer client is needed.
import { $, on, toast } from "../core/ui.js";
import { I } from "../core/sf.js";
import { getFlight } from "../core/flight.js";

const HOME = "https://charts.navigraph.com/";

export default { mount: root => new NavCharts(root) };

class NavCharts {
  constructor(root) {
    this.root = root;
    root.innerHTML = `<div class="ngc">
      <div class="ngc-bar">
        <div class="t"><b>Navigraph Charts</b><span>Sign in with your Navigraph account</span></div>
        <div class="apts"></div>
        <button data-a="reload" title="Reload">${I.refresh}</button>
        <button data-a="open" title="Open in a new window">${I.arrowUpRight}</button>
      </div>
      <iframe src="${HOME}" allow="clipboard-write; fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe>
      <div class="ngc-hint">If sign-in doesn't stick here, your browser blocks Navigraph's login inside other apps. Tap <b>Open in a new window</b> ${I.arrowUpRight} – on iPad, add charts.navigraph.com to the Home Screen as well.</div>
    </div>`;
    this.frame = $("iframe", root);
    on(root, "click", "[data-a]", (e, b) => {
      if (b.dataset.a === "reload") { this.frame.src = this.frame.src; toast("Reloading Navigraph Charts"); }
      if (b.dataset.a === "open") window.open(HOME, "_blank", "noopener");
    });
    on(root, "click", "[data-icao]", (e, b) => { navigator.clipboard?.writeText(b.dataset.icao).catch(() => {}); toast(`${b.dataset.icao} copied – paste it into Navigraph's search`); });
    this.show();
  }
  show() {
    const f = getFlight();
    const aps = f ? [f.orig, f.dest, ...(f.altns || [])].filter(Boolean) : [];
    $(".apts", this.root).innerHTML = aps.map(a => `<button data-icao="${a.icao}">${a.icao}</button>`).join("");
  }
}
