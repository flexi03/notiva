import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const GIT = fileURLToPath(new URL('./fixtures/fake-git.mjs', import.meta.url))
const TOKEN = 'glpat-e2e-1234567890'

let app: ElectronApplication
let window: Page
let folder: string
let log: string

test.beforeAll(async () => {
  folder = mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-clone-'))
  log = path.join(mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-gitlog-')), 'git.log')
  writeFileSync(
    path.join(folder, 'Praktikum.md'),
    '---\ncode: true\nlinks:\n  - "https://projectbase.example.org/-/snippets/41"\n---\n# Praktikum\n',
  )
  mkdirSync(path.join(folder, 'Praktikum'))
  // A link written as plain text (as an older version did) must not break the page.
  writeFileSync(path.join(folder, 'Verknuepft.md'), '---\ntermin: "[[Praktikum]]"\n---\n# Verknüpft\n')
  app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      NOTIVA_E2E_FOLDER: folder,
      NOTIVA_E2E_USERDATA: mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-user-')),
      NOTIVA_E2E_GIT: GIT,
      FAKE_GIT_LOG: log,
    },
  })
  window = await app.firstWindow()
  await window.getByRole('button', { name: 'Ordner wählen' }).click()
})

test.afterAll(async () => {
  await app?.close()
})

test('holt ein privates Repository mit Zugangstoken – Name frei wählbar', async () => {
  await window.evaluate(() => (location.hash = '#/p/Praktikum.md'))
  await window.getByRole('button', { name: 'Repository ins Praktikum holen' }).click()
  const dialog = window.getByRole('dialog')
  const name = dialog.getByRole('textbox')
  await expect(name).toHaveValue('snippet-41')
  await name.fill('')
  await name.pressSequentially('sql-wiederholung')
  await expect(name).toHaveValue('sql-wiederholung')
  await dialog.getByRole('button', { name: 'Holen' }).click()

  // Sent to the sign-in page: the reason and the fix, not git's message.
  const hint = window.getByTestId('progress-task').filter({ hasText: 'verlangt eine Anmeldung' })
  await expect(hint).toBeVisible()
  await hint.getByRole('button', { name: 'Zugangstoken eintragen' }).click()
  const tokenDialog = window.getByRole('dialog', { name: /Zugangstoken für projectbase.example.org/ })
  const field = tokenDialog.getByLabel(/Token/)
  await expect(field).toHaveAttribute('type', 'password')
  await field.fill(TOKEN)
  await tokenDialog.getByRole('button', { name: 'Speichern' }).click()

  const file = path.join(folder, 'Praktikum/sql-wiederholung/aufgabe.sql')
  await expect.poll(() => existsSync(file)).toBe(true)
  await expect(window.getByTestId('progress-summary')).toContainText('sql-wiederholung')
  // Its page opens: the files right there (the SQL of the snippet), editor and link.
  const files = window.getByTestId('repo-files')
  await expect(files).toContainText('aufgabe.sql')
  await expect(files).toContainText('select 1;')
  await expect(files.getByRole('button', { name: 'Link öffnen' })).toBeVisible()
  // The page's own text: notes of the folder's Git – said so.
  await expect(window.getByRole('heading', { name: /Meine Notizen/ })).toBeVisible()
  // Its own Git history: the vault's repository ignores it.
  expect(readFileSync(path.join(folder, 'Praktikum/.gitignore'), 'utf8')).toContain('/sql-wiederholung/')
  await window.evaluate(() => (location.hash = '#/p/Praktikum.md'))
  // Got once: the link now leads to it, and the lab folder lists it.
  await expect(window.getByRole('button', { name: 'In der App öffnen: sql-wiederholung' })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Repository ins Praktikum holen' })).toHaveCount(0)
  await expect(window.getByTestId('lab-repos')).toContainText('sql-wiederholung')
  await expect(window.getByTestId('lab-repos').getByRole('button', { name: 'Öffnen', exact: true })).toBeVisible()
  // The token never shows up in git's arguments (process list).
  expect(readFileSync(log, 'utf8')).toContain('https://projectbase.example.org/snippets/41.git')
  expect(readFileSync(log, 'utf8')).not.toContain(TOKEN)

  // Something new on the server: "Aktualisieren" shows it first, takes it over after confirming.
  writeFileSync(path.join(folder, 'Praktikum/sql-wiederholung/.git/new'), '')
  await window.getByTestId('lab-repos').getByRole('button', { name: 'Aktualisieren' }).click()
  const update = window.getByRole('dialog', { name: /1 neue Änderung\(en\) in „sql-wiederholung“/ })
  await expect(update).toContainText('Aufgabe 2 ergänzt')
  await expect(update).toContainText('aufgabe2.sql')
  await update.getByRole('button', { name: 'Übernehmen' }).click()
  await expect.poll(() => existsSync(path.join(folder, 'Praktikum/sql-wiederholung/aufgabe2.sql'))).toBe(true)
  // Nothing new any more.
  await window.getByTestId('lab-repos').getByRole('button', { name: 'Aktualisieren' }).click()
  await expect(window.getByTestId('progress-summary')).toContainText('ist aktuell')

  // The stored access is listed in the settings (with its state) and in the sync overview.
  await window.evaluate(() => (location.hash = '#/settings/study'))
  await expect(window.getByTestId('git-tokens')).toContainText('projectbase.example.org')
  await expect(
    window.getByTestId('git-tokens').getByRole('button', { name: 'Neuen Token eintragen' }),
  ).toBeVisible()

  await window.evaluate(() => (location.hash = '#/p/Verknuepft.md'))
  await expect(window.getByRole('button', { name: 'Praktikum', exact: true }).first()).toBeVisible()
  await expect(window.getByText('Hier ist etwas schiefgegangen')).toHaveCount(0)
})
