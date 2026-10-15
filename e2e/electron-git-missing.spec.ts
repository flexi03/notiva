import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Without Git (e.g. a fresh Windows PC) the changes panel explains why and offers to install it –
// instead of loading forever.
test('ohne Git: Erklärung und „Git installieren“ statt endlosem Laden', async () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-nogit-'))
  writeFileSync(path.join(folder, 'Start.md'), '# Start\n')
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      NOTIVA_E2E_FOLDER: folder,
      NOTIVA_E2E_USERDATA: mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-user-')),
      NOTIVA_E2E_GIT: path.join(folder, 'kein-git'),
    },
  })
  try {
    const window = await app.firstWindow()
    await window.getByRole('button', { name: 'Ordner wählen' }).click()
    await window.getByRole('button', { name: /Änderungen \(Git\)/ }).click()
    const alert = window
      .getByRole('alert')
      .filter({ hasText: 'Git ist auf diesem Computer nicht installiert.' })
    await expect(alert).toBeVisible({ timeout: 15_000 })
    await expect(alert).toContainText('Git speichert Versionen')
    await expect(alert.getByRole('button', { name: 'Git installieren' })).toBeVisible()
    await expect(alert.getByRole('button', { name: 'Noch einmal' })).toBeVisible()
  } finally {
    await app.close()
  }
})
