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
| `public/` | Static files served as-is (textures, icons, robots.txt, sitemap, manifest, 404 page, social preview) |
| `scripts/` | Maintenance scripts that are not part of the build |

Pure modules (`*.js` next to a `*.test.js`) must not touch the DOM so they can
run under `node --test`.

## Bundling

`vite.config.js` splits vendor code into long-lived chunks (`react`, `three`,
`r3f`, `geo`) so an app deploy only invalidates our own code. The entry chunk
preloads React alone. The 3D globe, dialogs and popups are lazy-loaded behind
the HUD and the static splash screen in `index.html`.

## Static assets and SEO

- `index.html` carries the title, description, canonical URL, Open Graph and
  Twitter cards, JSON-LD (`WebApplication`) and a static splash. The splash
  doubles as crawlable text and as the first paint before JavaScript runs.
- The Earth textures are WebP (`public/textures/*.webp`). They are about four
  times smaller than the old JPEGs at the same resolution.
- `public/icons/*.png`, `public/apple-touch-icon.png` and `public/og-image.jpg`
  are generated from `favicon.svg` and from the running app by
  `scripts/render-assets.mjs`. See the header of that script for how to run
  it against a local preview with a headless Chromium.
- `public/404.html` is the page nginx returns for unknown paths. See
  `deploy/nginx/`.
