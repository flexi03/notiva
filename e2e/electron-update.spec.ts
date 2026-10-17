import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

let app: ElectronApplication
let window: Page

const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version
const [major, minor, patch] = version.split('.').map(Number) as [number, number, number]
const newer = `${major}.${minor}.${patch + 1}`
const older = `${major}.${minor}.${Math.max(0, patch - 1)}`
const asset = (v: string) => ({
  name: `Notiva-${v}-${process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux'}-${process.arch === 'x64' && process.platform === 'linux' ? 'x86_64' : process.arch}.${process.platform === 'darwin' ? 'zip' : process.platform === 'win32' ? 'exe' : 'AppImage'}`,
  browser_download_url: `https://example.invalid/${v}`,
  size: 1,
})
const release = (v: string, de: string) => ({
  tag_name: `v${v}`,
  published_at: '2026-10-17T12:00:00Z',
  html_url: `https://github.com/flexi03/notiva/releases/tag/v${v}`,
  body: `## English\n\n- English notes ${v}\n\n## Deutsch\n\n- ${de}\n`,
  assets: [asset(v)],
})

test.beforeAll(async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-update-'))
  const folder = path.join(dir, 'Studium')
  mkdirSync(folder)
  writeFileSync(path.join(folder, 'Notiz.md'), '# Notiz\n')
  const releases = path.join(dir, 'releases.json')
  writeFileSync(
    releases,
    JSON.stringify([
      release(older, 'Ältere Neuerung'),
      release(newer, 'Kommende Neuerung'),
      release(version, 'Aktuelle Neuerung'),
    ]),
  )
  app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      NOTIVA_E2E_FOLDER: folder,
      NOTIVA_E2E_USERDATA: mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-user-')),
      NOTIVA_E2E_RELEASES: releases,
    },
  })
  window = await app.firstWindow()
  await window.getByRole('button', { name: 'Ordner wählen' }).click()
})

test.afterAll(async () => {
  await app?.close()
})

test('Einstellungen → Über: installierte Version, alle Versionen mit Notizen, ältere nur nach Warnung', async () => {
  await window.evaluate(() => (location.hash = '#/settings/about'))
  const section = window.getByTestId('update-settings')
  await expect(section).toContainText(`Version ${version}`)
  await expect(section.getByRole('button', { name: 'Nach Updates suchen' })).toBeVisible()

  const list = section.getByRole('list', { name: 'Alle Versionen' })
  // One row per version (the notes have list items of their own).
  const rows = list.locator(':scope > li')
  await expect(rows).toHaveCount(3)
  // Newest first; the installed one is marked and has no install button.
  await expect(rows.nth(0)).toContainText(newer)
  await expect(rows.nth(0)).toContainText('neuer')
  const current = rows.nth(1)
  await expect(current).toContainText('installiert')
  await expect(current.getByRole('button', { name: 'Installieren' })).toHaveCount(0)
  // Notes in the app's language.
  await current.getByText('Was ist neu').click()
  await expect(current).toContainText('Aktuelle Neuerung')
  await expect(current).not.toContainText('English notes')
  await section.screenshot({ path: test.info().outputPath('versionen.png') })

  if (older !== version) {
    await rows.nth(2).getByRole('button', { name: 'Installieren' }).click()
    const dialog = window.getByRole('dialog')
    await expect(dialog).toContainText(`Ältere Version ${older} installieren?`)
    await dialog.getByRole('button', { name: 'Abbrechen' }).click()
    await expect(dialog).toHaveCount(0)
  }
})
