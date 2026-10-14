import { expect, test } from '@playwright/test'
import { openDemo, pageErrors, pageTitle, peek, peekTitle } from './helpers'

test.describe('Studien-Dashboard', () => {
  test.beforeEach(async ({ page }) => openDemo(page))
  test.afterEach(({ page }) => expect(pageErrors(page)).toEqual([]))

  test('zeigt berechnete Kacheln', async ({ page }) => {
    const tile = (name: string) => page.getByRole('region', { name })
    await expect(tile('Notenschnitt')).toContainText('2,06')
    await expect(tile('ECTS')).toContainText('15')
    await expect(tile('ECTS')).toContainText('/ 180 · 8 %')
    await expect(tile('Nächste Prüfung')).toContainText('40')
    await expect(tile('Nächste Prüfung')).toContainText('Klausur Lineare Algebra')
    await expect(tile('Offene Aufgaben')).toContainText('3')
    await expect(tile('Vorlesungszeit')).toContainText('Woche von 15')
    await expect(tile('Diese Woche fällig').getByRole('button')).toHaveCount(2)
  })

  test('Link-Kachel und Listeneintrag öffnen als Vorschau', async ({ page }) => {
    await page.getByRole('button', { name: /Module.*Alle Module/ }).click()
    await expect(peekTitle(page)).toHaveValue('Module')
    await page.keyboard.press('Escape')
    await expect(peek(page)).toHaveCount(0)
    await expect(await pageTitle(page)).toHaveValue('Studium')
    await page
      .getByRole('region', { name: 'Diese Woche fällig' })
      .getByRole('button', { name: /Übungsblatt 3 LA/ })
      .click()
    await expect(peekTitle(page)).toHaveValue('Übungsblatt 3 LA')
    await peek(page).getByRole('button', { name: 'Als ganze Seite öffnen' }).click()
    await expect(peek(page)).toHaveCount(0)
    await expect(await pageTitle(page)).toHaveValue('Übungsblatt 3 LA')
  })

  test('Note eintragen aktualisiert Notenschnitt und ECTS', async ({ page }) => {
    await page.getByRole('button', { name: /Module.*Alle Module/ }).click()
    await expect(peekTitle(page)).toHaveValue('Module')
    await peek(page).getByRole('tab', { name: 'Tabelle' }).click()
    const row = peek(page).getByRole('row', { name: /Lineare Algebra/ })
    await row.getByRole('button', { name: 'Note Bearbeiten' }).click()
    await page.getByRole('dialog', { name: 'Note' }).getByRole('textbox').fill('1,0')
    await page.keyboard.press('Enter')
    await row.getByRole('button', { name: 'Status Bearbeiten' }).click()
    await page
      .getByRole('dialog', { name: 'Status' })
      .getByRole('option', { name: 'Bestanden', exact: true })
      .click()
    await peek(page).getByRole('button', { name: 'Schließen' }).click()
    await expect(page.getByRole('region', { name: 'Notenschnitt' })).toContainText('1,66')
    await expect(page.getByRole('region', { name: 'ECTS' })).toContainText('24')
  })
})
