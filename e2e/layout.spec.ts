import { expect, test, type Page } from '@playwright/test'
import { guard, isMobile, openDemo, pageErrors, showSidebar, go } from './helpers'

const SCREENS: Array<[string, string]> = [
  ['dashboard', '/#/p/Studium.md'],
  ['database', '/#/p/Studium%2FModule.md'],
  ['row', '/#/p/Studium%2FModule%2FAnalysis%20I.md'],
  ['templates', '/#/templates'],
  ['settings', '/#/settings'],
  ['trash', '/#/trash'],
]

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement
    const main = document.getElementById('main')
    return { page: doc.scrollWidth - doc.clientWidth, main: main ? main.scrollWidth - main.clientWidth : 0 }
  })
  expect(overflow.page, 'page scrolls horizontally').toBeLessThanOrEqual(0)
  expect(overflow.main, 'main area scrolls horizontally').toBeLessThanOrEqual(0)
}

test.describe('Layout', () => {
  test.afterEach(({ page }) => expect(pageErrors(page)).toEqual([]))

  test('Willkommen-Bildschirm', async ({ page }) => {
    await guard(page)
    await page.goto('/')
    await expectNoHorizontalOverflow(page)
    await expect(page).toHaveScreenshot('welcome.png')
  })

  for (const [name, url] of SCREENS) {
    test(`kein horizontaler Überlauf: ${name}`, async ({ page }) => {
      await openDemo(page)
      await go(page, url)
      await expect(page.locator('#main')).toBeVisible()
      await expectNoHorizontalOverflow(page)
    })
  }

  test('Dashboard-Screenshot', async ({ page }) => {
    await openDemo(page)
    await expect(page.getByRole('region', { name: 'Notenschnitt' })).toContainText('2,06')
    await expect(page).toHaveScreenshot('dashboard.png')
  })

  test('Dunkles Farbschema', async ({ page }) => {
    await openDemo(page)
    await go(page, '/#/settings')
    await page.getByRole('radio', { name: 'Dunkel' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await go(page, '/#/p/Studium.md')
    await expect(page.getByRole('region', { name: 'Notenschnitt' })).toContainText('2,06')
    await expect(page).toHaveScreenshot('dashboard-dark.png')
  })

  test('Seitenleiste: fest auf Desktop, Schublade auf kleinen Bildschirmen', async ({ page }) => {
    await openDemo(page)
    const nav = page.getByRole('navigation', { name: 'Seiten' })
    if (isMobile(page)) {
      await expect(nav).toBeHidden()
      await showSidebar(page)
      await expect(nav).toBeVisible()
      await nav.getByRole('button', { name: 'Willkommen' }).click()
      await expect(nav).toBeHidden()
    } else {
      await expect(nav).toBeVisible()
      await page.keyboard.press('ControlOrMeta+\\')
      await expect(nav).toBeHidden()
    }
  })

  test('Kacheln: Spalten passen sich der Breite an', async ({ page }) => {
    await openDemo(page)
    const tiles = page.locator('.tiles').first()
    const columns = await tiles.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
    expect(columns).toBe(isMobile(page) ? 2 : 4)
  })

  test('Touch-Ziele sind groß genug (mobil)', async ({ page }) => {
    test.skip(!isMobile(page), 'nur mobil')
    await openDemo(page)
    // WCAG 2.2 (2.5.8): visible targets at least 24×24 px.
    const small = await page.locator('#main button, nav button').evaluateAll((els) =>
      els
        .filter((el) => el.checkVisibility() && !el.closest('.md'))
        .map((el) => ({
          label: el.getAttribute('aria-label') ?? el.textContent?.trim(),
          ...el.getBoundingClientRect().toJSON(),
        }))
        .filter((r) => r.width > 0 && (r.width < 24 || r.height < 24))
        .map((r) => `${r.label} ${Math.round(r.width)}×${Math.round(r.height)}`),
    )
    expect(small).toEqual([])
  })
})
