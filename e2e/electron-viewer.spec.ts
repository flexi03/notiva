import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PDF = fileURLToPath(new URL('./fixtures/graphen.pdf', import.meta.url))

let app: ElectronApplication
let window: Page
let folder: string
const notesFile = () => path.join(folder, 'Skripte/Graphen (Notizen).md')
const notes = () => (existsSync(notesFile()) ? readFileSync(notesFile(), 'utf8') : '')

test.beforeAll(async () => {
  folder = mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-viewer-'))
  writeFileSync(path.join(folder, 'Skripte.md'), '# Skripte\n')
  const { mkdirSync } = await import('node:fs')
  mkdirSync(path.join(folder, 'Skripte'))
  copyFileSync(PDF, path.join(folder, 'Skripte/Graphen.pdf'))
  app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      NOTIVA_E2E_FOLDER: folder,
      NOTIVA_E2E_USERDATA: mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-user-')),
    },
  })
  window = await app.firstWindow()
  await window.getByRole('button', { name: 'Ordner wählen' }).click()
})

test.afterAll(async () => {
  await app?.close()
})

test('öffnet das PDF aus dem Seitenbaum', async () => {
  const tree = window.getByRole('navigation', { name: 'Seiten' })
  await tree.getByRole('button', { name: 'Aufklappen' }).click()
  await tree.getByRole('button', { name: 'Graphen.pdf' }).click()
  await expect(window.getByTestId('pdf-pages')).toHaveText('/ 3')
  await expect(window.locator('[data-page="1"] .textLayer')).toContainText('Vorlesung 3: Graphen')
  // Recently opened files are one click away in the sidebar.
  await expect(tree).toContainText('Zuletzt geöffnet')
  // Pinch / ⌘ + scroll wheel zooms the document.
  await window.locator('[data-page="1"]').hover()
  await window.keyboard.down('Control')
  await window.mouse.wheel(0, -60)
  await window.keyboard.up('Control')
  await expect(window.getByText('180 %')).toBeVisible()
  await window.getByRole('button', { name: 'An Breite anpassen' }).click()
  await expect(window.getByText('100 %')).toBeVisible()
  const toggle = window.getByRole('button', { name: 'Notizen ein-/ausblenden' })
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click()
  await expect(window.getByRole('complementary', { name: 'Notizen zum Dokument' })).toBeVisible()
})

test('markiert ausgewählten Text und speichert ihn in der Notizseite', async () => {
  const line = window.locator('[data-page="1"] .textLayer span', { hasText: 'Definition' })
  // Opening the panel re-renders the pages at the new width – wait for the text layer.
  await expect(line).toBeVisible()
  await window.waitForTimeout(300)
  const box = (await line.boundingBox())!
  await window.mouse.move(box.x + 2, box.y + box.height / 2)
  await window.mouse.down()
  await window.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 5 })
  await window.mouse.up()
  const bar = window.getByRole('toolbar', { name: 'Auswahl' })
  await bar.getByRole('button', { name: 'Grün markieren' }).click()
  await expect(window.locator('[data-page="1"] [data-annotation] rect')).toHaveCount(1)
  await expect.poll(notes).toContain('type: highlight')
  expect(notes()).toContain('Definition: Ein Graph')
  expect(notes()).toContain('color: green')
  // The PDF itself is untouched.
  expect(readFileSync(path.join(folder, 'Skripte/Graphen.pdf')).equals(readFileSync(PDF))).toBe(true)
  // Plain colour marks are listed compactly (closed list).
  await window.getByText('Markierungen (1)').click()
  const list = window.getByRole('list', { name: 'Markierungen ohne Kommentar' })
  await expect(list).toContainText('Definition: Ein Graph')
})

