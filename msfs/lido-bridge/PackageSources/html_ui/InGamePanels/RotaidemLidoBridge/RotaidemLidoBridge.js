// Rotaidem Flight Bag – Lido bridge (MSFS 2024 toolbar panel).
//
// The Lido charts that ship with MSFS 2024 are only reachable from inside the sim,
// through the JS_LISTENER_CHARTS view listener (the same channel the SDK's
// ChartsClient uses). This panel polls the Flight Bag server on this PC for chart
// jobs, fetches them from the sim and posts the results back:
//   GET  /lido/job      -> { id, kind: "index" | "pages" | "image", icao | guid | url }   (long poll)
//   POST /lido/result   <- { id, ok, data | error }
// Charts stay on this PC: the server keeps them in memory only.
(function () {
	const PORTS = [8642, 8643, 8644, 8645, 8646, 8647, 8648, 8649, 8650, 8651];
	const state = { server: null, listener: null, ready: false, served: 0, lastError: "", busy: false };
	const pending = new Map();
	let seq = null;

	// ---- tiny HTTP helpers (XHR works in Coherent) ----------------------------
	function http(method, url, body, timeout) {
		return new Promise((resolve, reject) => {
			const x = new XMLHttpRequest();
			x.open(method, url, true);
			x.timeout = timeout || 5000;
			if (body != null) x.setRequestHeader("Content-Type", "application/json");
			x.onload = () => resolve({ status: x.status, text: x.responseText });
			x.onerror = () => reject(new Error("network"));
			x.ontimeout = () => reject(new Error("timeout"));
			x.send(body != null ? JSON.stringify(body) : null);
		});
	}

	async function findServer() {
		for (const p of PORTS) {
			try {
				const r = await http("GET", `http://127.0.0.1:${p}/lan.json`, null, 800);
				if (r.status === 200 && r.text.indexOf("ips") >= 0) return `http://127.0.0.1:${p}`;
			} catch (e) { /* try next */ }
		}
		return null;
	}

	// ---- sim chart channel ----------------------------------------------------
	function setupListener() {
		return new Promise(resolve => {
			const l = RegisterViewListener("JS_LISTENER_CHARTS", () => { state.ready = true; resolve(); });
			l.on("SendChartIndex", (id, data) => settle(id, null, data));
			l.on("SendChartIndexError", (id, code) => settle(id, code));
			l.on("SendChartPages", (id, data) => settle(id, null, data));
			l.on("SendChartPagesError", (id, code) => settle(id, code));
			l.on("SendLiveViewName", (viewId, name, url) => settle("view:" + viewId, null, { name, url }));
			l.on("SendLiveViewError", (viewId, code, url) => settle("view:" + viewId, code));
			state.listener = l;
		});
	}
	function setupSequence() {
		return new Promise(resolve => RegisterViewListener("JS_LISTENER_ATOMIC", () => { seq = () => window.AtomicSequence.getNext(); resolve(); }));
	}
	function settle(id, err, data) {
		const p = pending.get(id);
		if (!p) return;
		pending.delete(id);
		clearTimeout(p.t);
		err != null ? p.reject(new Error("sim error " + err)) : p.resolve(data);
	}
	function waitFor(id, ms) {
		return new Promise((resolve, reject) => {
			const t = setTimeout(() => { pending.delete(id); reject(new Error("sim timeout")); }, ms);
			pending.set(id, { resolve, reject, t });
		});
	}
	const icaoValue = ident => ({ __Type: "JS_ICAO", type: "A", region: "", airport: "", ident: ident.toUpperCase() });

	async function getIndex(icao, provider) {
		const id = seq ? seq() : Math.floor(Math.random() * 1e9);
		const w = waitFor(id, 15000);
		state.listener.call("GET_CHARTS_INDEX", id, icaoValue(icao), provider || "LIDO");
		return w;
	}
	async function getPages(guid) {
		const id = seq ? seq() : Math.floor(Math.random() * 1e9);
		const w = waitFor(id, 15000);
		state.listener.call("GET_CHART_PAGES", id, guid);
		return w;
	}

	// Render a chart page through a ChartView (the sim streams it as a LiveView
	// image) and export it as a PNG data URL.
	async function getImage(pageUrl) {
		const viewId = await state.listener.call("CREATE_CHART_VIEW");
		try {
			const w = waitFor("view:" + viewId, 20000);
			state.listener.call("SET_CHART_VIEW_URL", viewId, pageUrl);
			const live = await w;
			const img = await new Promise((resolve, reject) => {
				const i = new Image();
				i.onload = () => resolve(i);
				i.onerror = () => reject(new Error("live view did not load"));
				i.src = live.name;
			});
			const c = document.createElement("canvas");
			c.width = img.naturalWidth || img.width;
			c.height = img.naturalHeight || img.height;
			c.getContext("2d").drawImage(img, 0, 0);
			let dataUrl = "";
			try { dataUrl = c.toDataURL("image/png"); } catch (e) { dataUrl = ""; }
			if (!dataUrl || dataUrl.length < 100) throw new Error("image export not supported (" + live.name + ")");
			return { dataUrl, width: c.width, height: c.height };
		} finally {
			try { state.listener.call("DESTROY_CHART_VIEW", viewId); } catch (e) { /* ignore */ }
		}
	}

	// ---- job loop ------------------------------------------------------------------
	async function loop() {
		for (;;) {
			if (!state.server) {
				state.server = await findServer();
				render();
				if (!state.server) { await sleep(5000); continue; }
			}
			try {
				const r = await http("GET", `${state.server}/lido/job`, null, 30000);
				if (r.status === 204) continue;
				if (r.status !== 200) throw new Error("server " + r.status);
				const job = JSON.parse(r.text);
				state.busy = true; render();
				let result;
				try {
					const data = job.kind === "index" ? await getIndex(job.icao, job.provider)
						: job.kind === "pages" ? await getPages(job.guid)
						: await getImage(job.url);
					result = { id: job.id, ok: true, data };
					state.served++;
				} catch (e) {
					result = { id: job.id, ok: false, error: String(e.message || e) };
					state.lastError = result.error;
				}
				await http("POST", `${state.server}/lido/result`, result, 30000);
			} catch (e) {
				state.lastError = String(e.message || e);
				state.server = null;
				await sleep(3000);
			} finally {
				state.busy = false; render();
			}
		}
	}
	const sleep = ms => new Promise(r => setTimeout(r, ms));

	// ---- panel UI ------------------------------------------------------------------
	function render() {
		const el = id => document.getElementById(id);
		if (!el("lb-server")) return;
		el("lb-server").textContent = state.server ? state.server.replace("http://", "") : "searching…";
		el("lb-server").className = state.server ? "ok" : "warn";
		el("lb-sim").textContent = state.ready ? "ready" : "starting…";
		el("lb-sim").className = state.ready ? "ok" : "warn";
		el("lb-served").textContent = String(state.served) + (state.busy ? " · working" : "");
		el("lb-error").textContent = state.lastError || "";
	}

	async function test() {
		const out = document.getElementById("lb-out");
		const icao = (document.getElementById("lb-icao").value || "KSEA").trim();
		out.textContent = "Loading " + icao + "…";
		try {
			const idx = await getIndex(icao, "LIDO");
			const cats = (idx.charts || []).map(c => `${c.name}: ${(c.charts || []).length}`);
			let txt = `${icao}: ${cats.join(", ") || "no charts"}`;
			const first = idx.charts && idx.charts[0] && idx.charts[0].charts[0];
			if (first) {
				const pages = await getPages(first.guid);
				const p = pages.pages && pages.pages[0];
				txt += `\n${first.name} – ${pages.pages.length} page(s)`;
				if (p) {
					txt += `\nurls: ${(p.urls || []).map(u => u.name).join(", ")}`;
					try { const im = await getImage(p.urls[0].url); txt += `\nimage ${im.width}×${im.height} OK`; }
					catch (e) { txt += `\nimage: ${e.message}`; }
				}
			}
			out.textContent = txt;
		} catch (e) {
			out.textContent = "Error: " + (e.message || e);
		}
	}

	async function init() {
		document.getElementById("lb-test").addEventListener("click", test);
		render();
		await Promise.all([setupListener(), setupSequence()]);
		render();
		setInterval(render, 1000);
		loop();
	}

	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
	else init();
})();
