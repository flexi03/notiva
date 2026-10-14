import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { guard, openDemo, go } from './helpers'

const PAGES = [
  '/#/p/Studium.md',
  '/#/p/Studium%2FModule.md',
  '/#/p/Willkommen.md',
  '/#/settings',
  '/#/templates',
]

test.describe('Barrierefreiheit (axe)', () => {
  test.skip(({ isMobile }) => isMobile, 'einmal pro Layout genügt')

  test('Willkommen', async ({ page }) => {
    await guard(page)
    await page.goto('/')
    const result = await new AxeBuilder({ page }).analyze()
    expect(
      result.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id}: ${v.nodes.length}`),
    ).toEqual([])
  })

  for (const url of PAGES) {
    test(url, async ({ page }) => {
      await openDemo(page)
      await go(page, url)
      await expect(page.locator('#main')).toBeVisible()
      const result = await new AxeBuilder({ page }).exclude('.katex').analyze()
      const serious = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      expect(
        serious.map(
          (v) =>
            `${v.id}: ${v.nodes
              .slice(0, 3)
              .map((n) => n.target.join(' '))
              .join(' | ')}`,
        ),
      ).toEqual([])
    })
  }
})
