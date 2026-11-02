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
| `src/hooks/` | Resilient WebSocket manager, FPS sampling, preferences |
| `src/i18n/` | Interface languages: dictionaries, plural-aware `translate`, React context |
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

### Performance budget

`scripts/check-budget.mjs` measures a build the way visitors receive it (gzip
for code and markup, raw bytes for images) and fails CI when a limit is
exceeded: the JavaScript and CSS needed before first paint, all JavaScript,
the largest chunk, textures, and icons. The table also lands in the CI job
summary. Raising a limit is a deliberate edit to that script.

```bash
make frontend-build frontend-budget   # from the repository root
```

The e2e suite adds a runtime budget in a real browser (`e2e/tests/perf.spec.js`).

## Interface languages

Every visible string is a key in `src/i18n/en.js`, with the same key in
`src/i18n/ro.js`. Components read `t` from `useI18n()`; formatters and other
code outside React use `t` and `getLanguage()` from `src/i18n/i18n.js`.

- **Choice**: `prefs.lang` is `auto` (first supported language in
  `navigator.languages`, else English), `en` or `ro`, set in Settings.
  `<html lang>` and the document title follow it.
- **Loading**: English is in the main bundle; other languages are lazy chunks.
  Until one arrives the interface stays English, numbers included.
- **Messages**: `{name}` placeholders, plural objects keyed by
  `Intl.PluralRules` categories (Romanian needs `one`, `few` and `other`:
  1 furtună, 3 furtuni, 20 de furtuni). Missing keys fall back to English.
- **Numbers**: `formatNumber` in `utils/units.js` (decimal comma in Romanian,
  never a thousands separator). Compass points and relative times are
  dictionary entries too.
- **API errors**: the backend's stable `error` codes map to `error.<code>`.

`src/i18n/i18n.test.js` fails when a language is missing a key, has an extra
one, changes a placeholder, leaves a text empty or skips a plural category.

To add a language: copy `ro.js`, translate it, add it to `LANGUAGES` and
`LOADERS` in `i18n.js`, and add a test for its plurals.

## Static assets and SEO

- `index.html` carries the title, description, canonical URL, Open Graph and
  Twitter cards, JSON-LD (`WebApplication`) and a static splash. The splash
  doubles as crawlable text and as the first paint before JavaScript runs.
- The textures are WebP (`public/textures/*.webp`). The Earth maps are about
  four times smaller than the old JPEGs at the same resolution. `clouds.webp`
  is the cloud mask baked into one grayscale channel from the original RGBA
  PNG (alpha, or luminance where a texel was opaque, which is exactly what the
  cloud shader computed), lossy at Q80: 63 KB instead of 260 KB, mean error
  under 1%.
- `public/icons/*.png`, `public/apple-touch-icon.png` and `public/og-image.jpg`
  are generated from `favicon.svg` and from the running app by
  `scripts/render-assets.mjs`. See the header of that script for how to run
  it against a local preview with a headless Chromium.
- `public/404.html` is the page nginx returns for unknown paths. See
  `deploy/nginx/`.
