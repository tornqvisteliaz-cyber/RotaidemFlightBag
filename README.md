# Rotaidem Flight Bag

An iPad electronic flight bag for flight simulation, modelled on the apps airline pilots use: an airline chart viewer, a moving-map enroute chart, an onboard performance tool, an OFP briefing app and the everyday utilities around them, all on an iPadOS-style home screen.

> For flight simulation only. Charts, maps and performance numbers are not for real-world navigation or operations.

## Apps

| App | What it does |
| --- | --- |
| **Charts** | Airline-style chart viewer. Every airport has a live **Airport Moving Map** (TAXI › AMM) in the style of Lido airport charts: runways, yellow taxiway guidelines, aprons, stands, holding points, taxiway sign labels and taxiway search, with your aircraft on it. ENR map with your route, airports, VOR/NDB, FIRs, radar and SIGMETs; aerodrome view with GEN / SID / STAR / APPR / TAXI, USER bookmarks, day/night, rotate. Jeppesen charts through **Navigraph**, your own PDF charts, and generated 10-9 airport diagram / 10-1P airport information pages for every airport. Documents panel for company docs. |
| **Enroute** | Moving-map enroute chart on terrain with your live aircraft (follow mode, GS/ALT/TRK/VS strip); zoom in near an airport and the ground map appears automatically. route with airway/FL boxes, FIR boundaries, radar timeline with playback, SIGMETs, live VATSIM ATC frequencies, runway/airport info sheets, measuring, drawing and range rings. Jumps straight into Charts for SID/STAR/APP/TAXI. |
| **OPT** | Onboard performance tool for the A320, A330-300, A340-600, A350-900, 737-800/-900ER/-9, 747-400, 757-200 and 787-9: TKO Dispatch, TKO All Engine, LDG Dispatch, LDG Enroute. FLEX / assumed temperature, N1, V-speeds, CONF/flaps per type, field/climb limits, landing distances per autobrake. Prefills from the OFP and live METAR, compares with the SimBrief TLR. Simplified model. |
| **Briefing** | SimBrief: import latest OFP, summary, full OFP, navlog, fuel & weights, weather, ATC flight plan, maps; dispatch new flights on SimBrief, generate in-app through the SimBrief API, or create an offline flight. |
| **Weather** | Decoded METAR, TAF, runway head/crosswinds and radar for departure, destination, alternates and favourites. |
| **Checklist**, **ScratchPad**, **Library**, **Clock**, **Converter**, **Logbook** | Electronic normal checklist, handwriting pad with CRAFT/ATIS/TO-data templates, PDF document library, UTC/OOOI block times/timers, unit & fuel uplift converter, flight log with CSV export. |
| **App Store**, **Settings** | Install and remove apps; iPadOS-style settings for SimBrief, Navigraph, fleet, units, display, wallpaper, Connect iPad. |

iPadOS touches: home screen with widgets (UTC clock, simulator, weather, route, flight timeline), dock with recents and App Library, Search (pull down), Control Center (tap the top-right of the status bar), long-press app menus and jiggle editing, app switcher, brightness and Night Shift.

**Leaving an app on a real iPad:** when the EFB is added to the Home Screen, iPadOS uses the bottom-edge swipe to close the whole EFB. Use **AssistiveTouch** (the floating button – tap for Home, App Switcher, Control Center and Search; press and hold for Home) or a **three-finger swipe up**. Toggle it in Settings › Accessibility.

## Windows app (.exe)

`Rotaidem Flight Bag.exe` is the easiest way to run the EFB on the simulator PC. Double-click it and it:

- starts the EFB and the simulator bridge (MSFS SimConnect is built in, X-Plane 12 needs nothing),
- opens the EFB in its own app window (Microsoft Edge app mode, no browser bars),
- lets your iPad connect over Wi-Fi with **Connect iPad**,
- quits when you close the window. Launching it again while it runs just opens another window.

Allow it through the Windows firewall on **private networks** the first time so the iPad can reach it. Settings, flights and imported documents are kept in `%LOCALAPPDATA%\RotaidemFlightBag`.

**Build it yourself:** double-click `build-exe.bat` (needs Python 3.10+). It creates a build environment, installs PyInstaller, SimConnect and Pillow, and writes `dist\Rotaidem Flight Bag.exe`. The bundled [Python-SimConnect](https://github.com/odwdinc/Python-SimConnect) package is AGPL-3.0 licensed.

## Put it on your iPad

Like Waymark FlightBag Pro's second-screen pairing, you run the EFB on your PC and scan a QR code with the iPad.

1. On the PC, double-click **`Start EFB.bat`** (or run `python serve.py`). It opens the EFB with the **Connect iPad** sheet.
2. Make sure the iPad is on the same Wi-Fi. Scan the QR code with the iPad Camera app and open the link.
3. In Safari tap **Share → Add to Home Screen**. The EFB now opens full-screen like an app, with your SimBrief username already set.

Allow Python through the Windows firewall for private networks if the iPad can't connect. You can open the sheet again from the **Connect iPad** button next to the iPad frame, from Control Center, or from Settings › Connect iPad.

**Hosted instead of local:** publish the folder with GitHub Pages (Settings › Pages › deploy from branch). The iPad can then open the HTTPS address from anywhere, and the service worker caches the app and airport database for offline use.

## Live aircraft (SimConnect / X-Plane)

The PC server reads your aircraft from the simulator and streams it to the EFB (and to the iPad over Wi-Fi) four times a second.

- **Microsoft Flight Simulator 2020 / 2024** – run `pip install SimConnect` once on the sim PC. Start the EFB with `Start EFB.bat`; it connects when MSFS is running.
- **X-Plane 12.1+** – nothing to install; the EFB uses X-Plane's built-in web API on port 8086.
- **No simulator?** Settings › Simulator › Demo flight flies your loaded route so you can try the moving maps.

Live data only works when the EFB is loaded from the PC server (`serve.py`). From GitHub Pages the browser cannot reach your simulator.

Ground maps come from OpenStreetMap through the Overpass API, so detail varies by airport; they are cached after the first load.

## Setup

**SimBrief** – Settings › SimBrief: enter your username or pilot ID, then Briefing › Import latest OFP.

**In-app OFP generation (SimBrief API)** – needs a PHP host. Copy `api/config.example.php` to `api/config.php` and paste your API key. `api/config.php` is git-ignored, and the key never reaches the browser: `api/simbrief.php` signs requests on the server. On static hosting use “Plan on SimBrief.com”, which opens SimBrief's dispatch page pre-filled.

**Navigraph (Jeppesen charts)** – the Navigraph Charts API needs a client ID and secret from the [Navigraph developer programme](https://navigraph.com/partners). Enter them in Settings › Navigraph, then sign in with your Navigraph account (Charts subscription) using the QR / code device flow.

**TAF & SIGMET** – aviationweather.gov doesn't allow browser requests from other sites, so on a PHP host `api/wx.php` proxies them. Without it, TAFs come from the SimBrief OFP and SIGMETs are unavailable.

## Data sources

OurAirports (airports, runways, frequencies, navaids – bundled in `data/`, rebuild with `node tools/build-data.mjs <csv-dir>`), Natural Earth via world-atlas, VATSpy data project (FIRs), VATSIM (METAR, live ATC), RainViewer (radar), Esri World Physical (terrain), SimBrief, Navigraph.

## Development

No build step. Serve the folder over HTTP (`python serve.py --no-browser`) and open `http://localhost:8642`. Add `?app=charts` (or any app id) to open an app directly, `?fullscreen` to hide the iPad frame.
