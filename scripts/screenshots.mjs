// Screenshots for the README from the demo vault: `npm run build && node scripts/screenshots.mjs`.
// Starts `vite preview`, freezes the clock and writes PNGs to docs/images/.
import { spawn } from 'node:child_process'
import { chromium } from '@playwright/test'

const PORT = 4174
const BASE = `http://localhost:${PORT}`
const OUT = new URL('../docs/images/', import.meta.url).pathname
const SHOTS = [
  // Dark is the default look of the README; the grid alternates with light.
  ['dashboard', '/#/p/Studium.md', 'dark'],
  ['datenbank', '/#/p/Studium%2FModule.md', 'light'],
  ['semester', '/#/semester', 'dark'],
  ['vorlagen', '/#/templates', 'light'],
  ['einstellungen', '/#/settings', 'dark'],
  ['hell', '/#/p/Studium.md', 'light'],
]

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
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
  await browser.close()
} finally {
  server.kill()
}
