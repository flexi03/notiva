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
  const list = window.getByRole('list', { name: 'Markierungen und Notizen' })
  await expect(list).toContainText('Definition: Ein Graph')
})

test('schreibt Notizen pro Seite', async () => {
  await window.getByRole('textbox', { name: 'Notiz zur aktuellen Seite' }).fill('Dijkstra nochmal üben')
  await expect.poll(notes).toContain('## Seite 1\n\nDijkstra nochmal üben')
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
  await window.getByRole('button', { name: 'Terminal', exact: true }).click()
  const term = window.getByTestId('terminal')
  await expect(term).toBeVisible()
  await window.waitForTimeout(1500)
  await term.click()
  await window.keyboard.type('echo notiva-$((40+2)) && pwd\n')
  await expect(term).toContainText('notiva-42', { timeout: 10_000 })
  await expect(term).toContainText('Skripte')
  await window.getByRole('region', { name: 'Terminal' }).getByRole('button', { name: 'Schließen' }).click()
  await expect(term).toHaveCount(0)
})
