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
// iOS (ios/Notiva/Assets.xcassets): a full square without transparency – iOS rounds it itself.
const background = /<rect[^>]*fill="(#[0-9a-fA-F]{3,8})"/.exec(svg)?.[1] ?? '#2f5d50'
const ios = await browser.newPage({ viewport: { width: 1024, height: 1024 } })
await ios.setContent(
  `<style>html,body{margin:0;background:${background}}</style>${svg.replace('<svg ', '<svg width="1024" height="1024" ')}`,
)
await ios.screenshot({ path: 'ios/Notiva/Assets.xcassets/AppIcon.appiconset/icon-1024.png', omitBackground: false })
await browser.close()
