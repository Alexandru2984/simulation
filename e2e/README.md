# End-to-end tests

Playwright tests run against the production topology without TLS or Cloudflare.
The browser talks to the repo's nginx vhost (`deploy/nginx/`), which sits in
front of the real backend binary and the built frontend. A deterministic fake
OpenWeather (`fake-openweather.py`) stands in for the API.

```bash
make e2e        # builds everything into .tmp/ and runs the suite
# or, with existing builds:
scripts/ci/run-e2e.sh <backend-binary> <frontend-dist> [playwright args...]
```

Requirements: `nginx`, `python3`, `curl`, Node 22+, and a Chromium build for
Playwright. Get one with `npx playwright install chromium`, or point
`CHROME_PATH` at an existing build. The script runs unprivileged on ports
18443, 18094 and 18095 (overridable with `E2E_*_PORT`). It never touches the
system nginx and fails if the vhost gains a directive it cannot rewrite.

| Project | Covers |
| --- | --- |
| `edge` | Real 404s, cache and security headers, SEO/PWA files, privacy notice, operator endpoints hidden at the edge and in the backend, the JSON error contract (including nginx 429s), mutation guards, error-report intake, search proxy |
| `desktop` | Boot without console errors on one compressed `GSB2` stream, layer shortcuts and share links, live vs simulated popup, cyclone injection reaching the shared feed, help dialog and search focus, anonymous error reporting |
| `mobile` | Bottom sheet, no horizontal overflow, city search to popup |
| `a11y` | axe-core WCAG 2.1 A/AA and best-practice rules on the HUD, dialogs, panels, popup, phone layout, privacy notice and 404 page; the layer picker's arrow-key model |

All tests share one simulation, so they run serially.
