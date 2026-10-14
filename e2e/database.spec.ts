import { expect, test } from '@playwright/test'
import { openDemo, pageErrors, pageTitle, go, peek, peekTitle } from './helpers'

test.describe('Datenbanken', () => {
  test.beforeEach(async ({ page }) => openDemo(page))
  test.afterEach(({ page }) => expect(pageErrors(page)).toEqual([]))

  test('wechselt zwischen allen Ansichten', async ({ page }) => {
    await go(page, '/#/p/Studium%2FAufgaben.md')
    await expect(await pageTitle(page)).toHaveValue('Aufgaben')
    for (const view of ['Board', 'Diese Woche', 'Kalender', 'Tabelle']) {
      await page.getByRole('tab', { name: view }).click()
      await expect(page.getByRole('tab', { name: view })).toHaveAttribute('aria-selected', 'true')
    }
    await expect(page.getByRole('row', { name: /Übungsblatt 3 LA/ })).toBeVisible()
    await page.getByRole('tab', { name: 'Kalender' }).click()
    await expect(page.getByRole('button', { name: /Übungsblatt 3 LA/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Oktober 2026' })).toBeVisible()
  })

  test('legt Einträge an und ändert Eigenschaften', async ({ page }) => {
    await go(page, '/#/p/Studium%2FAufgaben.md')
    // The dashboard embeds the same database: wait until the page switched before clicking tabs.
    await expect(await pageTitle(page)).toHaveValue('Aufgaben')
    await page.getByRole('tab', { name: 'Tabelle' }).click()
    await page.getByRole('button', { name: 'Neu', exact: true }).click()
    const title = peekTitle(page)
    await expect(title).toHaveValue('Unbenannt')
    await title.fill('Altklausur rechnen')
    await title.press('Enter')
    await peek(page).getByRole('button', { name: 'Priorität Bearbeiten' }).click()
    await page.getByRole('option', { name: 'Hoch' }).click()
    await peek(page).getByRole('button', { name: 'Schließen' }).click()
    await expect(page.getByRole('row', { name: /Altklausur rechnen/ })).toContainText('Hoch')
  })

  test('filtert eine Ansicht', async ({ page }) => {
    await go(page, '/#/p/Studium%2FModule.md')
    await page.getByRole('tab', { name: 'Tabelle' }).click()
    await expect(page.getByRole('row')).toHaveCount(6)
    await page.getByRole('button', { name: /^Filter/ }).click()
    await page.getByRole('button', { name: 'Filter hinzufügen' }).click()
    const dialog = page.getByRole('dialog', { name: 'Filter' })
    await dialog.getByRole('combobox', { name: 'Eigenschaften' }).selectOption('Status')
    await dialog.getByRole('textbox', { name: 'Wert' }).fill('Bestanden')
    await dialog.getByRole('textbox', { name: 'Wert' }).blur()
    await expect(page.getByRole('row')).toHaveCount(3)
  })

  test('verschiebt Karten im Board per Drag & Drop', async ({ page, isMobile }) => {
    test.skip(isMobile, 'HTML-Drag-and-Drop gibt es auf Touch-Geräten nicht')
    await go(page, '/#/p/Studium%2FAufgaben.md')
    await page.getByRole('tab', { name: 'Board' }).click()
    const card = page.getByRole('article', { name: 'Projektidee SE abstimmen' })
    await card.dragTo(page.getByRole('region', { name: 'Erledigt' }))
    await expect(page.getByRole('region', { name: 'Erledigt' })).toContainText('Projektidee SE abstimmen')
  })

  test('fügt eine Eigenschaft mit Formel hinzu', async ({ page }) => {
    await go(page, '/#/p/Studium%2FModule.md')
    await page.getByRole('tab', { name: 'Tabelle' }).click()
    await page.getByRole('button', { name: 'Eigenschaft hinzufügen' }).click()
    await page.getByPlaceholder('Name der Eigenschaft').fill('Punkte')
    await page.keyboard.press('Enter')
    await page.getByRole('columnheader', { name: /Punkte/ }).click()
    const menu = page.getByRole('dialog', { name: 'Punkte' })
    await menu.getByRole('combobox').first().selectOption('formula')
    await menu.getByRole('textbox').nth(1).fill('ECTS * 30')
    await menu.getByRole('textbox').nth(1).blur()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('row', { name: /Analysis I/ })).toContainText('270')
  })
})
