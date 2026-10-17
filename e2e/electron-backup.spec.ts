import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

let app: ElectronApplication
let window: Page
let folder: string
let userData: string

test.beforeAll(async () => {
  folder = path.join(mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-backup-')), 'Studium')
  mkdirSync(path.join(folder, 'Unterlagen'), { recursive: true })
  writeFileSync(path.join(folder, 'Notiz.md'), '# Notiz\n\nWichtig\n')
  writeFileSync(path.join(folder, 'Unterlagen/Skript.pdf'), '%PDF-1.4 test')
  userData = mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-user-'))
  app = await electron.launch({
    args: ['.'],
    env: { ...process.env, NOTIVA_E2E_FOLDER: folder, NOTIVA_E2E_USERDATA: userData },
  })
  window = await app.firstWindow()
  await window.getByRole('button', { name: 'Ordner wählen' }).click()
})

test.afterAll(async () => {
  await app?.close()
})

test('sichert den Ordner in einen eigenen Backup-Ordner und stellt ihn als neuen Ordner wieder her', async () => {
  await window.evaluate(() => (location.hash = '#/settings/vault'))
  const section = window.getByTestId('backup-settings')
  await expect(section).toContainText('Noch keine Sicherung')
  await section.getByRole('button', { name: 'Jetzt sichern' }).click()
  await expect(section.getByTestId('backup-last')).toContainText('Letzte Sicherung', { timeout: 15_000 })
  // A normal folder outside the vault, one per snapshot.
  const root = path.join(userData, 'Backups', 'Studium')
  const [snapshot] = readdirSync(root).filter((n) => /^\d{4}-\d\d-\d\d \d{4}$/.test(n))
  expect(readFileSync(path.join(root, snapshot!, 'Notiz.md'), 'utf8')).toContain('Wichtig')
  expect(existsSync(path.join(root, snapshot!, 'Unterlagen/Skript.pdf'))).toBe(true)
  await expect(section.getByRole('listitem')).toHaveCount(1)
  await expect(section.getByRole('listitem')).toContainText('2 Dateien')

  // Restoring never overwrites: a new folder next to the vault.
  writeFileSync(path.join(folder, 'Notiz.md'), '# Notiz\n\nAus Versehen gelöscht\n')
  await section.getByRole('button', { name: 'Wiederherstellen' }).click()
  await window.getByRole('dialog').getByRole('button', { name: 'Wiederherstellen' }).click()
  const restored = path.join(path.dirname(folder), `Studium (Sicherung ${snapshot})`)
  await expect.poll(() => existsSync(path.join(restored, 'Notiz.md'))).toBe(true)
  expect(readFileSync(path.join(restored, 'Notiz.md'), 'utf8')).toContain('Wichtig')
  expect(readFileSync(path.join(folder, 'Notiz.md'), 'utf8')).toContain('Aus Versehen')
})
