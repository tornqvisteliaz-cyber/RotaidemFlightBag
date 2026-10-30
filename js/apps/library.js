// Library – Files-style document library (company docs + imported aerodrome charts).
import { $, $$, html, esc, on, listen, toast, panZoom, loadScript } from "../core/ui.js";
import { files } from "../core/store.js";
import { UI } from "../core/icons.js";

export default { mount: (root, ctx) => new Library(root, ctx) };

const DOCS = ["Additional Chart", "B737 Checklist", "B737 Manual", "Company Manual"];
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";

class Library {
  constructor(root, ctx) {
    this.root = root; this.ctx = ctx;
    this.folder = "docs/" + DOCS[0];
    this.view = "grid";
    root.innerHTML = `<div class="lib"><aside><h1>Library</h1><div class="srch"><span>⌕</span><input placeholder="Search"></div><nav></nav></aside>
      <main><header><button class="back hidden" data-a="close">‹ Back</button><h2></h2><div class="tb"><button data-a="view" title="View">▦</button><label class="add" title="Import PDF">${UI.plus}<input type="file" accept="application/pdf,image/*" multiple hidden></label></div></header><div class="content"></div></main></div>`;
    on(root, "click", "[data-f]", (e, b) => { this.folder = b.dataset.f; this.closeDoc(); this.render(); });
    on(root, "click", "[data-open]", (e, b) => this.openDoc(b.dataset.open));
    on(root, "click", "[data-del]", async (e, b) => { e.stopPropagation(); await files.del(b.dataset.del); toast("Deleted"); this.render(); });
    on(root, "click", "[data-a]", (e, b) => { if (b.dataset.a === "view") { this.view = this.view === "grid" ? "list" : "grid"; this.render(); } if (b.dataset.a === "close") this.closeDoc(); });
    $("input[type=file]", root).addEventListener("change", async e => {
      if (this.folder.startsWith("charts/") && this.folder.split("/").length < 3) return toast("Open an airport folder first");
      for (const f of e.target.files) await files.put(this.folder, f, { name: f.name.replace(/\.[a-z]+$/i, "") });
      toast(`${e.target.files.length} file(s) imported`); e.target.value = ""; this.render();
    });
    $(".srch input", root).addEventListener("input", e => { this.q = e.target.value.toLowerCase(); this.render(); });
    this.unsub = [listen("files", () => this.render())];
    this.render();
  }
  destroy() { this.unsub.forEach(u => u()); }

  async render() {
    const charts = await files.listPrefix("charts/");
    const aps = [...new Set(charts.map(c => c.folder.split("/")[1]))].sort();
    const counts = await Promise.all(DOCS.map(d => files.count("docs/" + d)));
    $("nav", this.root).innerHTML = `<h5>Company Docs General</h5>${DOCS.map((d, i) => `<button data-f="docs/${esc(d)}" class="${this.folder === "docs/" + d ? "on" : ""}"><span class="fi">${UI.doc}</span>${esc(d)}<em>${counts[i]}</em></button>`).join("")}
      <h5>AD Charts</h5>${aps.map(a => `<button data-f="charts/${a}" class="${this.folder === "charts/" + a ? "on" : ""}"><span class="fi">✈</span>${a}<em>${charts.filter(c => c.folder.split("/")[1] === a).length}</em></button>`).join("") || `<p class="hint">Import charts from the Charts app (MENU › Import).</p>`}`;
    if (this.docOpen) return;
    $("main h2", this.root).textContent = this.folder.split("/").slice(1).join(" › ");
    const list = (this.folder.startsWith("charts/") ? charts.filter(c => c.folder.startsWith(this.folder + "/")) : await files.list(this.folder))
      .filter(r => !this.q || r.name.toLowerCase().includes(this.q));
    const c = $(".content", this.root);
    c.className = `content ${this.view}`;
    c.innerHTML = list.length ? list.map(r => `<button class="file" data-open="${r.id}"><span class="thumb">${r.type.includes("pdf") ? "PDF" : "IMG"}</span><b>${esc(r.name)}</b><small>${(r.size / 1e6).toFixed(1)} MB · ${new Date(r.added).toLocaleDateString()}</small><span class="del" data-del="${r.id}">${UI.trash}</span></button>`).join("")
      : `<div class="empty"><div class="big">${UI.doc}</div><b>No documents</b><p>Tap + to import PDF manuals or checklists into “${esc(this.folder.split("/").pop())}”. Files stay on this device.</p></div>`;
  }

  async openDoc(id) {
    const r = await files.get(id);
    if (!r) return;
    this.docOpen = true;
    $(".back", this.root).classList.remove("hidden");
    $("main h2", this.root).textContent = r.name;
    const c = $(".content", this.root);
    c.className = "content viewer";
    c.innerHTML = `<div class="pages"><div class="spinner dark"></div></div>`;
    const pages = $(".pages", c);
    const pz = panZoom(c, pages, { min: 0.3, max: 6 });
    if (r.type.startsWith("image/")) {
      pages.innerHTML = `<img src="${URL.createObjectURL(r.blob)}">`;
      $("img", pages).onload = e => pz.fit(e.target.naturalWidth, e.target.naturalHeight, "width");
      return;
    }
    await loadScript(`${PDFJS}/pdf.min.js`);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.js`;
    const doc = await window.pdfjsLib.getDocument({ data: await r.blob.arrayBuffer() }).promise;
    pages.innerHTML = "";
    let w = 0, h = 0;
    for (let i = 1; i <= Math.min(doc.numPages, 200); i++) {
      if (!this.docOpen) return;
      const pg = await doc.getPage(i), vp = pg.getViewport({ scale: 1.6 });
      const cv = document.createElement("canvas");
      cv.width = vp.width; cv.height = vp.height; cv.style.width = vp.width / 1.6 + "px"; cv.style.height = vp.height / 1.6 + "px";
      pages.append(cv);
      await pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
      w = Math.max(w, vp.width / 1.6); h += vp.height / 1.6 + 16;
      if (i === 1) pz.fit(w, vp.height / 1.6, "width");
    }
  }
  closeDoc() {
    this.docOpen = false;
    $(".back", this.root).classList.add("hidden");
    this.render();
  }
}
