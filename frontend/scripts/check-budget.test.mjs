import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluate, formatTable, initialAssets, measure } from './check-budget.mjs'

const html = `<!doctype html><html><head>
<link rel="icon" href="/favicon.svg">
<link rel="preload" href="/textures/earth.webp" as="image">
<script type="module" crossorigin src="/assets/index-a.js"></script>
<link rel="modulepreload" crossorigin href="/assets/react-b.js">
<link rel="stylesheet" crossorigin href="/assets/index-c.css">
</head><body></body></html>`

const file = (path, size, fill = 'x') => ({ path, bytes: Buffer.from(fill.repeat(size)) })

test('initial assets are the entry script, its preloads and the stylesheet', () => {
  assert.deepEqual([...initialAssets(html)].sort(), ['assets/index-a.js', 'assets/index-c.css', 'assets/react-b.js'])
})

test('lazy chunks count toward the total but not the initial load', () => {
  const rows = measure([
    { path: 'index.html', bytes: Buffer.from(html) },
    file('assets/index-a.js', 1000),
    file('assets/react-b.js', 1000),
    file('assets/index-c.css', 500),
    file('assets/three-d.js', 50_000),
    file('textures/earth.webp', 2000),
    file('icons/icon-192.png', 300),
    file('og-image.jpg', 700),
  ])
  const byName = Object.fromEntries(rows.map(r => [r.name, r]))
  assert.deepEqual(byName['initial JS (gzip)'].files, ['assets/index-a.js', 'assets/react-b.js'])
  assert.ok(byName['all JS (gzip)'].bytes > byName['initial JS (gzip)'].bytes)
  assert.deepEqual(byName['largest JS chunk (gzip)'].files, ['assets/three-d.js'])
  assert.equal(byName['textures (raw)'].bytes, 2000)
  assert.equal(byName['icons and social image (raw)'].bytes, 1000)
})

test('a missing referenced file or index.html is an error, not a pass', () => {
  assert.throws(() => measure([file('assets/x.js', 10)]), /index\.html not found/)
  assert.throws(() => measure([{ path: 'index.html', bytes: Buffer.from(html) }]), /missing file: assets\/index-a\.js/)
})

test('anything over its budget fails and is flagged in the table', () => {
  const rows = [{ name: 'initial JS (gzip)', bytes: 120_000, brotli: 100_000, files: ['assets/index-a.js'] }]
  const [result] = evaluate(rows, { 'initial JS (gzip)': 100 })
  assert.equal(result.ok, false)
  assert.match(formatTable([result]), /OVER/)
  assert.match(formatTable([result], { markdown: true }), /^\| Metric \|/)
  assert.throws(() => evaluate([{ name: 'new metric', bytes: 1 }], {}), /no budget/)
})
