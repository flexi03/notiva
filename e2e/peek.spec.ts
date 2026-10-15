import { expect, test } from '@playwright/test'
import { go, isMobile, openDemo, pageErrors, pageTitle, peek, peekTitle } from './helpers'

test.describe('Vorschau (Peek)', () => {
  test.beforeEach(async ({ page }) => openDemo(page))
  test.afterEach(({ page }) => expect(pageErrors(page)).toEqual([]))

  test('Karte öffnet als Vorschau, Änderungen erscheinen sofort dahinter', async ({ page }) => {
    await go(page, '/#/p/Studium%2FAufgaben.md')
    await page.getByRole('tab', { name: 'Board' }).click()
    await page
      .getByRole('article', { name: 'Projektidee SE abstimmen' })
      .click({ position: { x: 20, y: 70 } })
    await expect(peekTitle(page)).toHaveValue('Projektidee SE abstimmen')
    await expect(peek(page)).toContainText('Aufgaben / Projektidee SE abstimmen')
    // The page behind stays where it was.
    await expect(await pageTitle(page)).toHaveValue('Aufgaben')
    await peekTitle(page).fill('SE-Projekt abstimmen')
    await peekTitle(page).press('Enter')
    await expect(page.locator('#main').getByRole('article', { name: 'SE-Projekt abstimmen' })).toBeVisible()
    await expect(peek(page)).toContainText('Aufgaben / SE-Projekt abstimmen')
    await page.keyboard.press('Escape')
    await expect(peek(page)).toHaveCount(0)
  })

  test('Escape im Editor beendet erst das Bearbeiten, dann die Vorschau', async ({ page }) => {
    await go(page, '/#/p/Studium%2FAufgaben.md')
    await page.getByRole('tab', { name: 'Tabelle' }).click()
    await page
      .getByRole('row', { name: /Übungsblatt 3 LA/ })
      .getByRole('button', { name: 'Übungsblatt 3 LA' })
      .click()
    await peek(page).getByText('Aufgabe 1').click()
    await expect(peek(page).getByRole('textbox', { name: /Befehle/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(peek(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(peek(page)).toHaveCount(0)
  })

  test('⌘/Strg-Klick öffnet die ganze Seite', async ({ page }) => {
    test.skip(isMobile(page), 'keine Tastatur')
    await go(page, '/#/p/Studium%2FAufgaben.md')
    await page.getByRole('tab', { name: 'Tabelle' }).click()
    await page
      .getByRole('row', { name: /Übungsblatt 3 LA/ })
      .getByRole('button', { name: 'Übungsblatt 3 LA' })
      .click({ modifiers: ['ControlOrMeta'] })
    await expect(peek(page)).toHaveCount(0)
    await expect(await pageTitle(page)).toHaveValue('Übungsblatt 3 LA')
  })

  test('Einstellung „Als ganze Seite“ schaltet die Vorschau ab', async ({ page }) => {
    await go(page, '/#/settings/editor')
    await page
      .getByRole('radiogroup', { name: 'Einträge und Karten öffnen' })
      .getByRole('radio', { name: 'Als ganze Seite' })
      .click()
    await go(page, '/#/p/Studium.md')
    await page
      .getByRole('region', { name: 'Diese Woche fällig' })
      .getByRole('button', { name: /Übungsblatt 3 LA/ })
      .click()
    await expect(peek(page)).toHaveCount(0)
    await expect(await pageTitle(page)).toHaveValue('Übungsblatt 3 LA')
  })

  test('Löschen aus der Vorschau schließt sie', async ({ page }) => {
    await go(page, '/#/p/Studium%2FAufgaben.md')
    await page.getByRole('tab', { name: 'Tabelle' }).click()
    await page
      .getByRole('row', { name: /ER-Modell/ })
      .getByRole('button', { name: 'ER-Modell entwerfen' })
      .click()
    await peek(page).getByRole('button', { name: 'Mehr' }).click()
    await page.getByRole('menuitem', { name: 'In den Papierkorb' }).click()
    await expect(peek(page)).toHaveCount(0)
    await expect(page.getByRole('row', { name: /ER-Modell/ })).toHaveCount(0)
  })
})

test.describe('Seitenrand: Minimap und Fortschritt', () => {
  test.beforeEach(async ({ page }) => openDemo(page))
  test.afterEach(({ page }) => expect(pageErrors(page)).toEqual([]))

  test('Minimap zeigt Überschriften, springt dorthin und zeigt Fortschritt', async ({ page }) => {
    test.skip(isMobile(page), 'auf schmalen Bildschirmen gibt es nur den Fortschrittsbalken')
    await page.setViewportSize({ width: 1440, height: 520 })
    await go(page, '/#/p/Willkommen.md')
    const rail = page.getByRole('navigation', { name: 'Minimap' })
    await expect(rail).toBeVisible()
    await expect(rail.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
    await expect(rail).toContainText('1/2')
    await rail.getByRole('button', { name: 'Springe zu „Was Markdown hier kann“' }).click()
    await expect
      .poll(async () => Number(await rail.getByRole('progressbar').getAttribute('aria-valuenow')))
      .toBeGreaterThan(0)
  })

  test('Minimap zeichnet die Seite im Detail', async ({ page }) => {
    test.skip(isMobile(page), 'auf schmalen Bildschirmen gibt es nur den Fortschrittsbalken')
    await go(page, '/#/p/Willkommen.md')
    const canvas = page.getByTestId('minimap').locator('canvas')
    await expect(canvas).toBeVisible()
    // Many separate painted rows = text lines, not just a few block outlines.
    await expect
      .poll(() =>
        canvas.evaluate((el: HTMLCanvasElement) => {
          const ctx = el.getContext('2d')!
          const { data, width, height } = ctx.getImageData(0, 0, el.width, el.height)
          let rows = 0
          let inRow = false
          for (let y = 0; y < height; y++) {
            let painted = false
            for (let x = 0; x < width && !painted; x++) painted = data[(y * width + x) * 4 + 3]! > 0
            if (painted && !inRow) rows++
            inRow = painted
          }
          return rows
        }),
      )
      .toBeGreaterThan(12)
  })

  test('Klick in die Minimap scrollt die Seite', async ({ page }) => {
    test.skip(isMobile(page), 'auf schmalen Bildschirmen gibt es nur den Fortschrittsbalken')
    await page.setViewportSize({ width: 1440, height: 700 })
    await go(page, '/#/p/Studium.md')
    const map = page.getByTestId('minimap')
    await expect(map).toBeVisible()
    const box = (await map.boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 2)
    await expect.poll(() => page.locator('#main').evaluate((el) => el.scrollTop)).toBeGreaterThan(300)
  })

  test('auf schmalen Bildschirmen nur ein Fortschrittsbalken', async ({ page }) => {
    test.skip(!isMobile(page), 'nur mobil')
    await go(page, '/#/p/Willkommen.md')
    await expect(page.getByRole('navigation', { name: 'Minimap' })).toHaveCount(0)
  })
})
