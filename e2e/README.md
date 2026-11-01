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
| `edge` | Real 404s, cache and security headers, SEO/PWA files, hidden operator endpoints, JSON errors without framework banners, mutation guards, search proxy |
| `desktop` | Boot without console errors, binary `GSB1` stream, layer shortcuts and share links, live vs simulated popup, cyclone injection reaching the shared feed, help dialog and search focus |
| `mobile` | Bottom sheet, no horizontal overflow, city search to popup |

All tests share one simulation, so they run serially.
