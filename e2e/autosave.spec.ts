import { expect, test } from '@playwright/test'
import { go, openDemo, pageErrors, quickOpen } from './helpers'

test.describe('Automatisch speichern', () => {
  test.skip(({ isMobile }) => isMobile, 'Tastatur-Ablauf auf Desktop/Tablet')
  test.afterEach(({ page }) => expect(pageErrors(page)).toEqual([]))

  test('ist an – ausgeschaltet wartet die App auf ⌘S', async ({ page }) => {
    await openDemo(page)
    await go(page, '#/settings')
    const toggle = page.getByRole('switch', { name: 'Automatisch speichern' })
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')

    await quickOpen(page, 'Entwurf')
    await page.getByRole('button', { name: 'Block hinzufügen' }).last().click()
    await page.keyboard.type('Noch nicht gespeichert')
    await page.keyboard.press('Escape')
    const unsaved = page.getByRole('button', { name: /ungespeichert – Speichern/ })
    await expect(unsaved).toBeVisible()
    await page.keyboard.press('ControlOrMeta+s')
    await expect(page.getByText(/Seite\(n\) gespeichert/)).toBeVisible()
    await expect(unsaved).toHaveCount(0)

    // Switching it back on writes right away again.
    await go(page, '#/settings')
    await page.getByRole('switch', { name: 'Automatisch speichern' }).click()
    await expect(page.getByRole('switch', { name: 'Automatisch speichern' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })
})
