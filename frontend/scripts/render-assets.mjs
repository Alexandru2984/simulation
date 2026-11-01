// Regenerates the PNG icons and the social preview image from the running
// app, using a headless Chromium. Not part of the build; run it by hand after
// changing the favicon or the look of the globe:
//
//   npm run build && npx vite preview --port 4173 &   # backend reachable via the proxy
//   npm i --no-save playwright-core
//   CHROME_PATH=/path/to/chrome node scripts/render-assets.mjs [http://127.0.0.1:4173]
//
// Outputs (in public/): icons/icon-192.png, icons/icon-512.png,
// icons/maskable-512.png, apple-touch-icon.png and og-image.jpg.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url))
const APP_URL = process.argv[2] ?? 'http://127.0.0.1:4173'
const svg = readFileSync(`${PUBLIC}favicon.svg`, 'utf8')

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})

async function icon(size, file, { maskable = false, background = null } = {}) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  // Maskable icons keep the artwork inside the central safe zone.
  const inner = maskable ? Math.round(size * 0.72) : size
  await page.setContent(`<body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${background ?? 'transparent'}">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body>`)
  await page.screenshot({ path: `${PUBLIC}${file}`, omitBackground: !background })
  await page.close()
}

await icon(192, 'icons/icon-192.png')
await icon(512, 'icons/icon-512.png')
await icon(512, 'icons/maskable-512.png', { maskable: true, background: '#0f172a' })
await icon(180, 'apple-touch-icon.png', { background: '#0f172a' })

const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.goto(`${APP_URL}/#lat=28&lon=12&layer=temp`)
await page.waitForSelector('.splash.is-hidden', { timeout: 30_000 })
await page.waitForTimeout(4000)
await page.addStyleTag({ content: `
  .topbar,.left-rail,.dock-bottom,.dock-bottom-right,.time-dock,.toasts,.banner,.globe-labels,.globe-tooltip{display:none!important}
  .globe-layer{transform:translateX(250px) scale(1.12)}
  #og{position:fixed;inset:0;z-index:99;display:flex;flex-direction:column;justify-content:center;gap:18px;padding:0 64px;
    background:linear-gradient(90deg,#030711 0%,rgba(3,7,17,.92) 38%,rgba(3,7,17,0) 62%);font-family:system-ui,sans-serif;color:#e2e8f0}
  #og h1{margin:0;font-size:64px;line-height:1.02;letter-spacing:-.02em;color:#fff;max-width:560px}
  #og p{margin:0;font-size:26px;line-height:1.35;color:#94a3b8;max-width:500px}
  #og .tags{display:flex;gap:10px;flex-wrap:wrap;max-width:520px}
  #og .tags span{padding:8px 14px;border-radius:999px;border:1px solid rgba(148,163,184,.3);background:rgba(15,23,42,.8);font-size:19px;font-weight:600}
  #og .url{margin-top:6px;font-size:22px;font-weight:700;color:#38bdf8}` })
await page.evaluate(() => {
  const card = document.createElement('div')
  card.id = 'og'
  card.innerHTML = '<h1>Live Weather Simulation</h1>' +
    '<p>A real-time 3D model of Earth’s atmosphere that everyone shares — and can change.</p>' +
    '<div class="tags"><span>🌡️ Temperature</span><span>💨 Wind</span><span>🌀 Storms</span><span>🔮 Forecasts</span></div>' +
    '<div class="url">simulation.micutu.com</div>'
  document.body.appendChild(card)
})
await page.waitForTimeout(500)
await page.screenshot({ path: `${PUBLIC}og-image.jpg`, type: 'jpeg', quality: 86 })
await browser.close()