test('schreibt Notizen pro Seite', async () => {
  await window.getByRole('textbox', { name: 'Notiz zur aktuellen Seite' }).fill('Dijkstra nochmal üben')
  await expect.poll(notes).toContain('## Seite 1\n\nDijkstra nochmal üben')
  // Formatted after leaving the field; code blocks can be copied without editing.
  const field = window.getByRole('textbox', { name: 'Notiz zur aktuellen Seite' })
  await field.fill('Dijkstra nochmal üben\n\n```sql\nSELECT * FROM kante;\n```')
  await field.blur()
  const copy = window.getByRole('button', { name: 'Code kopieren' })
  await copy.click()
  await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('SELECT * FROM kante;')
  await expect(window.getByRole('textbox', { name: 'Notiz zur aktuellen Seite' })).toHaveCount(0)
})

test('zeichnet mit dem Stift, setzt Notizen und radiert', async () => {
  await window.getByRole('radio', { name: 'Stift' }).click()
  const page1 = (await window.locator('[data-page="1"]').boundingBox())!
  const at = (fx: number, fy: number) => [page1.x + page1.width * fx, page1.y + page1.height * fy] as const
  await window.mouse.move(...at(0.2, 0.7))
  await window.mouse.down()
  await window.mouse.move(...at(0.5, 0.75), { steps: 8 })
  await window.mouse.up()
  await expect.poll(notes).toContain('type: ink')
  await expect(window.locator('[data-page="1"] polyline[data-annotation]')).toHaveCount(1)

  await window.getByRole('radio', { name: 'Notiz setzen' }).click()
  await window.mouse.click(...at(0.7, 0.85))
  const text = window.getByRole('textbox', { name: 'Notiz', exact: true })
  await text.fill('Prüfungsfrage?')
  await text.blur()
  await expect.poll(notes).toContain('Prüfungsfrage?')

  await window.getByRole('radio', { name: 'Radierer' }).click()
  await window.locator('[data-page="1"] polyline[data-annotation]').click()
  await expect.poll(notes).not.toContain('type: ink')
  expect(notes()).toContain('type: highlight')
})

test('schreibt Text direkt auf die Seite, verschiebt und ändert ihn', async () => {
  await window.getByRole('radio', { name: 'Text schreiben' }).click()
  const page1 = (await window.locator('[data-page="1"]').boundingBox())!
  await window.mouse.click(page1.x + page1.width * 0.55, page1.y + page1.height * 0.6)
  const input = window.getByRole('textbox', { name: 'Text auf der Seite' })
  await expect(input).toBeFocused()
  await input.fill('Klausur: BFS!')
  await input.press('Escape')
  const box = window.getByTestId('text-annotation')
  await expect(box).toHaveText('Klausur: BFS!')
  await expect.poll(notes).toContain('type: text')
  expect(notes()).toContain('Klausur: BFS!')

  // Drag it a bit to the left.
  const before = (await box.boundingBox())!
  await window.mouse.move(before.x + 5, before.y + 5)
  await window.mouse.down()
  await window.mouse.move(before.x - 60, before.y + 5, { steps: 6 })
  await window.mouse.up()
  await expect.poll(async () => (await box.boundingBox())!.x).toBeLessThan(before.x - 40)
  await expect(input).toHaveCount(0)

  // A click without moving edits it.
  await box.click()
  await input.fill('Klausur: BFS und DFS!')
  await input.press('Escape')
  await expect.poll(notes).toContain('Klausur: BFS und DFS!')
  await expect(window.getByRole('list', { name: 'Markierungen und Notizen' })).toContainText(
    'Klausur: BFS und DFS!',
  )
})

