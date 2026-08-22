/**
 * Capture README screenshots from the running dev server (http://localhost:3000)
 * into docs/screenshots/. Dev-only helper; not part of the app.
 *
 *   npm run dev        # in one terminal
 *   node scripts/shots.mjs
 */
import { chromium } from 'playwright-core'
import { mkdirSync, existsSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { homedir } from 'node:os'

const OUT = resolve(process.cwd(), 'docs', 'screenshots')
mkdirSync(OUT, { recursive: true })

// Locate the chromium that `npx playwright install chromium` downloaded.
function findChromium() {
  const base = join(homedir(), 'AppData', 'Local', 'ms-playwright')
  if (!existsSync(base)) return undefined
  const dir = readdirSync(base).find((d) => d.startsWith('chromium-') && !d.includes('headless'))
  if (!dir) return undefined
  for (const rel of [['chrome-win64', 'chrome.exe'], ['chrome-win', 'chrome.exe'], ['chrome-linux', 'chrome']]) {
    const p = join(base, dir, ...rel)
    if (existsSync(p)) return p
  }
  return undefined
}

const browser = await chromium.launch({ executablePath: findChromium() })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const base = 'http://localhost:3000'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function shot(name) {
  await page.screenshot({ path: join(OUT, `${name}.png`) })
  console.log('  saved', `docs/screenshots/${name}.png`)
}

// 1. Landing
await page.goto(`${base}/`, { waitUntil: 'networkidle' })
await wait(1500)
await shot('landing')

// 2. Host (auction category cards)
await page.goto(`${base}/host`, { waitUntil: 'networkidle' })
await wait(1200)
await shot('host')

// 3. Fantasy demo — start a lot, let bots bid, show the big-screen board
await page.goto(`${base}/demo?mode=fantasy`, { waitUntil: 'networkidle' })
await wait(1200)
try {
  await page.getByRole('button', { name: /START NEXT ITEM/i }).click({ timeout: 4000 })
  await wait(3500)
  await page.getByRole('button', { name: /Big screen/i }).click({ timeout: 4000 })
  await wait(1200)
} catch (e) { console.log('  (fantasy interaction skipped:', e.message, ')') }
await shot('fantasy')

// 4. Auction big-screen (demo — no chain state needed)
await page.goto(`${base}/demo`, { waitUntil: 'networkidle' })
await wait(1200)
try {
  await page.getByRole('button', { name: /START NEXT ITEM/i }).click({ timeout: 4000 })
  await wait(3000)
  await page.getByRole('button', { name: /Big screen/i }).click({ timeout: 4000 })
  await wait(1200)
} catch (e) { console.log('  (auction interaction skipped:', e.message, ')') }
await shot('screen')

await browser.close()
console.log('done')
