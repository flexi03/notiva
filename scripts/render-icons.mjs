// Renders public/icon.svg to the PNG sizes needed by the PWA manifest and app bundles.
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

const svg = readFileSync('public/icon.svg', 'utf8')
const browser = await chromium.launch()
for (const size of [192, 512, 1024]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}</style>${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}`,
  )
  await page.screenshot({
    path: size === 1024 ? 'build/icon.png' : `public/icon-${size}.png`,
    omitBackground: true,
  })
}
await browser.close()
