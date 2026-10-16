import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { studyPack } from '../src/lib/packs/study'
import { expandPack } from '../src/lib/templates'

/**
 * The flows of docs/ABLAEUFE.md, step by step – "Vorlesung" and "Praktikum" in the module
 * Datenbanken. If this passes, the flows work as written there.
 */
const PDF = fileURLToPath(new URL('./fixtures/graphen.pdf', import.meta.url))
const GIT = fileURLToPath(new URL('./fixtures/fake-git.mjs', import.meta.url))
const DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const today = DAYS[new Date().getDay()]!

let app: ElectronApplication
let window: Page
let folder: string
const U = 'Studium/Unterlagen/Datenbanken'
const LAB = 'Studium/Module/Datenbanken/Praktikum'
const put = (rel: string, content: string) => {
  mkdirSync(path.dirname(path.join(folder, rel)), { recursive: true })
  writeFileSync(path.join(folder, rel), content)
}
const pdf = (rel: string) => {
  mkdirSync(path.dirname(path.join(folder, rel)), { recursive: true })
  copyFileSync(PDF, path.join(folder, rel))
}

test.skip(today === 'So', 'Stundenplan kennt keinen Sonntag')

test.beforeAll(async () => {
  folder = mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-flows-'))
  for (const file of expandPack(studyPack, '', {}).files) put(file.path, file.content)
  // Today's lecture (late, so it is still ahead).
  put(
    'Studium/Stundenplan/DB Vorlesung.md',
    `---\nTag: ${today}\nBeginn: "23:30"\nEnde: "23:55"\nTyp: Vorlesung\nRaum: H3\nModul: ["[[Datenbanken]]"]\n---\n`,
  )
  // Materials: the current course in the module, an older term in the archive.
  pdf(`${U}/Vorlesung/DBS-03_SQL.pdf`)
  pdf(`${U}/Praktikum & Übung/DBS_Praktikum_01.pdf`)
  pdf(`${U}/Praktikum & Übung/DBS_Praktikum_02.pdf`)
  pdf(`${U}/Praktikum & Übung/DBS - Praktikum 02 - Vorbereitungsblatt.pdf`)
  pdf(`${U}/Archiv/WiSe 25-26/Vorlesung/DBS-alt.pdf`)
  // The lab folder with the repository link of P02.
  put(
    `${LAB}.md`,
    '---\ncode: true\nlinks:\n  - "https://projectbase.example.org/dbs/praktikum-2.git"\n---\n# Praktikum\n',
  )
  mkdirSync(path.join(folder, LAB), { recursive: true })
  app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      NOTIVA_E2E_FOLDER: folder,
      NOTIVA_E2E_USERDATA: mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-user-')),
      NOTIVA_E2E_GIT: GIT,
      FAKE_GIT_REAL: '1',
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 't@example.org',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 't@example.org',
    },
  })
  window = await app.firstWindow()
  await window.getByRole('button', { name: 'Ordner wählen' }).click()
})

test.afterAll(async () => {
  await app?.close()
})

test('Vorlesung: Heute → Modul → Skript → Notiz → Seitenleiste → Unterlagen', async () => {
  const nav = window.getByRole('navigation', { name: 'Seiten' })
  // 1. What is on today.
  await nav.getByRole('button', { name: 'Heute' }).click()
  const day = window.getByTestId('day-overview')
  await expect(day).toContainText('Datenbanken')
  // 2. To the lecture: the module page with the script for it.
  await day
    .getByRole('button', { name: /Datenbanken/ })
    .first()
    .click()
  const focus = window.getByTestId('session-focus')
  await expect(focus).toContainText('DBS-03_SQL.pdf')
  // 3. Open the script.
  await focus.getByRole('button', { name: /DBS-03_SQL\.pdf/ }).click()
  await expect(window.getByTestId('pdf-pages')).toHaveText('/ 3')
  // 4. A note to the page – saved next to the PDF (notes column: "Notizen ein-/ausblenden").
  const toggle = window.getByRole('button', { name: 'Notizen ein-/ausblenden' })
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click()
  await window.getByRole('textbox', { name: 'Notiz zur aktuellen Seite' }).fill('Joins wiederholen')
  const notes = path.join(folder, `${U}/Vorlesung/DBS-03_SQL (Notizen).md`)
  await expect.poll(() => existsSync(notes) && readFileSync(notes, 'utf8')).toContain('Joins wiederholen')
  // 5. In the side bar the notes page hangs under its PDF.
  const tree = window.getByRole('tree', { name: 'Seiten' })
  const item = tree.getByRole('treeitem', { name: /DBS-03_SQL\.pdf/ }).first()
  await expect(item).toBeVisible()
  // 6. The module's materials: current open and marked, the archive greyed and closed.
  await window.evaluate(
    (h) => (location.hash = h),
    `#/p/${encodeURIComponent('Studium/Module/Datenbanken.md')}`,
  )
  const current = window.getByTestId('files-current')
  await expect(current).toContainText('aktiv')
  await expect(window.getByTestId('files-archive')).not.toHaveAttribute('open', '')
})

