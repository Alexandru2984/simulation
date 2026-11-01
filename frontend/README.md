# Weather Simulation — frontend

React 19 + Three.js (via `@react-three/fiber`) client for
[simulation.micutu.com](https://simulation.micutu.com). It renders the C++
backend's 36×72 global grid on a WebGL globe and drives the shared simulation
through the REST and WebSocket API documented in the root `README.md`.

## Commands

```bash
npm ci --ignore-scripts   # reproducible install (lifecycle scripts disabled)
npm run dev               # Vite dev server on :5173, proxies /api and /ws to 127.0.0.1:8094
npm test                  # node:test unit tests (pure modules only, no DOM)
npm run lint              # ESLint flat config (React hooks + refresh rules)
npm run build             # production bundle in dist/
```

Node 22 or newer is required.

## Layout

| Path | Purpose |
| --- | --- |
| `src/App.jsx` | Top-level state: sockets, overlay mode, placement, popups |
| `src/components/` | Globe layers (`*Layer`, `*Particles`, `GridOverlay`) and HUD panels |
| `src/hooks/` | Resilient WebSocket manager, FPS sampling |
| `src/utils/` | Pure helpers (grid sampling, geo math, payload decoding) with tests |
| `public/` | Static files served as-is (textures, icons, robots.txt, manifest) |

Pure modules (`*.js` next to a `*.test.js`) must not touch the DOM so they can
run under `node --test`.
