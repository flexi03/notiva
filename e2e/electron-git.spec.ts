import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
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
})

test('committet ausgewählte Änderungen', async () => {
  await panel().getByRole('textbox', { name: 'Commit-Nachricht' }).fill('Zeile ergänzt')
  await panel().getByRole('button', { name: 'Commit (1)' }).click()
  await expect(panel()).toContainText('Keine Änderungen seit dem letzten Commit.')
  expect(git('log', '--format=%s', '-n1').trim()).toBe('Zeile ergänzt')
  await expect(window.locator('[data-change]')).toHaveCount(0)
  await panel().getByRole('button', { name: 'Verlauf' }).click()
  await expect(panel().getByRole('region', { name: 'Verlauf' })).toContainText('Zeile ergänzt')
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
