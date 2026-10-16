import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const IDENTITY = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

let app: ElectronApplication
let window: Page
let folder: string
const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: folder, encoding: 'utf8', env: { ...process.env, ...IDENTITY } })

test.beforeAll(async () => {
  folder = mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-git-'))
  git('init', '-q', '-b', 'main')
  writeFileSync(path.join(folder, 'Notiz.md'), '# Notiz\n\nErste Zeile\n\nZweite Zeile\n')
  git('add', '.')
  git('commit', '-q', '-m', 'Start')
  app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      ...IDENTITY,
      NOTIVA_E2E_FOLDER: folder,
      NOTIVA_E2E_USERDATA: mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-user-')),
    },
  })
  window = await app.firstWindow()
  await window.getByRole('button', { name: 'Ordner wählen' }).click()
  await window.getByRole('navigation', { name: 'Seiten' }).getByRole('button', { name: 'Notiz' }).click()
})

test.afterAll(async () => {
  await app?.close()
})

const panel = () => window.getByRole('complementary', { name: 'Änderungen' })

test('markiert geänderte Zeilen und zeigt den Diff', async () => {
  await expect(window.locator('#main').getByRole('button', { name: 'Geändert', exact: true })).toHaveCount(0)
  await window.getByText('Zweite Zeile').click()
  await window.keyboard.press('End')
  await window.keyboard.type(' – ergänzt')
  await window.keyboard.press('Escape')
  // Chip next to the title and a gutter marker at the changed block.
  await expect(window.locator('#main').getByRole('button', { name: 'Geändert', exact: true })).toBeVisible({
    timeout: 10_000,
  })
  await expect(window.locator('[data-change="modified"]')).toHaveCount(1)
  await expect(window.locator('[data-change="modified"]')).toContainText('Zweite Zeile – ergänzt')

  await window.getByRole('button', { name: 'Änderungen (Git) (⌘⇧G)' }).click()
  await expect(panel()).toContainText('Notiz')
  await expect(panel()).toContainText('+1')
  await expect(panel()).toContainText('−1')
  await panel().getByRole('button', { name: 'Änderungen anzeigen: Notiz.md' }).click()
  const diff = window.getByRole('table', { name: 'Änderungen Zeile für Zeile' })
  await expect(
    diff.locator('[data-diff="del"], td').filter({ hasText: 'Zweite Zeile' }).first(),
  ).toBeVisible()
  await expect(window.getByRole('dialog')).toContainText('1 Zeilen hinzugefügt, 1 entfernt')
  // Only the new words are highlighted, not the whole line.
  await expect(diff.locator('mark[data-word-change]').first()).toHaveText(' – ergänzt')
  await window.keyboard.press('Escape')
})

test('schlägt eine Commit-Nachricht mit allen Änderungen vor', async () => {
  const field = panel().getByRole('textbox', { name: 'Commit-Nachricht' })
  await expect(field).toHaveValue('Notiz geändert\n\nGeändert:\n- Notiz.md (+1 −1)')
  // Without the local model the template is the fallback – and says so, with the way to set it up.
  await expect(panel().getByTestId('commit-fallback')).toContainText('Nachricht aus der Vorlage')
  await expect(panel().getByRole('button', { name: 'Einrichten' })).toBeVisible()
  // Where the message comes from – and how it is made, explained on request.
  await expect(panel().getByTestId('commit-source')).toContainText('Vorlage aus den Dateinamen')
  await panel().getByRole('button', { name: 'Wie entsteht der Vorschlag?' }).click()
  await expect(panel().getByTestId('commit-explain')).toContainText('lokale Mini-Modell')
  await field.fill('Eigene Nachricht')
  await expect(panel().getByTestId('commit-source')).toContainText('Von dir bearbeitet')
  await panel().getByRole('button', { name: 'Zurück zum Vorschlag' }).click()
  await expect(field).toHaveValue('Notiz geändert\n\nGeändert:\n- Notiz.md (+1 −1)')
})

test('committet ausgewählte Änderungen', async () => {
  await panel().getByRole('textbox', { name: 'Commit-Nachricht' }).fill('Zeile ergänzt')
  await panel().getByRole('button', { name: 'Commit (1)' }).click()
  await expect(panel()).toContainText('Keine Änderungen seit dem letzten Commit.')
  expect(git('log', '--format=%s', '-n1').trim()).toBe('Zeile ergänzt')
  await expect(window.locator('[data-change]')).toHaveCount(0)
  // The history is open, as a graph with the branch name.
  await expect(panel().getByRole('region', { name: 'Verlauf' })).toContainText('Zeile ergänzt')
  await expect(panel().getByTestId('git-graph').locator('svg circle').first()).toBeVisible()
  await expect(panel().getByTestId('git-graph')).toContainText('main')
  await expect(panel().getByRole('region', { name: 'Verlauf' })).toContainText('Start')
})

