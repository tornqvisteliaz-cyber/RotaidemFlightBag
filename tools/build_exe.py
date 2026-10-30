"""Build "Rotaidem Flight Bag.exe" (Windows) with PyInstaller.

    build-exe.bat            # recommended: sets up a build venv and runs this
    python tools/build_exe.py

Needs: pip install pyinstaller SimConnect pillow
The finished app is written to dist/Rotaidem Flight Bag.exe.
"""
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

# Windows icon from the app icon PNG.
ico = os.path.join("assets", "app.ico")
try:
    from PIL import Image
    Image.open(os.path.join("assets", "icon-512.png")).save(ico, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
except Exception as e:  # build still works without a custom icon
    print("icon:", e)
    ico = None

sep = ";" if os.name == "nt" else ":"
data = ["index.html", "manifest.webmanifest", "sw.js", "css", "js", "data", "assets"]
args = [
    sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onefile", "--windowed",
    "--name", "Rotaidem Flight Bag", "--paths", ROOT,
    "--hidden-import", "serve", "--hidden-import", "sim_bridge",
]
try:
    import SimConnect  # noqa: F401
    args += ["--collect-all", "SimConnect"]
except ImportError:
    print("SimConnect package not installed – the app will support X-Plane only (pip install SimConnect).")
if ico:
    args += ["--icon", ico]
for d in data:
    args += ["--add-data", f"{d}{sep}{d if os.path.isdir(d) else '.'}"]
args.append(os.path.join("desktop", "app.py"))

print(" ".join(f'"{a}"' if " " in a else a for a in args))
sys.exit(subprocess.call(args))
