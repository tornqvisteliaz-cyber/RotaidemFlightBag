"""Rotaidem Flight Bag – Windows desktop app.

Starts the EFB server and the simulator bridge (MSFS SimConnect / X-Plane 12),
then opens the EFB in its own app window (Microsoft Edge or Chrome in app mode,
no browser toolbars). Closing the window quits the app. While it runs, the iPad
can connect over Wi-Fi with "Connect iPad".

Built into "Rotaidem Flight Bag.exe" by tools/build_exe.py.
"""
import ctypes
import json
import os
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import serve  # noqa: E402
import sim_bridge  # noqa: E402

APP = "Rotaidem Flight Bag"
DATA = os.path.join(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "RotaidemFlightBag")
BROWSERS = [
    r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe",
    r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe",
    r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe",
    r"%ProgramFiles%\Google\Chrome\Application\chrome.exe",
    r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe",
    r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe",
]


def message(text, title=APP, flags=0x40):
    try:
        ctypes.windll.user32.MessageBoxW(None, text, title, flags)
    except Exception:
        print(text)


def find_browser():
    for p in BROWSERS:
        p = os.path.expandvars(p)
        if os.path.isfile(p):
            return p
    return None


def running_instance(port):
    """Port of an EFB that is already running (so a second launch just opens a window)."""
    for p in range(port, port + 10):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{p}/lan.json", timeout=0.4) as r:
                if "ips" in json.loads(r.read().decode()):
                    return p
        except Exception:
            continue
    return None


def open_window(url):
    exe = find_browser()
    if not exe:
        return None
    os.makedirs(DATA, exist_ok=True)
    args = [
        exe, f"--app={url}", f"--user-data-dir={os.path.join(DATA, 'window')}",
        "--window-size=1300,940", "--no-first-run", "--no-default-browser-check",
        "--disable-features=Translate,msEdgeSidebarV2,msUndersideButton", "--disable-sync",
    ]
    return subprocess.Popen(args, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))


def main():
    existing = running_instance(serve.DEFAULT_PORT)
    if existing:
        url = f"http://localhost:{existing}/"
        if not open_window(url):
            webbrowser.open(url)
        return

    sim_bridge.start()
    try:
        httpd, port = serve.create_server(serve.DEFAULT_PORT)
    except OSError as e:
        message(f"Could not start the EFB server:\n{e}", flags=0x10)
        return
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    url = f"http://localhost:{port}/"

    started = time.time()
    proc = open_window(url)
    if proc:
        proc.wait()
        if time.time() - started > 8:
            httpd.shutdown()
            return
    else:
        webbrowser.open(url)
    # The window could not be tracked (no Edge/Chrome, or it handed off to another
    # process): keep serving until the user confirms they are done.
    message(f"{APP} is running.\n\nThis computer: {url}\niPad: use Connect iPad in the EFB.\n\nClick OK to quit.")
    httpd.shutdown()


if __name__ == "__main__":
    main()
