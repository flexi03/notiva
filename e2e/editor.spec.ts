import { expect, test, type Page } from '@playwright/test'
import { openDemo, pageErrors, pageTitle, quickOpen } from './helpers'

async function newPage(page: Page, title: string) {
  await quickOpen(page, title)
  await expect(await pageTitle(page)).toHaveValue(title)
}

async function source(page: Page) {
  await page.getByRole('button', { name: 'Markdown-Quelltext' }).click()
  return page.getByRole('textbox', { name: 'Markdown-Quelltext' })
}

test.describe('Editor', () => {
  test.skip(({ isMobile }) => isMobile, 'Tastatur-Abläufe werden auf Desktop/Tablet geprüft')
  test.beforeEach(async ({ page }) => openDemo(page))
  test.afterEach(({ page }) => expect(pageErrors(page)).toEqual([]))

  test('schreibt Blöcke als Markdown, Slash-Befehle und Listen', async ({ page }) => {
    await newPage(page, 'Testseite')
    await page.getByRole('button', { name: 'Block hinzufügen' }).last().click()
    const input = page.getByRole('textbox', { name: /Schreib etwas/ })
    await input.pressSequentially('/über')
    await expect(page.getByRole('listbox', { name: 'Befehle' })).toBeVisible()
    await page.keyboard.press('Enter')
    await page.keyboard.type('Kapitel 1')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Ein **fetter** Absatz')
    await page.keyboard.press('Enter')
    await page.keyboard.type('/aufgab')
    await page.keyboard.press('Enter')
    await page.keyboard.type('erste')
    await page.keyboard.press('Enter')
    await page.keyboard.type('zweite')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Danach')
    await page.keyboard.press('Escape')

    await expect(page.locator('.md h1')).toHaveText('Kapitel 1')
    await expect(page.locator('.md strong')).toHaveText('fetter')
    await expect(page.locator('input.task-checkbox')).toHaveCount(2)

    const text = await source(page)
    await expect(text).toHaveValue(
      '# Kapitel 1\n\nEin **fetter** Absatz\n\n- [ ] erste\n- [ ] zweite\n\nDanach\n',
    )
  })

  test('hakt Aufgaben ab und speichert das', async ({ page }) => {
    await page
      .getByRole('button', { name: /Übungsblatt 3 LA/ })
      .first()
      .click()
    await page.locator('input.task-checkbox').first().click()
    await expect(page.locator('input.task-checkbox').first()).toBeChecked()
    const text = await source(page)
    await expect(text).toHaveValue(/- \[x\] Aufgabe 1/)
  })

  test('verlinkt Seiten mit [[ und zeigt Backlinks', async ({ page }) => {
    await newPage(page, 'Linkseite')
    await page.getByRole('button', { name: 'Block hinzufügen' }).last().click()
    await page.keyboard.type('Siehe [[Datenb')
    await page
      .getByRole('option', { name: /Datenbanken/ })
      .first()
      .click()
    await page.keyboard.press('Escape')
    const link = page.locator('a.wikilink', { hasText: 'Datenbanken' })
    await expect(link).toBeVisible()
    await link.click()
    await expect(await pageTitle(page)).toHaveValue('Datenbanken')
    await expect(page.getByRole('region', { name: 'Verlinkt von' })).toContainText('Linkseite')
  })

  test('benennt Seiten um und passt Links an', async ({ page }) => {
    const title = await pageTitle(page)
    await title.fill('Uni')
    await title.press('Enter')
    await expect(page).toHaveURL(/Uni\.md/)
    await page.getByRole('button', { name: /Module.*Alle Module/ }).click()
    await expect(page).toHaveURL(/Uni%2FModule\.md/)
  })

  test('Quelltext-Modus speichert Frontmatter', async ({ page }) => {
    await newPage(page, 'Roh')
    const text = await source(page)
    await text.fill('---\nicon: 🧪\nFach: Physik\n---\nInhalt')
    await page.getByRole('button', { name: 'Block-Editor' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText('Physik')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Symbol ändern' })).toHaveText('🧪')
  })

  test('verschiebt Seiten in den Papierkorb und stellt sie wieder her', async ({ page }) => {
    await newPage(page, 'Wegwerfen')
    await page.getByRole('button', { name: 'Mehr' }).click()
    await page.getByRole('menuitem', { name: 'In den Papierkorb' }).click()
    await expect(page.getByText('„Wegwerfen“ liegt im Papierkorb.')).toBeVisible()
    await page.getByRole('button', { name: 'Rückgängig' }).click()
    await expect(await pageTitle(page)).toHaveValue('Wegwerfen')
  })

  test('Suche findet Inhalte', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k')
    await page.getByRole('combobox').fill('Stetigkeit')
    await expect(page.getByRole('option', { name: /Analysis I/ })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(await pageTitle(page)).toHaveValue('Analysis I')
  })
})
