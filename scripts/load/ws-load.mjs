#!/usr/bin/env node
// WebSocket load generator for the grid stream. Never point it at production.
//
//   node scripts/load/ws-load.mjs --url ws://127.0.0.1:18094/ws/grid?format=bin1 \
//     --origin http://127.0.0.1:18443 --clients 500 --ramp 100 --duration 30 --pid <backend pid>
//
// Opens --clients sockets at --ramp per second, holds them for --duration
// seconds and reports:
//   • accepted / rejected / dropped connections,
//   • delivery: frames received vs the 1 Hz the server promises,
//   • fan-out spread: for each tick, last arrival minus first arrival across
//     all clients (how long one broadcast takes to reach everyone),
//   • bandwidth, and the backend's CPU and RSS when --pid is given.
// Requires Node 22+ (global WebSocket). Prints one JSON summary on stdout.
import { readFileSync } from 'node:fs'
import { monitorEventLoopDelay } from 'node:perf_hooks'

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, arg, i, all) => {
  if (arg.startsWith('--')) acc.push([arg.slice(2), all[i + 1]?.startsWith('--') ? 'true' : all[i + 1]])
  return acc
}, []))
const url = args.url ?? 'ws://127.0.0.1:18094/ws/grid?format=bin1'
const origin = args.origin ?? 'http://127.0.0.1:18443'
const clients = Number(args.clients ?? 100)
const ramp = Number(args.ramp ?? 100)
const duration = Number(args.duration ?? 30)
const pid = args.pid ? Number(args.pid) : null
const settle = 3 // seconds after ramp-up before measuring

const percentile = (values, p) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}

function procSample() {
  if (!pid) return null
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    const ticks = Number(fields[11]) + Number(fields[12]) // utime + stime
    const rssKb = Number(readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)[1])
    return { at: performance.now(), ticks, rssKb }
  } catch {
    return null
  }
}

function tickOf(data) {
  if (typeof data === 'string') {
    const m = data.match(/"tick":(\d+)/)
    return m ? Number(m[1]) : null
  }
  const view = new DataView(data)
  if (view.byteLength < 8) return null
  const len = view.getUint32(4, true)
  const header = new TextDecoder().decode(new Uint8Array(data, 8, Math.min(len, 256)))
  const m = header.match(/"tick":(\d+)/)
  return m ? Number(m[1]) : null
}

const stats = { opened: 0, rejected: 0, dropped: 0, errors: 0, bytes: 0, frames: 0, closeCodes: {} }
const perClient = []
const arrivals = new Map() // tick → { first, last, count }
let measuring = false
const sockets = []

function open(i) {
  const ws = new WebSocket(url, { headers: { Origin: origin } })
  ws.binaryType = 'arraybuffer'
  const me = { frames: 0, open: false, closedEarly: false }
  perClient[i] = me
  ws.onopen = () => { me.open = true; stats.opened++ }
  ws.onmessage = ev => {
    const size = typeof ev.data === 'string' ? ev.data.length : ev.data.byteLength
    if (!measuring) return
    stats.bytes += size
    stats.frames++
    me.frames++
    const tick = tickOf(ev.data)
    if (tick === null) return
    const t = performance.now()
    const a = arrivals.get(tick)
    if (a) { a.last = t; a.count++ } else arrivals.set(tick, { first: t, last: t, count: 1 })
  }
  ws.onerror = () => { stats.errors++ }
  ws.onclose = ev => {
    if (!stopping) stats.closeCodes[ev.code] = (stats.closeCodes[ev.code] ?? 0) + 1
    // 1013 "Try Again Later": the server is full.
    if (!me.open || ev.code === 1013) stats.rejected++
    else if (!stopping) { stats.dropped++; me.closedEarly = true }
  }
  sockets.push(ws)
}

let stopping = false
const loopDelay = monitorEventLoopDelay({ resolution: 20 })
loopDelay.enable()

const sleep = ms => new Promise(r => setTimeout(r, ms))
const startedAt = performance.now()
for (let i = 0; i < clients; i++) {
  open(i)
  if ((i + 1) % ramp === 0) await sleep(1000)
}
await sleep(settle * 1000)

const before = procSample()
measuring = true
const measureStart = performance.now()
const rssPeak = { kb: before?.rssKb ?? 0 }
const sampler = setInterval(() => {
  const s = procSample()
  if (s) rssPeak.kb = Math.max(rssPeak.kb, s.rssKb)
}, 1000)
await sleep(duration * 1000)
measuring = false
clearInterval(sampler)
const after = procSample()
const elapsed = (performance.now() - measureStart) / 1000

stopping = true
for (const ws of sockets) ws.close()
loopDelay.disable()

const connected = perClient.filter(c => c.open && !c.closedEarly)
const rates = connected.map(c => c.frames / elapsed)
const spreads = [...arrivals.values()].filter(a => a.count > 1).map(a => a.last - a.first)
const hz = 100 // /proc clock ticks per second on Linux
const cpu = before && after ? ((after.ticks - before.ticks) / hz) / ((after.at - before.at) / 1000) : null

const summary = {
  target: { url, clients, ramp, duration },
  connections: {
    accepted: stats.opened, rejected: stats.rejected, dropped: stats.dropped, errors: stats.errors,
    closeCodes: stats.closeCodes,
  },
  delivery: {
    framesPerClientPerSecond: { p5: percentile(rates, 5), median: percentile(rates, 50) },
    clientsBelow90Percent: rates.filter(r => r < 0.9).length,
  },
  fanOutSpreadMs: { median: percentile(spreads, 50), p95: percentile(spreads, 95), max: percentile(spreads, 100) },
  bandwidth: {
    megabytesPerSecond: Number((stats.bytes / elapsed / 1e6).toFixed(2)),
    kilobytesPerClientPerSecond: connected.length ? Number((stats.bytes / elapsed / connected.length / 1e3).toFixed(1)) : null,
  },
  backend: pid ? {
    cpuCores: cpu === null ? null : Number(cpu.toFixed(3)),
    rssMb: after ? Math.round(after.rssKb / 1024) : null,
    rssPeakMb: Math.round(rssPeak.kb / 1024),
  } : null,
  generatorLoopDelayP99Ms: Number((loopDelay.percentile(99) / 1e6).toFixed(1)),
  wallSeconds: Number(((performance.now() - startedAt) / 1000).toFixed(1)),
}
console.log(JSON.stringify(summary, null, 2))
setTimeout(() => process.exit(0), 500)
