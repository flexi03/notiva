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