test('verwirft neue Seiten nach Rückfrage', async () => {
  await window.keyboard.press('ControlOrMeta+k')
  await window.getByRole('combobox').fill('Wegwerfseite')
  await window.keyboard.press('Enter')
  await expect.poll(() => existsSync(path.join(folder, 'Wegwerfseite.md'))).toBe(true)
  await expect(panel()).toContainText('Wegwerfseite', { timeout: 10_000 })
  await expect(window.locator('#main').getByRole('button', { name: 'Neu', exact: true })).toBeVisible()
  const row = panel().getByRole('listitem').filter({ hasText: 'Wegwerfseite' })
  await row.hover()
  await row.getByRole('button', { name: 'Änderungen verwerfen' }).click()
  await window.getByRole('dialog').getByRole('button', { name: 'Änderungen verwerfen' }).click()
  await expect.poll(() => existsSync(path.join(folder, 'Wegwerfseite.md'))).toBe(false)
  await expect(panel()).toContainText('Keine Änderungen')
})

test('verwirft alle Änderungen auf einmal – neue Dateien kommen in den Papierkorb', async () => {
  writeFileSync(path.join(folder, 'Notiz.md'), '# Notiz\n\nGeändert\n')
  writeFileSync(path.join(folder, 'Neu 1.md'), '# Neu 1\n')
  writeFileSync(path.join(folder, 'Neu 2.md'), '# Neu 2\n')
  await panel().getByRole('button', { name: 'Aktualisieren' }).first().click()
  await expect(panel()).toContainText('Neu 2', { timeout: 10_000 })
  await panel().getByRole('button', { name: 'Alle verwerfen' }).click()
  await window
    .getByRole('dialog', { name: '3 Änderungen verwerfen?' })
    .getByRole('button', { name: 'Änderungen verwerfen' })
    .click()
  await expect(panel()).toContainText('Keine Änderungen', { timeout: 10_000 })
  expect(readFileSync(path.join(folder, 'Notiz.md'), 'utf8')).not.toContain('Geändert')
  expect(existsSync(path.join(folder, 'Neu 1.md'))).toBe(false)
  // The new files are only in the trash: one click brings them back.
  await window.getByRole('button', { name: '2 neue Dateien zurückholen' }).click()
  await expect.poll(() => existsSync(path.join(folder, 'Neu 1.md'))).toBe(true)
  await expect.poll(() => existsSync(path.join(folder, 'Neu 2.md'))).toBe(true)
})

test('legt einen Code-Ordner im Studium an – mit .gitignore, im selben Git', async () => {
  writeFileSync(path.join(folder, 'Datenbanken.md'), '# Datenbanken\n\n```notiva\ntype: related\n```\n')
  await window.waitForTimeout(800)
  await window.evaluate(() => (location.hash = '#/p/Datenbanken.md'))
  await window.getByRole('button', { name: 'Code-Ordner' }).click()
  await window.getByRole('dialog').getByRole('button', { name: 'Code-Ordner' }).click()
  const section = window.getByRole('region', { name: 'Code-Ordner' })
  await expect(section.getByRole('button', { name: 'In VS Code öffnen' })).toBeVisible()
  await expect.poll(() => existsSync(path.join(folder, 'Datenbanken/Praktikum/.gitignore'))).toBe(true)
  writeFileSync(path.join(folder, 'Datenbanken/Praktikum/Query.sql'), 'SELECT 1;\n')
  mkdirSync(path.join(folder, 'Datenbanken/Praktikum/node_modules/x'), { recursive: true })
  writeFileSync(path.join(folder, 'Datenbanken/Praktikum/node_modules/x/index.js'), '')
  await expect(section).toContainText('Dateien')
  // Files open in the code editor (terminal below) and save by themselves.
  await section.getByRole('button', { name: 'Neue Datei' }).click()
  await window.getByRole('dialog').getByRole('textbox').fill('aufgabe1.sql')
  await window.getByRole('dialog').getByRole('button', { name: 'Neue Datei' }).click()
  const editor = window.getByTestId('code-editor')
  await expect(editor).toBeVisible()
  await editor.locator('.cm-content').click()
  await window.keyboard.type('SELECT name FROM kunde;')
  await expect
    .poll(() => readFileSync(path.join(folder, 'Datenbanken/Praktikum/aufgabe1.sql'), 'utf8'))
    .toBe('SELECT name FROM kunde;')
  await expect(window.getByTestId('terminal')).toBeVisible()
  await window.goBack()
  // Links of the lab, opened beside the terminal.
  await section.getByRole('button', { name: 'Link hinzufügen' }).click()
  await window.getByRole('dialog').getByRole('textbox').fill('https://projectbase.example.org/-/snippets/41')
  await window.getByRole('dialog').getByRole('button', { name: 'Link hinzufügen' }).click()
  await expect(
    section.getByRole('button', { name: 'https://projectbase.example.org/-/snippets/41' }),
  ).toBeVisible()
  const status = git('status', '--porcelain', '-uall')
  expect(status).toContain('Datenbanken/Praktikum/Query.sql')
  expect(status).not.toContain('node_modules')
})

