import { test, expect } from '@playwright/test'

// HTTP behaviour of deploy/nginx/simulation.micutu.com.conf in front of the
// real backend. No browser needed.

test('unknown paths get a real 404 page, not the app shell', async ({ request }) => {
  const res = await request.get('/this-page-does-not-exist')
  expect(res.status()).toBe(404)
  expect(res.headers()['content-type']).toContain('text/html')
  expect(await res.text()).toContain('Page not found')
})

test('the app shell revalidates and carries the security headers', async ({ request }) => {
  const res = await request.get('/')
  expect(res.status()).toBe(200)
  const h = res.headers()
  expect(h['cache-control']).toBe('no-cache')
  expect(h['content-security-policy']).toContain("default-src 'self'")
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(h['content-security-policy']).not.toContain("script-src 'self' 'unsafe-inline'")
  expect(h['strict-transport-security']).toContain('max-age=')
  expect(h['x-content-type-options']).toBe('nosniff')
  expect(h['x-frame-options']).toBe('DENY')
  expect(h['permissions-policy']).toContain('camera=()')
  expect(h['permissions-policy']).toContain('geolocation=()')
  expect(h['cross-origin-opener-policy']).toBe('same-origin')

  const html = await res.text()
  expect(html).toContain('<link rel="canonical" href="https://simulation.micutu.com/"')
  expect(html).toContain('application/ld+json')
})

test('hashed bundles are immutable and media is cached for a week', async ({ request }) => {
  const html = await (await request.get('/')).text()
  const entry = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1]
  expect(entry, 'entry script in index.html').toBeTruthy()

  const js = await request.get(entry, { headers: { 'Accept-Encoding': 'gzip' } })
  expect(js.status()).toBe(200)
  expect(js.headers()['cache-control']).toBe('public, max-age=31536000, immutable')
  expect(js.headers()['content-encoding']).toBe('gzip')

  const texture = await request.get('/textures/earth.webp')
  expect(texture.status()).toBe(200)
  expect(texture.headers()['content-type']).toBe('image/webp')
  expect(texture.headers()['cache-control']).toContain('max-age=604800')

  expect((await request.get('/assets/does-not-exist.js')).status()).toBe(404)
})

test('SEO and PWA files are served with the right types', async ({ request }) => {
  const files = [
    ['/robots.txt', 'text/plain'],
    ['/sitemap.xml', 'xml'],
    ['/manifest.webmanifest', 'application/manifest+json'],
    ['/og-image.jpg', 'image/jpeg'],
    ['/favicon.svg', 'image/svg+xml'],
    ['/icons/icon-192.png', 'image/png'],
  ]
  for (const [path, type] of files) {
    const res = await request.get(path)
    expect(res.status(), path).toBe(200)
    expect(res.headers()['content-type'], path).toContain(type)
  }
  const manifest = await (await request.get('/manifest.webmanifest')).json()
  expect(manifest.start_url).toBeTruthy()
  expect(manifest.icons.some(icon => icon.purpose === 'maskable')).toBe(true)
  expect(await (await request.get('/robots.txt')).text()).toContain('Sitemap: https://simulation.micutu.com/sitemap.xml')
})

test('the privacy notice is served at a clean address', async ({ request }) => {
  const res = await request.get('/privacy')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('text/html')
  expect(res.headers()['content-security-policy']).toContain("default-src 'self'")
  expect(res.headers()['cache-control']).toContain('max-age=3600')
  const html = await res.text()
  expect(html).toContain('<h1>Privacy</h1>')
  expect(html).not.toContain('<script')

  const legacy = await request.get('/privacy.html', { maxRedirects: 0 })
  expect(legacy.status()).toBe(301)
  expect(new URL(legacy.headers().location).pathname).toBe('/privacy')
  expect(await (await request.get('/sitemap.xml')).text()).toContain('https://simulation.micutu.com/privacy')
})

test('security.txt names a contact and is renewed in time', async ({ request }) => {
  const res = await request.get('/.well-known/security.txt')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toBe('text/plain; charset=utf-8')
  const text = await res.text()
  expect(text).toMatch(/^Contact: mailto:[^\s@]+@[^\s@]+\.[a-z]+$/m)
  expect(text).toMatch(/^Canonical: https:\/\/simulation\.micutu\.com\/\.well-known\/security\.txt$/m)
  // RFC 9116: at most a year ahead. Fails a month early so there is time to renew.
  const expires = Date.parse(/^Expires: (\S+)$/m.exec(text)?.[1])
  const day = 24 * 3600 * 1000
  expect(expires - Date.now()).toBeGreaterThan(30 * day)
  expect(expires - Date.now()).toBeLessThan(366 * day)
})

test('operator endpoints and dotfiles are not public', async ({ request }) => {
  for (const path of ['/api/metrics', '/api/version', '/api/ops/client-errors']) {
    const res = await request.get(path)
    expect(res.status(), path).toBe(404)
    expect(await res.json(), path).toEqual({ error: 'not_found' })
  }
  expect((await request.get('/.git/config')).status()).toBe(404)
  expect((await request.get('/.env')).status()).toBe(404)
})

