// Screenshots for the README from the demo vault: `node scripts/screenshots.mjs`.
// Builds the app in the screenshot mode (the demo without "Demo" labels, see SCREENSHOT_MODE) into
// dist-screenshots/, starts `vite preview` on it, freezes the clock and writes PNGs to docs/images/.
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const PORT = 4174
const BASE = `http://localhost:${PORT}`
const OUT = new URL('../docs/images/', import.meta.url).pathname
const SHOTS = [
  // Dark is the default look of the README; the grid alternates with light.
  ['dashboard', '/#/p/Studium.md', 'dark'],
  ['semester', '/#/semester', 'dark'],
  ['vorlagen', '/#/templates', 'light'],
  ['einstellungen', '/#/settings', 'dark'],
  ['hell', '/#/p/Studium.md', 'light'],
]

const DIST = 'dist-screenshots'
execFileSync('npx', ['vite', 'build', '--mode', 'screenshots', '--outDir', DIST], { stdio: 'inherit' })
const server = spawn('npx', ['vite', 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
})
try {
  for (let i = 0; i < 50; i++) {
    if (
      await fetch(BASE).then(
        (r) => r.ok,
        () => false,
      )
    )
      break
    await new Promise((r) => setTimeout(r, 200))
  }
  const browser = await chromium.launch()
  const welcome = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
  })
  await welcome.goto(BASE + '/')
  await welcome.waitForTimeout(600)
  await welcome.screenshot({ path: `${OUT}willkommen.png` })
  await welcome.close()
  {
    for (const [name, hash, scheme] of SHOTS) {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        colorScheme: scheme,
      })
      await page.clock.setFixedTime(new Date('2026-10-14T10:00:00+02:00'))
      await page.goto(BASE + '/')
      await page.getByRole('button', { name: /Demo/ }).click()
      await page.waitForTimeout(800)
      // The demo lives in memory: switch pages by hash, never reload.
      await page.evaluate((h) => (location.hash = h.slice(1)), hash)
      await page.waitForTimeout(1200)
      await page.screenshot({ path: `${OUT}${name}.png` })
      await page.close()
    }
  }
  // Light and dark in one picture: the same dashboard, split slightly slanted in the middle.
  const split = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const img = (name) => `data:image/png;base64,${readFileSync(`${OUT}${name}.png`).toString('base64')}`
  await split.setContent(`<style>
    body { margin: 0 }
    img { position: absolute; inset: 0; width: 1440px; height: 900px }
    .light { clip-path: polygon(0 0, 54% 0, 46% 100%, 0 100%) }
    .line { position: absolute; inset: 0; background: rgba(255,255,255,.55);
      clip-path: polygon(53.9% 0, 54.1% 0, 46.1% 100%, 45.9% 100%) }
  </style><img src="${img('dashboard')}"><img class="light" src="${img('hell')}"><div class="line"></div>`)
  await split.waitForTimeout(300)
  await split.screenshot({ path: `${OUT}hell-dunkel.png` })
  await split.close()
  await browser.close()
} finally {
  server.kill()
}
