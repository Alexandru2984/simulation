# 🌦️ Weather Simulation Platform

A production-ready real-time weather simulation engine with a modern React frontend, C++ backend, and WebSocket streaming.

---

## 🏗️ Architecture

```
         HTTPS (443)
         ─────────────────────────────────────────────────────
Client ──► Nginx (your-domain.com)
            │
            ├──  /          → Static React frontend (dist/)
            ├──  /api/*     → Drogon C++ backend (:8094)
            └──  /ws/*      → WebSocket (Drogon :8094, upgraded)

         ┌──────────────────────────────────┐
         │  Drogon Backend (C++)             │
         │  ─────────────────────────────   │
         │  WeatherSimulator (thread)        │
         │    ├─ Temperature: sinusoidal     │
         │    ├─ Pressure: temp-dependent    │
         │    └─ Wind: random vector walk    │
         │                                  │
         │  REST  GET /api/weather           │
         │  WS    /ws/weather  (broadcast)   │
         └──────────────────────────────────┘
```

---

## ⚙️ Tech Stack

| Layer       | Technology            |
|-------------|-----------------------|
| Backend     | C++17, Drogon 1.8.7   |
| Frontend    | React 18, Vite, Recharts |
| Proxy       | Nginx                 |
| SSL         | Let's Encrypt/Certbot |
| Process     | systemd               |

---

## 🔢 Simulation Math

### Temperature
```
T(t) = T_base + A·sin(2π·t / period) + η(t)
```
- `T_base` = 20°C, `A` = 10°C amplitude, `period` = 3600s (1 hour cycle)
- `η(t)` = Gaussian noise ±0.5°C

### Pressure
```
P(t) = P_base - k·(T(t) - T_base)
```
- `P_base` = 1013.25 hPa, `k` = 0.12 hPa/°C (lapse-rate approximation)

### Wind
```
vx(t) = vx(t-1)·α + ε_x·(1-α)
vy(t) = vy(t-1)·α + ε_y·(1-α)
speed = √(vx² + vy²),  dir = atan2(vy, vx)·180/π
```
- `α` = 0.95 (momentum / smoothing factor), `ε` = random ±10 m/s increments

---

## 🚀 Setup Instructions

### Prerequisites
```bash
apt install build-essential cmake git nodejs npm nginx certbot python3-certbot-nginx
apt install libdrogon-dev
```

### Build Backend
```bash
cd backend
mkdir -p build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)
```

### Build Frontend
```bash
cd frontend
npm install
npm run build
```

### Start Services
```bash
systemctl enable --now weather-backend
systemctl reload nginx
```

---

## 🌍 Deployment

### Domain
`your-domain.com` → configured via Nginx

### SSL
```bash
certbot --nginx -d your-domain.com \
  --email admin@example.com \
  --non-interactive --agree-tos
```

### Environment Variables
See `.env` file:
- `PORT_BACKEND=8094`
- `PORT_FRONTEND=5173`
- `DOMAIN=your-domain.com`
- `SSL_EMAIL=admin@example.com`

---

## 📡 API Reference

### REST
```
GET /api/weather
→ { "temperature": 22.3, "pressure": 1012.1, "wind_speed": 5.2, "wind_direction": 135.0, "timestamp": 1714431000 }
```

### WebSocket
```
ws://your-domain.com/ws/weather
← {"temperature":22.3,"pressure":1012.1,"wind_speed":5.2,"wind_direction":135.0,"timestamp":1714431000}
```
Updates every second.

---

## 📂 Project Structure
```
simulation/
├── backend/
│   ├── CMakeLists.txt
│   └── src/
│       ├── main.cc
│       ├── WeatherSim.h / .cc
│       └── WeatherController.h / .cc
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx
│       ├── components/
│       └── hooks/
├── logs/
├── .env
├── .gitignore
└── README.md
```