test('ein geholtes Repository mit eigenem Git: aus dem Ordner-Git nehmen, eigener Reiter', async () => {
  // As it happened: the lab repository got committed into the vault's Git (a "gitlink").
  const repo = path.join(folder, 'Datenbanken/Praktikum/aufgaben')
  const inRepo = (...args: string[]) =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8', env: { ...process.env, ...IDENTITY } })
  mkdirSync(repo, { recursive: true })
  inRepo('init', '-q', '-b', 'main')
  inRepo('remote', 'add', 'origin', 'https://projectbase.example.org/dbs/aufgaben.git')
  writeFileSync(path.join(repo, 'a.sql'), 'select 1;\n')
  inRepo('add', '.')
  inRepo('commit', '-q', '-m', 'eins')
  git('add', 'Datenbanken/Praktikum/aufgaben')
  git('commit', '-q', '-m', 'mit Repo')
  // A new version in the lab repository → the vault's Git calls the folder "changed".
  writeFileSync(path.join(repo, 'b.sql'), 'select 2;\n')
  inRepo('add', '.')
  inRepo('commit', '-q', '-m', 'zwei')
  await panel().getByRole('button', { name: 'Aktualisieren' }).first().click()
  const note = panel().getByTestId('nested-repo')
  await expect(note).toContainText('aufgaben')
  await note.getByRole('button', { name: 'Aus dem Ordner-Git nehmen' }).click()
  await expect(note).toHaveCount(0)
  expect(git('ls-files', '-s', 'Datenbanken/Praktikum/aufgaben')).toBe('')
  expect(git('status', '--porcelain')).not.toContain('aufgaben')
  // Kept in its own tab: changes, commit.
  await panel().getByRole('tab', { name: 'Praktikum-Repos' }).click()
  const tab = panel().getByTestId('lab-repos-tab')
  await expect(tab).toContainText('aufgaben')
  writeFileSync(path.join(repo, 'c.sql'), 'select 3;\n')
  // Finder files never count – not in the lab repository, not in the folder's Git.
  writeFileSync(path.join(repo, '.DS_Store'), 'x')
  writeFileSync(path.join(folder, '.DS_Store'), 'x')
  await panel().getByRole('tab', { name: 'Notizen & Dateien' }).click()
  await panel().getByRole('tab', { name: 'Praktikum-Repos' }).click()
  await expect(tab).toContainText('c.sql')
  // The change of a lab repository file, in colour like the folder's.
  await tab.getByRole('button', { name: /c\.sql/ }).click()
  const sheet = window.getByRole('dialog', { name: /c\.sql/ })
  await expect(sheet).toContainText('select 3;')
  await sheet.getByRole('button', { name: 'Schließen' }).click()
  await tab.getByRole('textbox', { name: 'Commit-Nachricht' }).fill('Aufgabe 3')
  await tab.getByRole('button', { name: 'Commit' }).click()
  await expect.poll(() => inRepo('log', '-1', '--format=%s').trim()).toBe('Aufgabe 3')
  // Editing a repository file: the gutter marks the changed line against its own Git.
  await window.evaluate(() => (location.hash = '#/f/Datenbanken%2FPraktikum%2Faufgaben%2Fa.sql'))
  const editor = window.getByTestId('code-editor')
  await editor.locator('.cm-content').click()
  await window.keyboard.press('End')
  await window.keyboard.type(' -- geändert')
  await expect(editor.locator('.cm-change-modified, .cm-change-added').first()).toBeVisible()
  expect(inRepo('show', '--name-only', '--format=', 'HEAD')).not.toContain('.DS_Store')
  await expect(tab).not.toContainText('.DS_Store')
  await panel().getByRole('tab', { name: 'Notizen & Dateien' }).click()
  await expect(panel()).not.toContainText('.DS_Store')

  // A PDF in a change: never compared as text – what happened, and the file.
  writeFileSync(path.join(folder, 'Skript.pdf'), '%PDF-1.4\n' + 'x'.repeat(200_000))
  await panel().getByRole('tab', { name: 'Notizen & Dateien' }).click()
  await panel().getByRole('button', { name: 'Aktualisieren' }).first().click()
  await panel()
    .getByRole('button', { name: /Skript\.pdf/ })
    .first()
    .click()
  await expect(window.getByTestId('binary-change')).toContainText('Neu hinzugefügt')
  await window.getByRole('dialog').getByRole('button', { name: 'Schließen' }).click()

  // Without remote: "Remote hinzufügen" explains the steps; a failing upload says why.
  await panel().getByRole('tab', { name: 'Notizen & Dateien' }).click()
  await panel().getByRole('button', { name: 'Remote hinzufügen' }).click()
  const remote = window.getByTestId('remote-dialog')
  await expect(remote).toContainText('leeres Repository')
  const connect = window.getByRole('button', { name: 'Verbinden und hochladen' })
  await remote.getByLabel('Adresse des Repositorys').fill('kein link')
  await expect(connect).toBeDisabled()
  await remote.getByLabel('Adresse des Repositorys').fill('https://127.0.0.1:9/nichts.git')
  await connect.click()
  await expect(window.getByTestId('remote-problem')).toBeVisible()
  await window.getByRole('button', { name: 'Abbrechen' }).click()
})