test('the backend itself refuses proxied requests to operator endpoints', async ({ request }) => {
  const backend = process.env.E2E_BACKEND_URL
  test.skip(!backend, 'needs E2E_BACKEND_URL (set by scripts/ci/run-e2e.sh)')
  for (const path of ['/api/metrics', '/api/version', '/api/ops/client-errors']) {
    expect((await request.get(`${backend}${path}`)).status(), `${path} direct`).toBe(200)
    for (const header of ['X-Real-IP', 'X-Forwarded-For']) {
      const res = await request.get(`${backend}${path}`, { headers: { [header]: '203.0.113.7' } })
      expect(res.status(), `${path} with ${header}`).toBe(404)
      expect(await res.json()).toEqual({ error: 'not_found' })
    }
  }
})

test('backend errors are JSON and never name the framework', async ({ request }) => {
  const res = await request.get('/api/does-not-exist')
  expect(res.status()).toBe(404)
  expect(await res.json()).toEqual({ error: 'not_found' })
  const raw = `${JSON.stringify(res.headers())}${await res.text()}`.toLowerCase()
  expect(raw).not.toContain('drogon')

  const wrongMethod = await request.delete('/api/healthz')
  expect(wrongMethod.status()).toBe(405)
  expect(await wrongMethod.json()).toEqual({ error: 'method_not_allowed' })
})

test('health endpoints answer through the proxy', async ({ request }) => {
  expect((await request.get('/api/healthz')).status()).toBe(200)
  expect((await request.get('/api/readyz')).status()).toBe(200)
  const state = await request.get('/api/grid/state')
  expect(state.status()).toBe(200)
  const grid = await state.json()
  expect(grid.rows).toBe(36)
  expect(grid.cols).toBe(72)
  expect(grid.T).toHaveLength(36 * 72)
})

test('mutations require the site origin and a JSON body', async ({ request, baseURL }) => {
  const origin = new URL(baseURL).origin
  expect((await request.post('/api/weather/speed', { data: { value: 1 } })).status()).toBe(403)
  expect((await request.post('/api/weather/speed', {
    headers: { Origin: 'https://evil.example' }, data: { value: 1 },
  })).status()).toBe(403)
  expect((await request.post('/api/weather/speed', {
    headers: { Origin: origin, 'Content-Type': 'text/plain' }, data: '{"value":1}',
  })).status()).toBe(415)
  expect((await request.post('/api/weather/speed', {
    headers: { Origin: origin }, data: { value: 0 },
  })).status()).toBe(400)
  expect((await request.post('/api/weather/speed', {
    headers: { Origin: origin }, data: { value: 1 },
  })).status()).toBe(200)
})

test('rate-limited API calls get the JSON error contract', async ({ request }) => {
  // More parallel requests than the per-IP burst allows (rates are raised for
  // tests, bursts are not).
  const responses = await Promise.all(Array.from({ length: 150 }, () => request.get('/api/weather/locations')))
  const limited = responses.filter(res => res.status() === 429)
  expect(limited.length).toBeGreaterThan(0)
  for (const res of limited.slice(0, 5)) {
    expect(res.headers()['content-type']).toContain('application/json')
    expect(res.headers()['retry-after']).toBe('10')
    expect(res.headers()['x-content-type-options']).toBe('nosniff')
    expect(await res.json()).toEqual({ error: 'rate_limited' })
  }
})

test('validation errors carry a stable code and a readable message', async ({ request, baseURL }) => {
  const origin = new URL(baseURL).origin
  const outOfRange = await request.post('/api/weather/speed', { headers: { Origin: origin }, data: { value: 0 } })
  expect(outOfRange.status()).toBe(400)
  expect(await outOfRange.json()).toEqual({ error: 'out_of_range', message: 'value must be between 0.5 and 50' })
  const unknown = await request.post('/api/grid/inject', {
    headers: { Origin: origin }, data: { lat: 1, lon: 1, type: 'meteor' },
  })
  expect((await unknown.json()).error).toBe('unknown_event_type')
  const foreign = await request.post('/api/weather/speed', { headers: { Origin: 'https://evil.example' }, data: { value: 1 } })
  expect(await foreign.json()).toEqual({ error: 'forbidden_origin' })
})

test('city search rejects junk and proxies real queries', async ({ request }) => {
  expect((await request.get('/api/weather/search?q=')).status()).toBe(400)
  const res = await request.get('/api/weather/search?q=bucuresti')
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(JSON.stringify(body)).toContain('Bucuresti')
})

test('error reports are accepted from the site only', async ({ request, baseURL }) => {
  const origin = new URL(baseURL).origin
  const report = { kind: 'error', message: 'edge probe', source: '/assets/index-x.js', line: 1, col: 2 }
  expect((await request.post('/api/client-errors', { headers: { Origin: origin }, data: report })).status()).toBe(204)
  expect((await request.post('/api/client-errors', {
    headers: { Origin: 'https://evil.example' }, data: report,
  })).status()).toBe(403)
  expect((await request.post('/api/client-errors', {
    headers: { Origin: origin, 'Content-Type': 'text/plain' }, data: JSON.stringify(report),
  })).status()).toBe(415)
  const invalid = await request.post('/api/client-errors', { headers: { Origin: origin }, data: { kind: 'nope', message: 'x' } })
  expect(invalid.status()).toBe(400)
  expect(await invalid.json()).toEqual({ error: 'invalid_report' })
  expect((await request.post('/api/client-errors', {
    headers: { Origin: origin }, data: { ...report, stack: 'x'.repeat(20_000) },
  })).status()).toBe(413)
})
