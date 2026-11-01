# 🌍 Weather Simulation Platform

> Real-time, physics-based 3D weather simulation engine — **live at [simulation.micutu.com](https://simulation.micutu.com)**

A full-stack production application combining a **C++ atmospheric simulation engine** with a **WebGL 3D globe frontend**, deployed on a hardened VPS with HTTPS and WebSocket streaming.

---

## ✨ Features

| Category | Capability |
|---|---|
| **3D Globe** | WebGL globe with real Earth texture, real-time day/night terminator (UTC), atmospheric Fresnel glow, starfield |
| **Simulation** | 36×72 global grid (5° resolution), Coriolis force, pressure gradient dynamics, latent heat release, thermal diffusion |
| **Live Data** | OpenWeatherMap assimilation — 20 cities nudge the simulation every 5 minutes |
| **Events** | Inject cyclones, heat domes, cold outbreaks, blocking highs, tornados directly onto the globe |
| **Overlays** | Temperature, pressure, humidity, precipitation, wind arrows, storm potential heatmaps |
| **Storm Tour** | Auto-fly camera to each detected active storm every 8 seconds |
| **City Search** | Geocoded search with keyboard navigation, fly-to animation, city pin on globe |
| **Time Navigator** | Forecast (run ahead 100 physics steps) + History replay with play/pause/speed controls |
| **Live Together** | One shared world: online-viewer count and a live feed of everyone's injections, with fly-to on click |
| **Sharing** | The URL hash keeps the view (`#lat=44.43&lon=26.10&layer=temp`); share via the native share sheet or clipboard, PNG screenshots |
| **Mobile** | Phone layout with a compact top bar, a swipeable bottom sheet and floating actions. Desktop and tablet use docked panels. Safe-area aware |
| **Settings** | °C/°F, m/s · km/h · mph · kn and graphics quality (auto/low/high). The globe honours `prefers-reduced-motion` |
| **Keyboard** | `1`–`7` layers, `/` search, `e` event panel, `t` storm tour, `r` reset view, `+`/`−` zoom, `f` fullscreen, `s` screenshot, `l` back to live, `?` help, `Esc` closes the topmost layer |
| **SEO & PWA** | Canonical/Open Graph/Twitter metadata, JSON-LD, sitemap, robots, installable web manifest, real 404s |
| **Privacy** | No accounts, ads, analytics or tracking cookies; a plain-language notice at [`/privacy`](https://simulation.micutu.com/privacy) |
| **Error reporting** | Uncaught browser errors, crashed views and undecodable frames are reported anonymously to the backend, de-duplicated and logged with a count |

---

## 🏗️ Architecture

```
                        HTTPS (443)
  Browser ──────────► Nginx (simulation.micutu.com)
                           │
              ┌────────────┼────────────────────────┐
              │            │                        │
              ▼            ▼                        ▼
       /  (React SPA)  /api/*  (REST)         /ws/*  (WebSocket)
       dist/index.html      │                        │
                            └────────────┬───────────┘
                                         ▼
                          ┌──────────────────────────────┐
                          │   Drogon C++ Backend (:8094)  │
                          │   (127.0.0.1 only)            │
                          │                              │
                          │  ┌─────────────────────────┐ │
                          │  │  GridSim  (C++ thread)   │ │
                          │  │  36×72 grid, 10 Hz       │ │
                          │  │  • Coriolis force        │ │
                          │  │  • Pressure gradient     │ │
                          │  │  • Thermal diffusion     │ │
                          │  │  • Latent heat release   │ │
                          │  │  • OWM data assimilation │ │
                          │  │  • History ring buffer   │ │
                          │  └─────────────────────────┘ │
                          │                              │
                          │  ┌─────────────────────────┐ │
                          │  │  WeatherSim (C++ thread) │ │
                          │  │  Point simulation for    │ │
                          │  │  HUD weather readout     │ │
                          │  └─────────────────────────┘ │
                          └──────────────────────────────┘

  Frontend (React + Three.js/WebGL)
  ├── EarthGlobe.jsx      — Custom GLSL shaders: day/night, specular, temperature tint
  ├── Atmosphere.jsx      — Fresnel atmospheric glow shader
  ├── CloudLayer.jsx      — Sun-lit cloud shell driven by the humidity field
  ├── WindParticles.jsx   — GPU-driven wind flow particles
  ├── RainParticles.jsx   — Precipitation particle system
  ├── GridOverlay.jsx     — Per-cell weather heatmap overlay
  ├── WindField.jsx       — Instanced arrow field (36×72)
  ├── GlobeLabel.jsx      — DOM labels projected from 3D with horizon culling
  ├── StormLabels.jsx     — Labels for the deepest detected storms
  ├── FrontalLayer.jsx    — Weather front boundaries
  ├── ForecastPanel.jsx   — Forecast + History with auto-replay
  └── SearchBar.jsx       — Geocoded city search (keyboard nav)
```

---

## 🔬 Physics Engine (C++)

The simulation runs a **36×72 global grid** (2,592 cells, 5° resolution) at **10 Hz** using explicit Euler integration with `dt = 0.05s`.

### Governing Equations (per cell)

**1. Solar Insolation**
```
T_eq(lat) = 45·cos²(lat) − 18      [°C, ≈ 27 °C at the equator, −18 °C at the poles]
dT/dt|solar = (T_eq + 18·max(0, cos(ha)·cos(lat)) − T) · 0.003
```
Where `ha` = hour angle = simTime/3600 · 2π + longitude

**2. Thermal Diffusion**
```
dT/dt|diff = (T̄_neighbors − T) · 0.12
```

**3. Pressure Relaxation**
```
P_target = 1013.25 + 1.5·(T − 15)   [hPa]
dP/dt = (P_target − P) · 0.05
```
Slow relaxation lets injected lows and highs live long enough to drive winds.

**4. Pressure Gradient Force + Coriolis + Friction**
```
(u, v) = (U, V) − ∇P · 0.5 · dt                 [pressure-gradient acceleration]
(U, V) ← R(−f·s·dt) · (u, v) · (1 − 0.08·dt)    [exact Coriolis rotation, linear drag]
f = 2·Ω·sin(lat),  Ω = 7.2921×10⁻⁵ rad/s,  s = 2000 (time-scale factor)
```
Coriolis is applied as an exact rotation. Forward Euler on `f·V`/`−f·U`
inflates `|v|` by `√(1 + (f·dt)²)` every step and pinned the whole grid at the
70 m/s clamp. With drag, the flow settles into a geostrophic/Ekman balance
`|v| = PGF / √(k² + f²)`: mean winds ≈ 10 m/s, mid-latitude westerlies, a
global mean temperature ≈ 15 °C. Tests in `backend/tests/test_gridsim.cc` cover
these properties.

**5. Upwind Temperature Advection**
```
dT/dt|adv = −U·∂T/∂x − V·∂T/∂y   [upwind scheme]
```

**6. Humidity & Precipitation + Latent Heat**
```
H_sat = 0.80 − 0.005·max(0, T − 25)
precip = max(0, H − H_sat) · 25     [mm/h]
dT/dt|latent = precip · 0.05        [condensation heating]
```

**7. Data Assimilation**
Real OWM observations for 20 global cities are ingested every 5 minutes via Gaussian nudging:
```
w_ij = exp(−(Δr² + Δc²) / (2 · 2.25))
ΔT_cell += (T_obs − T_cell) · w_ij · RELAX_RATE
```

**8. Storm Detection**
A cyclone is identified at a local pressure minimum when:
```
P_cell − P_zonal_mean < −6 hPa  AND  max |V| over the 3×3 neighbourhood ≥ 7 m/s
```
The eyewall maximum is used because a cyclone's eye is calm.
Frontal boundaries are detected via temperature gradient anomalies above threshold.

---

## 📡 API Reference

### REST Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/weather` | Current point weather (temperature, pressure, wind) |
| `GET` | `/api/healthz` | Liveness check for load balancers and uptime monitors |
| `GET` | `/api/readyz` | Readiness check; returns 503 until simulation threads have ticked |
| `GET` | `/api/grid/state` | Full 36×72 grid JSON (T, P, U, V, H, R, SP, storms, fronts) |
| `POST` | `/api/grid/inject` | Inject weather event `{type, lat, lon, intensity}` |
| `POST` | `/api/grid/forecast` | Run N steps ahead, return snapshots |
| `GET` | `/api/grid/history` | Last 30–120 recorded grid snapshots |
| `GET` | `/api/grid/history?limit=N` | `N` = 1–120 |
| `GET` | `/api/metrics` | Runtime metrics: tick, simTime, wsClients, assimilation. **Operator-only:** 127.0.0.1, `404` through nginx |
| `GET` | `/api/version` | Build SHA, build time, uptime. **Operator-only:** 127.0.0.1, `404` through nginx |
| `POST` | `/api/client-errors` | Browser error report `{kind, message, stack?, source?, line?, col?, build?}`; `204`. Same origin only, ≤ 8 KiB |
| `GET` | `/api/ops/client-errors?limit=N` | Most frequent browser errors with counts. **Operator-only:** 127.0.0.1, `404` through nginx |
| `GET` | `/api/weather/realtime?lat=&lon=` | Live observation for a point, through the budgeted OpenWeather gateway (cached) |
| `GET` | `/api/weather/search?q=` | City geocoding (normalised, length-limited query; cached) |
| `GET` | `/api/weather/locations` | The seed cities shown as chips |
| `POST` | `/api/weather/seed` | Fetch OWM data for lat/lon + assimilate |
| `POST` | `/api/weather/speed` | Set simulation speed multiplier (0.5–50×) |

### WebSocket Streams

| Path | Payload | Per viewer |
|---|---|---|
| `/ws/grid?format=bin2` | Compressed binary `GSB2` frame. **Used by the frontend**, one socket per viewer | ~8 KB/s |
| `/ws/grid?format=bin1` | Uncompressed binary `GSB1` (fallback without `DecompressionStream`) | ~37 KB/s |
| `/ws/grid` | JSON | ~80 KB/s |
| `/ws/weather` | Point readout only (legacy; now inside grid frames as `point`) | 0.1 KB/s |

Every grid frame is sent at 1 Hz and carries:

- `speed`;
- `viewers` (open grid sockets);
- `serverTime` (unix seconds);
- `events` (recent injections: id, type, lat, lon, intensity, time);
- `point` (the HUD readout: temperature, pressure, wind_speed, wind_direction,
  timestamp).

The expensive part of a frame, including the compressed payload, is built
once per grid version and shared by every client. Each format is serialized
once per broadcast.

Limits:

- Viewers are capped at `SIM_WS_MAX_CLIENTS` (default 1000).
- JSON/`GSB1` and `/ws/weather` together get a tenth of that (at least 16).
  Only stale tabs use them, at 5–10× the cost.
- A full server closes the handshake with code **1013 (Try Again Later)**.
  The frontend shows "the simulation is full" and retries with backoff.
- Sockets that do not answer a ping within `SIM_WS_IDLE_SECONDS` (default
  30 s) are closed. This also bounds what can pile up for a client that stops
  reading.
- Tabs hidden for more than a minute close their socket and reconnect when
  shown.

Precision is 0.1 °C / hPa / m/s, 0.1 % humidity and 0.01 mm/h rain. That is
finer than anything displayed, and coarser digits compress far better.

`GSB1` layout, little-endian (see `backend/src/GridCodec.h` and
`frontend/src/utils/gridCodec.js`):

```
0   char[4]  "GSB1"
4   u32      header length N
8   N bytes  UTF-8 JSON header: the JSON frame without arrays, plus
             "fields": [[name, scale, offset], ...]
    zero padding to a 4-byte boundary
    int16[fields × rows × cols], field-major; value = q / scale + offset
```

`GSB2` has the same framing with magic `"GSB2"` and
`"encoding": "row-delta+byte-shuffle+zlib"` in the header. Its int16 block
is replaced by a zlib (RFC 1950) stream of that block after two lossless
transforms:

1. per-row deltas within each field (int16 wrap-around);
2. a byte shuffle (all low bytes, then all high bytes).

Browsers inflate it with the native `DecompressionStream`. The decoder
refuses output larger than the grid.

### Errors

Every error, from the backend or from nginx's rate limiter, is JSON with a
stable snake_case code; validation failures add a readable `message`:

```json
{ "error": "out_of_range", "message": "value must be between 0.5 and 50" }
```

Clients branch on `error` only; `message` wording may change.

| Status | Codes |
|---|---|
| `400` | `invalid_json`, `missing_fields`, `invalid_type`, `out_of_range`, `unknown_event_type`, `invalid_limit`, `invalid_query`, `invalid_lat_lon`, `lat_lon_out_of_range`, `invalid_report`, `bad_request` |
| `401` / `403` | `unauthorized`, `forbidden_origin`, `forbidden` |
| `404` / `405` | `not_found`, `method_not_allowed` |
| `413` / `414` / `415` / `431` | `payload_too_large`, `uri_too_long`, `unsupported_media_type`, `headers_too_large` |
| `429` | `rate_limited` (nginx adds `Retry-After: 10`), `upstream_rate_limited` |
| `502` / `503` | `upstream_failed`, `upstream_response_too_large`, `upstream_invalid_payload`, `api_key_not_configured` |

Responses never include the framework name or version.

### Event Types (POST `/api/grid/inject`)
```json
{ "type": "cyclone|heat_dome|cold_outbreak|blocking_high|tornado",
  "lat": 40.0, "lon": -74.0, "intensity": 1.0 }
```

### Mutation Protection

Mutating endpoints require:
- `Origin: https://simulation.micutu.com`
- `Content-Type: application/json`
- `X-Simulation-Token` only when `SIM_MUTATION_TOKEN` is set in the backend environment

The origin and content-type checks reduce accidental cross-site and malformed writes. Set `SIM_MUTATION_TOKEN` when the mutation surface should be restricted beyond the public UI.

On top of nginx's per-IP limits, each mutating endpoint has a global token
bucket in the backend (inject 60/min, seed 120/min, speed 20/min) and returns
`429` when exhausted, so distributed clients can't grief the shared world.

---

## 🚀 Setup & Deployment

### Prerequisites
```bash
apt install build-essential cmake git nodejs npm nginx certbot python3-certbot-nginx
# Drogon C++ framework (built from source or package)
```

### Build Backend
```bash
cd backend
mkdir -p build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=OFF
make -j$(nproc)
```

### Build Frontend
```bash
make frontend-build   # npm ci + vite build into .tmp/frontend-dist
```
Never run `npm run build` inside the production checkout. nginx serves
`frontend/dist` from there live; only `scripts/deploy.sh` replaces it,
atomically.

### Checks and CI
```bash
make check   # backend build + CTest, frontend audit/test/lint/build
make e2e     # deploy/nginx vhost + backend + built frontend in Playwright
```
GitHub Actions runs the same checks on every push. It adds an ASan/UBSan run and
builds the backend on Ubuntu 26.04 with Drogon 1.9.11, as in production.
`scripts/deploy.sh` refuses any commit that is not pushed or whose CI run is
not green.

### Configure & Deploy
```bash
# Only after CI is green for the pushed commit (the preflight enforces it).
cd /srv/canary/simulation.micutu.com/project
git pull --ff-only
scripts/deploy.sh
```

The application deploy builds and tests in fresh staging paths, backs up the
current binary and persisted state, atomically swaps backend/frontend releases,
and rolls back automatically if production verification fails. It deliberately
does not modify Nginx, systemd, Cloudflare, DNS, or firewall configuration. See
[`docs/OPERATIONS.md`](docs/OPERATIONS.md) for infrastructure procedures.

### Runtime Environment (`/etc/simulation/simulation.env`)
```env
PORT_BACKEND=8094
OPENWEATHER_API_KEY=your_openweathermap_key
SIM_ALLOWED_ORIGIN=https://simulation.micutu.com
# Optional: requires X-Simulation-Token on mutating endpoints when set.
SIM_MUTATION_TOKEN=change-me
# Optional overrides
SIM_STATE_FILE=/srv/.../state/grid.snapshot      # persisted world
SIM_HISTORY_FILE=/srv/.../state/history.snapshot # persisted history ring
SIM_WS_MAX_CLIENTS=1000                          # 1–20000 viewers; keep LimitNOFILE above it
SIM_WS_IDLE_SECONDS=30                           # 3–3600, unresponsive socket eviction
OPENWEATHER_BASE_URL=https://api.openweathermap.org  # for tests/staging only
```

Every OpenWeather call goes through one gateway: a global budget (40/min),
response caching and response-size limits. A flood of popups or searches can
therefore never exhaust the API key.

The production file is root-owned, mode `0600`, and is never stored in Git.

---

## 📂 Project Structure

```
simulation/
├── backend/
│   ├── CMakeLists.txt
│   ├── tests/                   — unit tests (gridsim, security, weathersim) via CTest
│   └── src/
│       ├── main.cc              — Drogon app bootstrap, OWM assimilation scheduler
│       ├── GridSim.h / .cc      — Physics engine (36×72 grid, 10 Hz loop) + state snapshots
│       ├── GridCodec.h / .cc    — Cached JSON/GSB1/GSB2 frame encoding
│       ├── GridController.h/.cc — REST + WebSocket handlers for grid
│       ├── EventLog.h           — Recent injections for the live feed
│       ├── WsHub.h              — Socket registry with idle eviction
│       ├── OpenWeatherClient.h/.cc — Budgeted, cached OpenWeather gateway
│       ├── TtlCache.h           — Small TTL cache for upstream responses
│       ├── HealthController.h/.cc — liveness/readiness endpoints
│       ├── ClientErrors.h       — browser error report validation, scrubbing, de-duplication
│       ├── ClientErrorController.h/.cc — report intake and operator summary
│       ├── Security.h           — origin / content-type / token checks
│       ├── RateLimiter.h        — global token buckets for mutating endpoints
│       ├── SdNotify.h           — systemd READY/WATCHDOG notifications
│       ├── WeatherSim.h / .cc   — Point weather simulation
│       ├── WeatherController.h/.cc
│       ├── WeatherProxy.h / .cc — OWM API proxy
│       └── SeedController.h/.cc — City seeding endpoint
├── frontend/
│   ├── package.json
│   ├── vite.config.js           — vendor chunk splitting
│   ├── index.html               — SEO metadata, JSON-LD, static splash
│   ├── public/                  — textures (WebP), icons, manifest, robots, sitemap, 404, privacy notice, og-image
│   ├── scripts/render-assets.mjs — regenerates icons and the social preview
│   └── src/
│       ├── App.jsx              — state, URL hash, shortcuts, layout switch
│       ├── components/          — globe layers, desktop HUD, MobileHUD, dialogs
│       ├── hooks/               — resilient sockets, fullscreen, layout, prefs
│       └── utils/               — pure, unit-tested helpers (geo, codec, overlay, units, error reporter)
├── deploy/
│   ├── logrotate/
│   │   └── weather-backend
│   ├── simulation-canary.service
│   ├── simulation-canary-alert.conf
│   ├── weather-backend-alert.service
│   ├── weather-metrics.service / .timer
│   └── nginx/
│       ├── simulation.micutu.com.conf
│       └── snippets/simulation-security-headers.conf
├── docs/
│   └── OPERATIONS.md
├── logs/
├── state/                       — grid snapshot (world survives restarts)
├── .gitignore
└── README.md
```

---

## 🔐 Security

- **Nginx**: HSTS with `preload`, strict CSP (no inline scripts), deny-by-default `Permissions-Policy`, COOP/CORP, `X-Frame-Options`, `X-Content-Type-Options`, per-IP rate limits (429), real 404s, operator endpoints hidden, dotfiles never served
- **Origin guard**: only Cloudflare can reach the origin; direct requests get `403`
- **OpenWeather**: one budgeted gateway with caching, query normalisation and response-size limits; constant-time token comparison for `SIM_MUTATION_TOKEN`
- **TLS**: TLS 1.2 + 1.3 only (1.0/1.1 disabled)
- **Backend**: Bound to `127.0.0.1:8094` only (not externally reachable); global token buckets on mutations; operator endpoints also refuse any request that came through a proxy
- **Error reports**: same-origin JSON only, size-capped, rate-limited per IP and globally; text is stripped of control, bidi and invisible characters before it reaches the log, and each log line is one escaped JSON object. No IP, cookie or page URL is stored
- **systemd**: `simulation-canary.service` includes `NoNewPrivileges`, `PrivateTmp`, `PrivateDevices`, `ProtectSystem=strict`, `ProtectHome=read-only`, narrow writable log/state paths, `SystemCallFilter=@system-service`, an empty capability set, and `UMask=0077`
- **Supervision**: `Type=notify` + `WatchdogSec=30` — the backend pings the systemd watchdog from its event loop, so hangs restart automatically, not just crashes
- **Firewall**: UFW active, default DENY, only 22/80/443 open

---

## 📜 License

MIT