test('öffnet unter dem PDF ein Terminal und führt Befehle aus', async () => {
  test.setTimeout(90_000)
  await window.getByRole('button', { name: 'Terminal', exact: true }).click()
  const term = window.getByTestId('terminal')
  await expect(term).toBeVisible()
  await window.waitForTimeout(1500)
  await term.click()
  await window.keyboard.type('echo notiva-$((40+2)) && pwd\n')
  await expect(term).toContainText('notiva-42', { timeout: 10_000 })
  await expect(term).toContainText('Skripte')
  // Dark mode: the terminal follows the app colors.
  const bg = () => term.locator('.xterm-viewport').evaluate((el) => getComputedStyle(el).backgroundColor)
  const light = await bg()
  await window.evaluate(() => (document.documentElement.dataset.theme = 'dark'))
  await expect.poll(bg).not.toBe(light)
  const [r, g, b] = (await bg()).match(/\d+/g)!.map(Number)
  expect(r! + g! + b!).toBeLessThan(200)
  await window.evaluate(() => (document.documentElement.dataset.theme = 'light'))
  // Hiding and showing again: same shell, output still there.
  await window.getByRole('button', { name: 'Terminal', exact: true }).click()
  await expect(term).toHaveCount(0)
  await window.getByRole('button', { name: 'Terminal', exact: true }).click()
  await expect(window.getByTestId('terminal')).toContainText('notiva-42')
  // Two side by side.
  await window.getByRole('button', { name: 'Teilen (daneben)' }).click()
  await expect(window.getByTestId('terminal')).toHaveCount(2)
  await window.getByRole('button', { name: 'Terminal beenden' }).first().click()
  await expect(window.getByTestId('terminal')).toHaveCount(1)
  await window.getByRole('button', { name: 'Terminal beenden' }).click()
  await expect(window.getByTestId('terminal')).toHaveCount(0)
})

test('wählt Zeichnungen mit dem Zeiger aus, verschiebt und löscht sie', async () => {
  await window.getByRole('radio', { name: 'Stift' }).click()
  const page1 = (await window.locator('[data-page="1"]').boundingBox())!
  const at = (fx: number, fy: number) => [page1.x + page1.width * fx, page1.y + page1.height * fy] as const
  await window.mouse.move(...at(0.2, 0.5))
  await window.mouse.down()
  await window.mouse.move(...at(0.45, 0.5), { steps: 8 })
  await window.mouse.up()
  await expect.poll(notes).toContain('type: ink')
  const before = notes()
  await window.getByRole('radio', { name: 'Text auswählen und markieren' }).click()
  // Click on the stroke: selected (frame + delete button), then drag it down.
  await window.mouse.move(...at(0.3, 0.5))
  await window.mouse.down()
  await window.mouse.move(...at(0.3, 0.6), { steps: 6 })
  await window.mouse.up()
  await expect(window.getByRole('button', { name: 'Auswahl löschen' })).toBeVisible()
  await expect.poll(notes).not.toBe(before)
  await window.keyboard.press('Delete')
  await expect.poll(notes).not.toContain('type: ink')
})

test('öffnet neben dem Terminal eine Webseite (abgeschottet)', async () => {
  const { createServer } = await import('node:http')
  const server = createServer((_req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(
      '<h1>Aufgaben P01</h1><p>SELECT * FROM kunde;</p><script>document.title = typeof require</script>',
    )
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/p01`
  await window.getByRole('button', { name: 'Terminal', exact: true }).click()
  await window.getByRole('button', { name: 'Webseite daneben' }).first().click()
  const dialog = window.getByRole('dialog')
  await dialog.getByRole('textbox').fill(url)
  await dialog.getByRole('button', { name: 'Webseite daneben' }).click()
  const web = window.getByTestId('webpane')
  await expect(web).toBeVisible()
  // The page loads in its own process, without Node.
  await expect
    .poll(
      () =>
        web.evaluate((el) => {
          try {
            return (el as unknown as { getTitle(): string }).getTitle()
          } catch {
            return null
          }
        }),
      { timeout: 15_000 },
    )
    .toBe('undefined')
  await expect(window.getByRole('textbox', { name: 'Adresse' })).toHaveValue(url)
  await window.getByRole('button', { name: 'Webseite schließen' }).click()
  await expect(web).toHaveCount(0)
  for (const close of await window.getByRole('button', { name: 'Terminal beenden' }).all())
    await close.click().catch(() => undefined)
  server.close()
})
