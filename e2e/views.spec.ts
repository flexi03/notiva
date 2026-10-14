import { expect, test } from '@playwright/test'
import { isMobile, openDemo } from './helpers'

test.describe('KI und Änderungen links oder rechts', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1000) < 900, 'Werkzeugleisten nur auf breiten Bildschirmen')

  test('stehen standardmäßig links statt der Seitenliste', async ({ page }) => {
    await openDemo(page)
    const left = page.getByRole('navigation', { name: 'Werkzeugleiste', exact: true })
    // Right bar: notifications, then trash and settings.
    const rightBar = page.getByRole('navigation', { name: 'Werkzeugleiste rechts' })
    await expect(rightBar.getByRole('button')).toHaveCount(3)
    await expect(rightBar.getByRole('button', { name: 'Einstellungen' })).toBeVisible()
    await expect(rightBar.getByRole('button', { name: 'Benachrichtigungen' })).toBeVisible()
    await left.getByRole('button', { name: /KI-Assistent/ }).click()
    const assistant = page.getByRole('complementary', { name: 'Assistent' })
    await expect(assistant).toBeVisible()
    await expect(assistant).toHaveAttribute('data-side', 'left')
    await expect(page.getByRole('navigation', { name: 'Seiten' })).toHaveCount(0)
    await page.screenshot({ path: 'test-results/views-left.png' })
    // Back to the page tree.
    await left.getByRole('button', { name: 'Seiten' }).click()
    await expect(page.getByRole('navigation', { name: 'Seiten' })).toBeVisible()
    await expect(assistant).toHaveCount(0)
  })

  test('lassen sich per Drag & Drop auf die andere Seite ziehen und bleiben dort', async ({ page }) => {
    await openDemo(page)
    const left = page.getByRole('navigation', { name: 'Werkzeugleiste', exact: true })
    await left.getByRole('button', { name: /KI-Assistent/ }).click()
    // The right bar (drop target) only appears once the drag has started.
    await left.getByRole('button', { name: /KI-Assistent/ }).hover()
    await page.mouse.down()
    await page.mouse.move(300, 300, { steps: 5 })
    const target = page.locator('[data-activity="right"]')
    await expect(target).toContainText('Hier ablegen')
    await target.hover()
    await page.mouse.up()
    const right = page.getByRole('navigation', { name: 'Werkzeugleiste rechts' })
    await expect(right.getByRole('button', { name: /KI-Assistent/ })).toBeVisible()
    const assistant = page.getByRole('complementary', { name: 'Assistent' })
    await expect(assistant).toHaveAttribute('data-side', 'right')
    // The page tree is back on the left, the assistant stays open on the right.
    await expect(page.getByRole('navigation', { name: 'Seiten' })).toBeVisible()
    await page.screenshot({ path: 'test-results/views-right.png' })
    await page.reload()
    await page.getByRole('button', { name: /Demo ausprobieren/ }).click()
    await expect(
      page
        .getByRole('navigation', { name: 'Werkzeugleiste rechts' })
        .getByRole('button', { name: /KI-Assistent/ }),
    ).toBeVisible()
  })

  test('Knopf im Kopf verschiebt die Ansicht ohne Maus', async ({ page }) => {
    await openDemo(page)
    if (isMobile(page)) return
    await page.keyboard.press('ControlOrMeta+Shift+g')
    const git = page.getByRole('complementary', { name: 'Änderungen' })
    await expect(git).toHaveAttribute('data-side', 'left')
    await git.getByRole('button', { name: 'Nach rechts verschieben' }).click()
    await expect(page.getByRole('complementary', { name: 'Änderungen' })).toHaveAttribute(
      'data-side',
      'right',
    )
    await page
      .getByRole('complementary', { name: 'Änderungen' })
      .getByRole('button', { name: 'Nach links verschieben' })
      .click()
    await expect(page.getByRole('complementary', { name: 'Änderungen' })).toHaveAttribute('data-side', 'left')
  })
})
