import { expect, test, type Locator, type Page } from '@playwright/test'
import { openDemo, pageErrors, pageTitle, peek, quickOpen } from './helpers'

async function newPage(page: Page, title: string) {
  await quickOpen(page, title)
  await expect(await pageTitle(page)).toHaveValue(title)
}

/** Switches to the source editor of the main page or of the side panel. */
async function source(page: Page, scope: Locator = page.locator('#main')) {
  await scope.getByRole('button', { name: 'Markdown-Quelltext' }).click()
  return scope.getByRole('textbox', { name: 'Markdown-Quelltext' })
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

  test('zeigt, wo man schreiben kann: Blockrand, Einfügen zwischen Blöcken, Seitenende', async ({ page }) => {
    await newPage(page, 'Lücken')
    await page.getByRole('button', { name: 'Block hinzufügen' }).last().click()
    await page.keyboard.type('Erster')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Zweiter')
    await page.keyboard.press('Escape')
    // A click into the empty space next to the text starts editing the block.
    const second = page.locator('[data-block-id]').filter({ hasText: 'Zweiter' })
    const box = (await second.boundingBox())!
    await second.click({ position: { x: box.width - 20, y: box.height / 2 } })
    await expect(page.getByRole('textbox', { name: /Schreib etwas/ })).toHaveValue('Zweiter')
    await page.keyboard.press('Escape')
    // The insert line between two blocks adds a paragraph exactly there.
    if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) {
      // Touch screens have no hover: Enter at the end of a block opens a new one below.
      await page.getByText('Erster').click()
      await page.keyboard.press('End')
      await page.keyboard.press('Enter')
    } else {
      const gap = page.getByRole('button', { name: 'Absatz hier einfügen' })
      await gap.hover()
      await expect(gap).toHaveCSS('opacity', '1')
      await gap.click()
    }
    await page.keyboard.type('Mitte')
    await page.keyboard.press('Escape')
    // The visible area at the end continues the page.
    await page.getByRole('button', { name: 'Block hinzufügen' }).last().click()
    await page.keyboard.type('Ende')
    await page.keyboard.press('Escape')
    await expect(await source(page)).toHaveValue('Erster\n\nMitte\n\nZweiter\n\nEnde\n')
  })

  test('hakt Aufgaben ab und speichert das', async ({ page }) => {
    await page
      .getByRole('button', { name: /Übungsblatt 3 LA/ })
      .first()
      .click()
    const panel = peek(page)
    await panel.locator('input.task-checkbox').first().click()
    await expect(panel.locator('input.task-checkbox').first()).toBeChecked()
    const text = await source(page, panel)
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
    await peek(page).getByRole('button', { name: 'Als ganze Seite öffnen' }).click()
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
