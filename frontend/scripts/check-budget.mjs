#!/usr/bin/env node
// Performance budget for a production build.
//
//   node scripts/check-budget.mjs <dist-dir>
//
// Sizes are measured the way visitors receive them: gzip at nginx's level 5
// for code and markup, raw bytes for images (already compressed). "Initial"
// is what index.html loads before the splash can go away: the entry script,
// its modulepreloads and the stylesheet. The 3D globe, dialogs and popups are
// lazy chunks and count only toward the total.
//
// Raising a budget is a deliberate, reviewed change to this file. Exits 1 when
// anything is over budget. With GITHUB_STEP_SUMMARY set, the table is also
// written to the CI job summary.
import { appendFileSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

// Kilobytes (1000 bytes). Current values are in the CI summary; leave
// headroom of roughly 10% so routine changes pass.
export const BUDGET = {
  'initial JS (gzip)': 100,
  'initial CSS (gzip)': 8,
  'index.html (gzip)': 4,
  'all JS (gzip)': 420,
  'largest JS chunk (gzip)': 200,
  'textures (raw)': 340,
  'icons and social image (raw)': 160,
}

const gzipSize = bytes => gzipSync(bytes, { level: 5 }).length
const brotliSize = bytes => brotliCompressSync(bytes, {
  params: { [constants.BROTLI_PARAM_QUALITY]: 5 },
}).length

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

// Paths index.html loads up front: module script, modulepreloads, stylesheets.
export function initialAssets(html) {
  const paths = new Set()
  const tags = html.match(/<(script|link)\b[^>]*>/g) ?? []
  for (const tag of tags) {
    const src = /\s(?:src|href)="(\/assets\/[^"]+)"/.exec(tag)?.[1]
    if (!src) continue
    const isModule = tag.startsWith('<script') && /type="module"/.test(tag)
    const isPreload = /rel="modulepreload"/.test(tag)
    const isStyle = /rel="stylesheet"/.test(tag)
    if (isModule || isPreload || isStyle) paths.add(src.slice(1))
  }
  return paths
}

// files: [{ path (relative to dist, "/"-separated), bytes: Buffer }]
export function measure(files) {
  const html = files.find(f => f.path === 'index.html')
  if (!html) throw new Error('index.html not found in the build')
  const initial = initialAssets(html.bytes.toString('utf8'))
  for (const path of initial) {
    if (!files.some(f => f.path === path)) throw new Error(`index.html references a missing file: ${path}`)
  }

  const js = files.filter(f => f.path.startsWith('assets/') && f.path.endsWith('.js'))
  const css = files.filter(f => f.path.startsWith('assets/') && f.path.endsWith('.css'))
  const sum = (list, size) => list.reduce((total, f) => total + size(f.bytes), 0)
  const raw = bytes => bytes.length
  const largest = js.reduce((best, f) => {
    const size = gzipSize(f.bytes)
    return size > best.size ? { path: f.path, size } : best
  }, { path: null, size: 0 })

  const initialJs = js.filter(f => initial.has(f.path))
  const initialCss = css.filter(f => initial.has(f.path))
  const images = /\.(png|jpe?g|webp|avif|svg)$/
  const textures = files.filter(f => f.path.startsWith('textures/'))
  const icons = files.filter(f => images.test(f.path) && !f.path.startsWith('textures/') && !f.path.startsWith('assets/'))

  return [
    { name: 'initial JS (gzip)', bytes: sum(initialJs, gzipSize), brotli: sum(initialJs, brotliSize), files: initialJs.map(f => f.path) },
    { name: 'initial CSS (gzip)', bytes: sum(initialCss, gzipSize), brotli: sum(initialCss, brotliSize), files: initialCss.map(f => f.path) },
    { name: 'index.html (gzip)', bytes: gzipSize(html.bytes), brotli: brotliSize(html.bytes), files: ['index.html'] },
    { name: 'all JS (gzip)', bytes: sum(js, gzipSize), brotli: sum(js, brotliSize), files: [`${js.length} chunks`] },
    { name: 'largest JS chunk (gzip)', bytes: largest.size, brotli: null, files: largest.path ? [largest.path] : [] },
    { name: 'textures (raw)', bytes: sum(textures, raw), brotli: null, files: textures.map(f => f.path) },
    { name: 'icons and social image (raw)', bytes: sum(icons, raw), brotli: null, files: [`${icons.length} files`] },
  ]
}

export function evaluate(rows, budget = BUDGET) {
  return rows.map(row => {
    const limitKB = budget[row.name]
    if (limitKB === undefined) throw new Error(`no budget for "${row.name}"`)
    return { ...row, limitKB, ok: row.bytes <= limitKB * 1000 }
  })
}

const kb = bytes => (bytes / 1000).toFixed(1)

export function formatTable(results, { markdown = false } = {}) {
  const header = ['Metric', 'Size (KB)', 'Brotli (KB)', 'Budget (KB)', 'Used', '']
  const lines = results.map(r => [
    r.name, kb(r.bytes), r.brotli === null ? '—' : kb(r.brotli), String(r.limitKB),
    `${Math.round((r.bytes / (r.limitKB * 1000)) * 100)}%`, r.ok ? 'ok' : 'OVER',
  ])
  if (markdown) {
    return [
      `| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`,
      ...lines.map(l => `| ${l.join(' | ')} |`),
    ].join('\n')
  }
  const widths = header.map((h, i) => Math.max(h.length, ...lines.map(l => l[i].length)))
  const pad = row => row.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join('  ')
  return [pad(header), ...lines.map(pad)].join('\n')
}

function main(dist) {
  if (!dist) {
    console.error('usage: check-budget.mjs <dist-dir>')
    process.exit(2)
  }
  const files = walk(dist).map(path => ({
    path: relative(dist, path).split(/[\\/]/).join('/'),
    bytes: readFileSync(path),
  }))
  const results = evaluate(measure(files))
  console.log(formatTable(results))
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Frontend performance budget\n\n${formatTable(results, { markdown: true })}\n`)
  }
  const over = results.filter(r => !r.ok)
  if (over.length) {
    console.error(`\nOver budget: ${over.map(r => `${r.name} ${kb(r.bytes)} KB > ${r.limitKB} KB (${r.files.join(', ')})`).join('; ')}`)
    console.error('Shrink the change, lazy-load it, or raise the budget in scripts/check-budget.mjs on purpose.')
    process.exit(1)
  }
  console.log('\nAll within budget.')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv[2])
