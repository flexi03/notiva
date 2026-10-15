import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// A new study folder at another university, with nothing connected yet: no made-up modules,
// a hint how they get in, and the ways to set up another university.
let app: ElectronApplication
let window: Page
let folder: string

test.beforeAll(async () => {
  folder = mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-setup-'))
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

test('legt ein Studium an einer anderen Hochschule an – ohne Module vorab', async () => {
  const hint = window.getByTestId('progress-task').filter({ hasText: 'Studium einrichten' })
  await hint.getByRole('button', { name: 'Einrichten' }).click()
  await window.getByRole('button', { name: 'Studium anlegen' }).click()
  const dialog = window.getByRole('dialog', { name: 'Studium aktualisieren' })
  await expect(dialog).toContainText('Andere Hochschule?')
  await expect(dialog.getByRole('button', { name: 'Issue auf GitHub' })).toBeVisible()
  await dialog
    .getByRole('combobox', { name: 'Studiengang und Prüfungsordnung' })
    .selectOption({ label: 'Eigener Studiengang / andere Hochschule' })
  const create = dialog.getByRole('button', { name: 'Studium anlegen' })
  await expect(create).toBeDisabled()
  await dialog.getByRole('textbox', { name: 'Hochschule' }).fill('Uni Beispielstadt')
  await dialog.getByRole('textbox', { name: 'Studiengang' }).fill('Informatik B.Sc.')
  await create.click()

  await expect(window.getByTestId('progress-task').filter({ hasText: 'noch ohne Module' })).toBeVisible({
    timeout: 20_000,
  })
  const profile = path.join(folder, 'Studium/Hochschule.md')
  await expect.poll(() => existsSync(profile)).toBe(true)
  const text = readFileSync(profile, 'utf8')
  expect(text).toContain('name: "Uni Beispielstadt"')
  expect(text).toContain('vorlage: keine')
  expect(text).toContain('studiengangName: "Informatik B.Sc."')
  expect(text).not.toContain('hs-duesseldorf')
  // No modules without Moodle/eCampus – the Module page explains how they get in.
  const modules = path.join(folder, 'Studium/Module')
  expect(existsSync(modules) ? readdirSync(modules).filter((f) => f.endsWith('.md')) : []).toEqual([])
  expect(readFileSync(path.join(folder, 'Studium/Module.md'), 'utf8')).toContain(
    'Wie kommen die Module hierher?',
  )
  expect(readFileSync(path.join(folder, 'Studium.md'), 'utf8')).toContain('Informatik B.Sc.')

  // Moodle settings: no HSD address, the hint for other universities.
  await window
    .getByTestId('progress-task')
    .filter({ hasText: 'noch ohne Module' })
    .getByRole('button', { name: 'Moodle & eCampus verbinden' })
    .click()
  await expect(window.getByText('Andere Hochschule?').first()).toBeVisible()
  await expect(window.getByRole('textbox', { name: 'Moodle-Adresse' })).toHaveValue('')
})