test('Praktikum: planen → P02 → Vorbereitungsblatt → Repo holen → bearbeiten → committen', async () => {
  test.setTimeout(90_000)
  // 1. Plan the lab dates (preparation included).
  await window.evaluate(
    (h) => (location.hash = h),
    `#/p/${encodeURIComponent('Studium/Module/Datenbanken.md')}`,
  )
  const lab = window.getByRole('region', { name: 'Praktikum', exact: true })
  await lab.getByRole('button', { name: 'Termine planen' }).click()
  const planner = lab.getByTestId('lab-planner')
  await planner.getByLabel('Anzahl Termine').fill('2')
  await planner.getByRole('button', { name: '4 eintragen' }).click()
  await expect(lab.getByTestId('lab-dates').getByRole('listitem')).toHaveCount(4)
  // 2. P02 from the side bar: date, preparation, the sheets.
  await window.getByTestId('nav-labs').getByRole('button', { name: 'P02', exact: true }).click()
  const hub = window.getByTestId('lab-hub')
  await expect(hub).toContainText('P02 Praktikumstermin')
  await expect(hub).toContainText('DBS - Praktikum 02 - Vorbereitungsblatt.pdf')
  await expect(hub).toContainText('DBS_Praktikum_02.pdf')
  // 3. The preparation's sheet opens as a PDF – no empty page.
  await hub.getByRole('button', { name: /P02 Vorbereitung/ }).click({ modifiers: ['Meta'] })
  await window
    .locator('a.wikilink', { hasText: /Vorbereitungsblatt/ })
    .first()
    .click()
  await expect(window.getByTestId('pdf-pages')).toHaveText('/ 3')
  // 4. Get the repository: P02 suggested, into the shared working folder.
  await window.evaluate((h) => (location.hash = h), `#/p/${encodeURIComponent(`${LAB}.md`)}`)
  await window.getByRole('button', { name: 'Repository ins Praktikum holen' }).click()
  const choose = window.getByRole('dialog', { name: 'Zu welchem Praktikum gehört das Repository?' })
  await expect(choose.getByRole('radio', { name: 'P02', exact: true })).toBeChecked()
  await choose.getByRole('button', { name: 'Weiter' }).click()
  await window.getByRole('dialog').getByRole('button', { name: 'Holen' }).click()
  await expect.poll(() => existsSync(path.join(folder, `${LAB}/praktikum-2/aufgabe.sql`))).toBe(true)
  await expect(window.getByTestId('repo-files')).toContainText('aufgabe.sql')
  // 5. Work on a file: markers in the gutter, repository and P02 above.
  await window.evaluate(
    (h) => (location.hash = h),
    `#/f/${encodeURIComponent(`${LAB}/praktikum-2/aufgabe.sql`)}`,
  )
  await expect(window.getByTestId('file-context')).toContainText('P02')
  const editor = window.getByTestId('code-editor')
  await editor.locator('.cm-content').click()
  await window.keyboard.press('Meta+End')
  await window.keyboard.type('\nselect name from kunde;')
  await expect(editor.locator('.cm-change-added').first()).toBeVisible()
  await expect
    .poll(() => readFileSync(path.join(folder, `${LAB}/praktikum-2/aufgabe.sql`), 'utf8'))
    .toContain('select name from kunde;')
  // 6. Commit in the repository's own Git – with the coloured diff first.
  await window
    .getByRole('navigation', { name: 'Werkzeugleiste', exact: true })
    .getByRole('button', { name: /Änderungen/ })
    .click()
  await window.getByRole('tab', { name: 'Praktikum-Repos' }).click()
  const repos = window.getByTestId('lab-repos-tab')
  await repos.getByRole('button', { name: /aufgabe\.sql/ }).click()
  await expect(window.getByRole('dialog', { name: /aufgabe\.sql/ })).toContainText('select name from kunde;')
  await window.getByRole('dialog').getByRole('button', { name: 'Schließen' }).click()
  await repos.getByRole('textbox', { name: 'Commit-Nachricht' }).fill('P02: Abfrage Kunden')
  await repos.getByRole('button', { name: 'Commit' }).click()
  const log = () =>
    execFileSync('git', ['log', '-1', '--format=%s'], {
      cwd: path.join(folder, `${LAB}/praktikum-2`),
      encoding: 'utf8',
    }).trim()
  await expect.poll(log).toBe('P02: Abfrage Kunden')
  // Not in the folder's Git: the vault has no repository here at all, nothing leaked.
  expect(existsSync(path.join(folder, '.git'))).toBe(false)
  // 7. Everything of P02 in one place (back to the pages in the side bar).
  await window
    .getByRole('navigation', { name: 'Werkzeugleiste', exact: true })
    .getByRole('button', { name: 'Seiten' })
    .click()
  await window.getByTestId('nav-labs').getByRole('button', { name: 'P02', exact: true }).click()
  await expect(window.getByTestId('lab-hub')).toContainText('praktikum-2')
})
