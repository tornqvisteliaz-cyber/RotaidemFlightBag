"""Live aircraft data for the EFB.

Reads the aircraft position from Microsoft Flight Simulator (SimConnect) or
X-Plane 12 (built-in web API on port 8086) and keeps the latest state in
memory. serve.py exposes it at /sim/state (JSON) and /sim/stream (Server-Sent
Events), so the iPad receives it over Wi-Fi from the same server that serves
the EFB.

MSFS needs the Python SimConnect package once:  pip install SimConnect
X-Plane 12.1+ needs nothing extra (Settings > Network > "Enable web server API"
is on by default).
"""
import base64
import json
import math
import threading
import time
import urllib.request

_state = {"connected": False, "source": None, "status": "Starting…"}
_lock = threading.Lock()


def state():
    with _lock:
        return dict(_state)


def _set(**kw):
    with _lock:
        _state.update(kw)
        _state["t"] = time.time()


# ---------------------------------------------------------------- MSFS
def _msfs_loop():
    try:
        from SimConnect import SimConnect, AircraftRequests  # type: ignore
    except Exception:
        _set(msfs="SimConnect package not installed (pip install SimConnect)")
        return
    while True:
        try:
            sm = SimConnect()
            # Python-SimConnect returns a disconnected object (ok=False) when MSFS isn't running.
            if not getattr(sm, "ok", True):
                raise ConnectionError("MSFS not running")
        except Exception:
            _set(msfs="Waiting for MSFS…")
            time.sleep(5)
            continue
        _set(msfs="Connected")
        aq = AircraftRequests(sm, _time=200)
        rad = lambda v: (math.degrees(v) % 360) if v is not None else None
        txt = lambda v: v.decode(errors="ignore").strip() if isinstance(v, bytes) else v
        ident, ident_at = {}, 0
        try:
            while True:
                # Aircraft identity changes rarely: read it every 5 s (used to auto-detect the type).
                if time.time() - ident_at > 5:
                    ident_at = time.time()
                    ident = {k: txt(aq.get(v)) for k, v in (("title", "TITLE"), ("acModel", "ATC_MODEL"), ("acType", "ATC_TYPE"), ("callsign", "ATC_ID"))}
                lat = aq.get("PLANE_LATITUDE")
                lon = aq.get("PLANE_LONGITUDE")
                if lat is None or lon is None:
                    raise RuntimeError("no data")
                vs = aq.get("VERTICAL_SPEED")
                _set(
                    connected=True, source="MSFS", status="Connected to MSFS", ts=time.time(),
                    lat=lat, lon=lon,
                    alt=aq.get("PLANE_ALTITUDE"), agl=aq.get("PLANE_ALT_ABOVE_GROUND"),
                    hdg=rad(aq.get("PLANE_HEADING_DEGREES_TRUE")),
                    trk=rad(aq.get("GPS_GROUND_TRUE_TRACK")),
                    gs=aq.get("GROUND_VELOCITY"), ias=aq.get("AIRSPEED_INDICATED"),
                    vs=vs * 60 if vs is not None else None,
                    onGround=bool(aq.get("SIM_ON_GROUND")),
                    **ident,
                )
                time.sleep(0.25)
        except Exception:
            _set(connected=False, source=None, msfs="MSFS disconnected – retrying…")
            try:
                sm.exit()
            except Exception:
                pass
            time.sleep(3)


# ---------------------------------------------------------------- X-Plane 12
XP = "http://127.0.0.1:8086/api/v2"
XP_REFS = {
    "lat": "sim/flightmodel/position/latitude",
    "lon": "sim/flightmodel/position/longitude",
    "elev_m": "sim/flightmodel/position/elevation",
    "agl_m": "sim/flightmodel/position/y_agl",
    "hdg": "sim/flightmodel/position/psi",
    "trk": "sim/flightmodel/position/hpath",
    "gs_ms": "sim/flightmodel/position/groundspeed",
    "ias": "sim/flightmodel/position/indicated_airspeed",
    "vs": "sim/flightmodel/position/vh_ind_fpm",
    "gnd": "sim/flightmodel/failures/onground_any",
}
XP_IDENT = {"acIcao": "sim/aircraft/view/acf_ICAO", "callsign": "sim/aircraft/view/acf_tailnum", "title": "sim/aircraft/view/acf_ui_name"}


def _xp_text(v):
    """Byte-array datarefs arrive base64-encoded; strip the C string padding."""
    if isinstance(v, str):
        try:
            return base64.b64decode(v).split(b"\0")[0].decode(errors="ignore").strip()
        except Exception:
            return v
    return None


def _get(url, timeout=1.5):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read().decode())


def _xplane_loop():
    while True:
        try:
            ids = {}
            for k, name in XP_REFS.items():
                d = _get(f"{XP}/datarefs?filter[name]={name}")["data"]
                if d:
                    ids[k] = d[0]["id"]
            ident_ids = {}
            for k, name in XP_IDENT.items():
                d = _get(f"{XP}/datarefs?filter[name]={name}")["data"]
                if d:
                    ident_ids[k] = d[0]["id"]
            ident, ident_at = {}, 0
            _set(xplane="Connected")
            while True:
                v = {k: _get(f"{XP}/datarefs/{i}/value")["data"] for k, i in ids.items()}
                if time.time() - ident_at > 5:
                    ident_at = time.time()
                    ident = {k: _xp_text(_get(f"{XP}/datarefs/{i}/value")["data"]) for k, i in ident_ids.items()}
                if state().get("source") == "MSFS":
                    time.sleep(2)
                    continue
                _set(
                    connected=True, source="X-Plane", status="Connected to X-Plane", ts=time.time(),
                    lat=v.get("lat"), lon=v.get("lon"),
                    alt=v["elev_m"] / 0.3048 if v.get("elev_m") is not None else None,
                    agl=v["agl_m"] / 0.3048 if v.get("agl_m") is not None else None,
                    hdg=v.get("hdg"), trk=v.get("trk"),
                    gs=v["gs_ms"] * 1.94384 if v.get("gs_ms") is not None else None,
                    ias=v.get("ias"), vs=v.get("vs"), onGround=bool(v.get("gnd")),
                    **ident,
                )
                time.sleep(0.25)
        except Exception:
            if state().get("source") == "X-Plane":
                _set(connected=False, source=None)
            _set(xplane="Waiting for X-Plane 12…")
            time.sleep(5)


def _status_loop():
    while True:
        s = state()
        if not s.get("connected"):
            _set(status=f"MSFS: {s.get('msfs', '…')} · X-Plane: {s.get('xplane', '…')}")
        elif time.time() - s.get("ts", 0) > 5:
            _set(connected=False, source=None, status="Simulator stopped sending data")
        time.sleep(2)


def start():
    for fn in (_msfs_loop, _xplane_loop, _status_loop):
        threading.Thread(target=fn, daemon=True).start()
