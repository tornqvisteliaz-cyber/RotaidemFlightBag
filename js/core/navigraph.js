// Navigraph Charts (Jeppesen charts for flight simulation) through the official
// Navigraph JS SDK. Requires a client id/secret from the Navigraph developer
// programme (https://navigraph.com/partners) entered in Settings, and a
// Navigraph account with a Charts subscription to sign in.
import { settings } from "./store.js";
import { emit } from "./ui.js";

const CDN = "https://cdn.jsdelivr.net/npm";
let sdk = null, sdkKey = "";

export const isConfigured = () => !!(settings().navigraphClientId && settings().navigraphClientSecret);

export async function navigraph() {
  if (!isConfigured()) return null;
  const key = settings().navigraphClientId;
  if (sdk && sdkKey === key) return sdk;
  if (sdk && sdkKey !== key) throw new Error("Navigraph client changed – reload the app to apply.");
  const [app, auth, charts] = await Promise.all([
    import(`${CDN}/@navigraph/app@1.4.0/+esm`),
    import(`${CDN}/@navigraph/auth@2.6.1/+esm`),
    import(`${CDN}/@navigraph/charts@2.2.1/+esm`),
  ]);
  app.initializeApp({
    clientId: settings().navigraphClientId,
    clientSecret: settings().navigraphClientSecret,
    scopes: [app.Scope.CHARTS],
  });
  const a = auth.getAuth({ keys: { accessToken: "rfb.ng.access", refreshToken: "rfb.ng.refresh" } });
  sdk = { auth: a, charts: charts.getChartsAPI(), CancelToken: auth.CancelToken };
  sdkKey = key;
  a.onAuthStateChanged(u => emit("navigraph", u), false);
  return sdk;
}

export async function currentUser() {
  const n = await navigraph().catch(() => null);
  if (!n) return null;
  try { return await n.auth.getUser(true); } catch { return n.auth.getUser(); }
}

/** Device-flow sign-in. onCode({verification_uri, verification_uri_complete, user_code}) */
export async function signIn(onCode) {
  const n = await navigraph();
  if (!n) throw new Error("Add your Navigraph client id and secret in Settings first.");
  const src = n.CancelToken.source();
  const p = n.auth.signInWithDeviceFlow(onCode, src.token);
  return { promise: p, cancel: () => src.cancel("cancelled") };
}

export async function signOut() {
  const n = await navigraph();
  await n?.auth.signOut();
}

const CAT = { APT: "TAXI", REF: "GEN", DEP: "SID", ARR: "STAR", APP: "APPR" };

/** Chart index for an airport, normalised to the EFB's categories. */
export async function chartIndex(icao) {
  const n = await navigraph();
  if (!n || !n.auth.getUser()) return null;
  const list = await n.charts.getChartsIndex({ icao });
  return (list || []).map(c => ({
    source: "navigraph", id: c.id, icao, cat: CAT[c.category] || "GEN",
    index: c.index_number, name: c.name, procs: c.procedures || [], runways: c.runways || [],
    w: c.width, h: c.height, raw: c,
  }));
}

const imgCache = new Map();
export async function chartImage(chart, theme = "light") {
  const k = chart.id + theme;
  if (imgCache.has(k)) return imgCache.get(k);
  const n = await navigraph();
  const blob = await n.charts.getChartImage({ chart: chart.raw, theme });
  if (!blob) throw new Error("Chart image unavailable");
  const url = URL.createObjectURL(blob);
  imgCache.set(k, url);
  return url;
}
