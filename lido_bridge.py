"""Lido charts from MSFS 2024, relayed through the in-sim toolbar panel.

The Flight Bag asks the server for an index / pages / image; the server queues a
job; the "Flight Bag Lido" toolbar panel inside MSFS 2024 long-polls /lido/job,
fetches the data from the sim (JS_LISTENER_CHARTS) and posts it to /lido/result.

Everything is kept in memory only (nothing is written to disk) – the charts are
licensed for use with your copy of the simulator.
"""
import base64
import itertools
import threading
import time
from collections import OrderedDict

_lock = threading.Condition()
_jobs = []            # queued jobs for the panel
_waiting = {}         # job id -> {"event", "result"}
_ids = itertools.count(1)
_last_seen = 0.0
_cache = OrderedDict()  # key -> (time, result)
CACHE_MAX = 120
CACHE_TTL = 30 * 60


def status():
    age = time.time() - _last_seen
    return {"bridge": age < 40, "lastSeen": int(age) if _last_seen else None}


def _cache_get(key):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_TTL:
        _cache.move_to_end(key)
        return hit[1]
    return None


def _cache_put(key, value):
    _cache[key] = (time.time(), value)
    while len(_cache) > CACHE_MAX:
        _cache.popitem(last=False)


def request(job, timeout=40):
    """Called by the Flight Bag side. Returns {"ok", "data" | "error"}."""
    key = job["kind"] + ":" + (job.get("icao") or job.get("guid") or job.get("url") or "")
    cached = _cache_get(key)
    if cached:
        return cached
    if not status()["bridge"]:
        return {"ok": False, "error": "bridge-offline"}
    ev = threading.Event()
    with _lock:
        jid = next(_ids)
        _waiting[jid] = {"event": ev, "result": None}
        _jobs.append({**job, "id": jid})
        _lock.notify_all()
    if not ev.wait(timeout):
        with _lock:
            _waiting.pop(jid, None)
            _jobs[:] = [j for j in _jobs if j["id"] != jid]
        return {"ok": False, "error": "timeout"}
    res = _waiting.pop(jid)["result"]
    if res.get("ok"):
        _cache_put(key, res)
    return res


def next_job(timeout=25):
    """Called by the in-sim panel (long poll). Returns a job dict or None."""
    global _last_seen
    _last_seen = time.time()
    end = time.time() + timeout
    with _lock:
        while not _jobs:
            left = end - time.time()
            if left <= 0:
                _last_seen = time.time()
                return None
            _lock.wait(min(left, 5))
            _last_seen = time.time()
        return _jobs.pop(0)


def deliver(result):
    """Called by the in-sim panel with a job result."""
    global _last_seen
    _last_seen = time.time()
    w = _waiting.get(result.get("id"))
    if w:
        w["result"] = result
        w["event"].set()


def image_bytes(result):
    """PNG bytes from an image job result, or None."""
    d = (result.get("data") or {}).get("dataUrl", "")
    if not d.startswith("data:image"):
        return None
    return base64.b64decode(d.split(",", 1)[1])
