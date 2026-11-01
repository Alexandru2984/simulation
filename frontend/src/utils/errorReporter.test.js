import assert from 'node:assert/strict'
import test from 'node:test'
import { buildIdFromUrl, buildReport, createErrorReporter, scrubUrls } from './errorReporter.js'

const ORIGIN = 'https://simulation.micutu.com'

test('reports carry the error, a scrubbed stack and the build', () => {
  const error = new TypeError('x is undefined')
  error.stack = `TypeError: x is undefined\n    at f (${ORIGIN}/assets/index-AbC.js:1:2345)\n    at ${ORIGIN}/#lat=44.43&lon=26.10`
  const report = buildReport('error', error, {
    origin: ORIGIN, build: 'index-AbC', source: `${ORIGIN}/assets/index-AbC.js?x=1`, line: 1, col: 2345,
  })
  assert.equal(report.kind, 'error')
  assert.equal(report.message, 'TypeError: x is undefined')
  assert.match(report.stack, /at f \(\/assets\/index-AbC\.js:1:2345\)/)
  assert.doesNotMatch(report.stack, /lat=|simulation\.micutu\.com/, 'no viewed coordinates, no origin')
  assert.equal(report.source, '/assets/index-AbC.js')
  assert.equal(report.line, 1)
  assert.equal(report.col, 2345)
  assert.equal(report.build, 'index-AbC')
})

test('foreign URLs keep their origin but lose queries and fragments', () => {
  assert.equal(scrubUrls('at https://cdn.example/lib.js?token=secret#x', ORIGIN), 'at https://cdn.example/lib.js')
  assert.equal(scrubUrls('wss://simulation.micutu.com/ws/grid?format=bin2 failed', ORIGIN), '/ws/grid failed')
})

test('noise and extension errors are not reported', () => {
  assert.equal(buildReport('error', 'Script error.', { origin: ORIGIN }), null)
  assert.equal(buildReport('error', 'ResizeObserver loop completed with undelivered notifications.', { origin: ORIGIN }), null)
  assert.equal(buildReport('rejection', new DOMException('The user aborted a request.', 'AbortError'), { origin: ORIGIN }), null)
  const fromExtension = new Error('boom')
  fromExtension.stack = 'Error: boom\n    at chrome-extension://abcdef/content.js:1:1'
  assert.equal(buildReport('error', fromExtension, { origin: ORIGIN }), null)
  assert.equal(buildReport('error', 'boom', { origin: ORIGIN, source: 'moz-extension://x/y.js' }), null)
})

test('non-Error rejection values are described, long text is bounded', () => {
  assert.equal(buildReport('rejection', { code: 42 }, { origin: ORIGIN }).message, 'Non-error value: {"code":42}')
  assert.equal(buildReport('rejection', undefined, { origin: ORIGIN }).message, 'Non-error value: undefined')
  const cyclic = {}
  cyclic.self = cyclic
  assert.match(buildReport('rejection', cyclic, { origin: ORIGIN }).message, /Non-error value: \[object Object\]/)
  const long = buildReport('error', 'y'.repeat(1000), { origin: ORIGIN })
  assert.equal(long.message.length, 300)
  assert.ok(long.message.endsWith('…'))
})

test('render errors include the component stack', () => {
  const report = buildReport('render', new Error('bad prop'), { origin: ORIGIN, componentStack: '\n    at Globe\n    at App' })
  assert.match(report.stack, /Component stack:\n {4}at Globe/)
})

test('the reporter sends each distinct error once and caps a page load', () => {
  const sent = []
  const reporter = createErrorReporter({ send: r => sent.push(r), origin: ORIGIN, build: 'index-1', maxReports: 3 })
  assert.equal(reporter.report('error', new Error('a')), true)
  assert.equal(reporter.report('error', new Error('a')), false, 'duplicate')
  reporter.report('error', new Error('b'))
  reporter.report('rejection', new Error('a'))
  assert.equal(reporter.report('error', new Error('c')), false, 'over the cap')
  assert.deepEqual(sent.map(r => `${r.kind}:${r.message}`), ['error:a', 'error:b', 'rejection:a'])
  assert.ok(sent.every(r => r.build === 'index-1'))
})

test('a failing transport never throws into the caller', () => {
  const reporter = createErrorReporter({ send: () => { throw new Error('offline') }, origin: ORIGIN })
  assert.doesNotThrow(() => reporter.report('error', new Error('x')))
})

test('the build id is the hashed entry bundle name', () => {
  assert.equal(buildIdFromUrl(`${ORIGIN}/assets/index-BX3k9a_Z.js`), 'index-BX3k9a_Z')
  assert.equal(buildIdFromUrl('/src/main.jsx'), undefined)
  assert.equal(buildIdFromUrl(undefined), undefined)
})
