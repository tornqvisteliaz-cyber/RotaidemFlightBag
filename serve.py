#!/usr/bin/env python3
"""Rotaidem Flight Bag – local server.

Runs the EFB on this computer and makes it reachable from an iPad on the same
Wi-Fi. Open the page it prints, tap "Connect iPad" and scan the QR code with
the iPad camera (the same way Waymark FlightBag Pro pairs a second screen).

    python serve.py            # port 8642
    python serve.py 9000       # custom port
    python serve.py --no-browser

Serves the EFB files, /lan.json (which local address the iPad should use) and
live aircraft data from MSFS / X-Plane at /sim/state and /sim/stream (see
sim_bridge.py). PHP endpoints (api/*.php) are not available with this
server; host the folder on a PHP server for in-app SimBrief generation.
"""
import http.server
import json
import os
import socket
import socketserver
import sys
import time
import webbrowser

import sim_bridge

DEFAULT_PORT = 8642
# When packaged as an .exe (PyInstaller) the web files are unpacked to sys._MEIPASS.
ROOT = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))


def lan_ips():
    ips = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))  # no packet is sent; picks the outbound interface
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    private = [ip for ip in ips if ip.startswith(("192.168.", "10.")) or ip.startswith("172.") and 16 <= int(ip.split(".")[1]) <= 31]
    return sorted(private) or sorted(ip for ip in ips if not ip.startswith("127."))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        if self.path.split("?")[0] == "/lan.json":
            body = json.dumps({"ips": lan_ips(), "port": self.server.server_port}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        path = self.path.split("?")[0]
        if path == "/sim/state":
            body = json.dumps(sim_bridge.state()).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/sim/stream":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            try:
                while True:
                    self.wfile.write(b"data: " + json.dumps(sim_bridge.state()).encode() + b"\n\n")
                    self.wfile.flush()
                    time.sleep(0.25)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
                return
        # Never serve server-side secrets.
        if self.path.split("?")[0].startswith("/api/config"):
            self.send_error(404)
            return
        super().do_GET()

    def log_message(self, fmt, *args):
        pass


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    # On Windows SO_REUSEADDR lets two servers share a port; keep ports exclusive there.
    allow_reuse_address = os.name != "nt"


def create_server(port=DEFAULT_PORT, tries=10):
    """Bind on all interfaces (so the iPad can connect), trying the next ports if busy."""
    last = None
    for p in range(port, port + tries):
        try:
            return Server(("0.0.0.0", p), Handler), p
        except OSError as e:
            last = e
    raise last


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    sim_bridge.start()
    httpd, PORT = create_server(int(args[0]) if args else DEFAULT_PORT)
    with httpd:
        ips = lan_ips()
        print("\n  Rotaidem Flight Bag is running\n")
        print(f"  On this computer:  http://localhost:{PORT}/?connect")
        for ip in ips:
            print(f"  On your iPad:      http://{ip}:{PORT}/")
        print("\n  Open the first link, tap 'Connect iPad' and scan the QR code.")
        print("  Live aircraft: MSFS via SimConnect (pip install SimConnect) or X-Plane 12 web API.")
        print("  Allow Python through the firewall on private networks if asked.")
        print("  Press Ctrl+C to stop.\n")
        if "--no-browser" not in sys.argv:
            try:
                webbrowser.open(f"http://localhost:{PORT}/?connect")
            except Exception:
                pass
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  Stopped.")
