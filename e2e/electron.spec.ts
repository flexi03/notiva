import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

let app: ElectronApplication
let window: Page
let folder: string

test.beforeAll(async () => {
  folder = mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-vault-'))
  writeFileSync(path.join(folder, 'Vorhanden.md'), '# Schon da\n\nAus dem Dateisystem.')
  app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      NOTIVA_E2E_FOLDER: folder,
      NOTIVA_E2E_USERDATA: mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-user-')),
    },
  })
  window = await app.firstWindow()
})

test.afterAll(async () => {
  await app?.close()
})

test('Renderer ist abgeschottet (kein Node, nur die Notiva-Brücke)', async () => {
  const env = await window.evaluate(() => ({
    require: typeof (globalThis as { require?: unknown }).require,
    process: typeof (globalThis as { process?: unknown }).process,
    bridge: Object.keys((window as unknown as { notiva: object }).notiva).sort(),
    origin: location.origin,
  }))
  expect(env).toEqual({
    require: 'undefined',
    process: 'undefined',
    bridge: ['lastFolder', 'onVaultChange', 'openExternal', 'pickFolder', 'platform', 'vault'],
    origin: 'app://notiva',
  })
})

test('öffnet einen Ordner und schreibt echte Markdown-Dateien', async () => {
  await window.getByRole('button', { name: 'Ordner wählen' }).click()
  await expect(
    window.getByRole('navigation', { name: 'Seiten' }).getByRole('button', { name: 'Vorhanden' }),
  ).toBeVisible()
  await window.keyboard.press('ControlOrMeta+k')
  await window.getByRole('combobox').fill('Vom Desktop')
  await window.keyboard.press('Enter')
  await expect.poll(() => existsSync(path.join(folder, 'Vom Desktop.md'))).toBe(true)
})

test('zeigt Änderungen von außen sofort an', async () => {
  writeFileSync(path.join(folder, 'Von Außen.md'), 'Per Sync hinzugefügt')
  await expect(
    window.getByRole('navigation', { name: 'Seiten' }).getByRole('button', { name: 'Von Außen' }),
  ).toBeVisible({ timeout: 10_000 })
})

test('Brücke lehnt Pfade außerhalb des Ordners ab', async () => {
  const results = await window.evaluate(async () => {
    const vault = (
      window as unknown as {
        notiva: { vault: { read(p: string): Promise<string>; write(p: string, c: string): Promise<void> } }
      }
    ).notiva.vault
    const attempt = (p: Promise<unknown>) =>
      p.then(
        () => 'ok',
        (e: Error) => e.message,
      )
    return [
      await attempt(vault.read('../../etc/passwd')),
      await attempt(vault.write('/tmp/evil.md', 'x')),
      await attempt(vault.read('a/../../x.md')),
    ]
  })
  expect(results.every((r) => /Unsafe path/.test(r))).toBe(true)
  expect(existsSync('/tmp/evil.md')).toBe(false)
})

test('Navigation weg von der App und neue Fenster sind gesperrt', async () => {
  await window.evaluate(() => {
    location.href = 'https://example.com'
  })
  await window.waitForTimeout(500)
  expect(window.url()).toMatch(/^app:\/\/notiva\//)
  expect(app.windows()).toHaveLength(1)
  expect(readFileSync(path.join(folder, 'Vorhanden.md'), 'utf8')).toContain('Schon da')
})
