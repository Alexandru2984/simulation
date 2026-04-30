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
| **Mobile** | Responsive UI — top bar + bottom sheet on mobile, full panel layout on desktop |

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
  ├── CloudLayer.jsx      — Animated instanced cloud mesh
  ├── WindParticles.jsx   — GPU-driven wind flow particles
  ├── RainParticles.jsx   — Precipitation particle system
  ├── GridOverlay.jsx     — Per-cell weather heatmap overlay
  ├── WindField.jsx       — Instanced arrow field (36×72)
  ├── StormLabels.jsx     — HTML labels for detected storms
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
T_eq(lat) = 38·cos²(lat) − 25      [°C, equatorial warmth]
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
dP/dt = (P_target − P) · 0.8
```

**4. Pressure Gradient Force + Coriolis**
```
dU/dt = −∂P/∂x · k + f·V
dV/dt = −∂P/∂y · k − f·U
f = 2·Ω·sin(lat)     [Coriolis parameter, Ω = 7.2921×10⁻⁵ rad/s]
```

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
A cyclone is identified when:
```
P_cell < P_zonal_mean − 8 hPa  AND  |V_wind| > 15 m/s
```
Frontal boundaries are detected via temperature gradient anomalies above threshold.

---

## 📡 API Reference

### REST Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/weather` | Current point weather (temperature, pressure, wind) |
| `GET` | `/api/grid/state` | Full 36×72 grid JSON (T, P, U, V, H, R, SP, storms, fronts) |
| `POST` | `/api/grid/inject` | Inject weather event `{type, lat, lon, intensity}` |
| `POST` | `/api/grid/forecast` | Run N steps ahead, return snapshots |
| `GET` | `/api/grid/history` | Last 30–120 recorded grid snapshots |
| `GET` | `/api/metrics` | Runtime metrics: tick, simTime, wsClients, version |
| `POST` | `/api/weather/seed` | Fetch OWM data for lat/lon + assimilate |
| `POST` | `/api/weather/speed` | Set simulation speed multiplier (0.5–50×) |

### WebSocket Streams

| Path | Payload | Frequency |
|---|---|---|
| `/ws/weather` | `{temperature, pressure, wind_speed, wind_direction}` | 1 Hz |
| `/ws/grid` | Full grid state JSON (all 2592 cells) | 1 Hz |

### Event Types (POST `/api/grid/inject`)
```json
{ "type": "cyclone|heat_dome|cold_outbreak|blocking_high|tornado",
  "lat": 40.0, "lon": -74.0, "intensity": 1.0 }
```

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
cd frontend
npm install
npm run build
# Outputs to frontend/dist/ — served by Nginx
```

### Configure & Deploy
```bash
# Copy systemd service
sudo cp deploy/weather-backend.service /etc/systemd/system/
sudo systemctl enable --now weather-backend

# SSL certificate
sudo certbot --nginx -d simulation.micutu.com \
  --email alex_mihai984@yahoo.com --non-interactive --agree-tos

# Reload Nginx
sudo nginx -t && sudo systemctl reload nginx
```

### Environment (`.env`)
```env
PORT_BACKEND=8094
PORT_FRONTEND=5173
DOMAIN=simulation.micutu.com
SSL_EMAIL=alex_mihai984@yahoo.com
OWM_API_KEY=your_openweathermap_key
```

---

## 📂 Project Structure

```
simulation/
├── backend/
│   ├── CMakeLists.txt
│   └── src/
│       ├── main.cc              — Drogon app bootstrap, OWM assimilation scheduler
│       ├── GridSim.h / .cc      — Physics engine (36×72 grid, 10 Hz loop)
│       ├── GridController.h/.cc — REST + WebSocket handlers for grid
│       ├── WeatherSim.h / .cc   — Point weather simulation
│       ├── WeatherController.h/.cc
│       ├── WeatherProxy.h / .cc — OWM API proxy
│       └── SeedController.h/.cc — City seeding endpoint
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx
│       ├── components/          — 15+ React/Three.js components
│       ├── hooks/               — useWeatherSocket, useGridSocket
│       └── utils/geoUtils.js    — Grid coordinate math
├── logs/
├── .env
├── .gitignore
└── README.md
```

---

## 🔐 Security

- **Nginx**: HSTS with `preload`, CSP, `X-Frame-Options`, `X-Content-Type-Options`, rate limiting (10 req/s burst 20)
- **TLS**: TLS 1.2 + 1.3 only (1.0/1.1 disabled)
- **Backend**: Bound to `127.0.0.1:8094` only (not externally reachable)
- **systemd**: `NoNewPrivileges`, `PrivateTmp`, `PrivateDevices`, `ProtectSystem=strict`, `SystemCallFilter=@system-service`, `CapabilityBoundingSet=` (empty), `UMask=0077` — hardening score 2.0/10 (OK)
- **Firewall**: UFW active, default DENY, only 22/80/443 open

---

## 📜 License

MIT
