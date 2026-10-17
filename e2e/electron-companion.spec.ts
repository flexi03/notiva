import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { companionCall } from '../electron/companion'
import { studyPack } from '../src/lib/packs/study'
import { expandPack } from '../src/lib/templates'

let app: ElectronApplication
let window: Page
let folder: string

test.beforeAll(async () => {
  folder = path.join(mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-companion-')), 'Studium')
  for (const file of expandPack(studyPack, '', {}).files) {
    mkdirSync(path.dirname(path.join(folder, file.path)), { recursive: true })
    writeFileSync(path.join(folder, file.path), file.content)
  }
  mkdirSync(path.join(folder, 'Unterlagen'), { recursive: true })
  writeFileSync(path.join(folder, 'Unterlagen/Skript.pdf'), '%PDF-1.4 test')
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

interface Pairing {
  id: string
  key: string
  port: number
  hosts: string[]
}

test('iPhone koppeln: verschlüsselt Tag lesen, abhaken, ablegen, Seite bearbeiten, entkoppeln', async () => {
  const section = window.getByTestId('companion-settings')
  // Opening the folder may still navigate to its start page: until the settings stay.
  await expect(async () => {
    await window.evaluate(() => (location.hash = '#/settings/vault'))
    await expect(section).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
  await section.getByLabel('Name des Geräts').fill('Test-iPhone')
  await section.getByRole('button', { name: 'iPhone oder iPad koppeln' }).click()
  await expect(section.getByRole('img', { name: 'QR-Code zum Koppeln' })).toBeVisible()
  // What the QR code holds (the app scans it): taken the same way the settings do.
  const pairing = JSON.parse(
    await window.evaluate(async () => {
      const bridge = (
        window as unknown as { notiva: { companion: { pair(n: string): Promise<{ pairing: string }> } } }
      ).notiva.companion
      return (await bridge.pair('Test-iPhone')).pairing
    }),
  ) as Pairing
  const url = `http://127.0.0.1:${pairing.port}`
  const call = (method: string, params: unknown = {}) => companionCall(url, pairing, method, params)

  expect(await call('hello')).toMatchObject({ ok: true, r: { protocol: 1, vault: 'Studium' } })
  // The first request makes the pairing permanent: the QR code disappears, the device is listed.
  await expect(section.getByRole('img', { name: 'QR-Code zum Koppeln' })).toHaveCount(0)
  await expect(section.getByRole('list', { name: 'Gekoppelte Geräte' })).toContainText('Test-iPhone')

  const day = (await call('day')) as { ok: boolean; r: { items: unknown[] } }
  expect(day.ok).toBe(true)
  const tasks = (await call('tasks')).r as Array<{
    path: string
    title: string
    module: { title: string } | null
  }>
  const task = tasks.find((x) => x.title === 'Übungsblatt 3 LA')!
  expect(task.module?.title).toBe('Lineare Algebra')
  expect((await call('task.set', { path: task.path, done: true })).ok).toBe(true)
  await expect.poll(() => readFileSync(path.join(folder, task.path), 'utf8')).toContain('Status: Erledigt')
  const modules = (await call('modules')).r as Array<{ path: string; title: string }>
  const algebra = modules.find((m) => m.title === 'Lineare Algebra')!
  const added = (await call('task.add', { title: 'Vom iPhone', due: '2030-01-15', module: algebra.path }))
    .r as {
    path: string
  }
  await expect
    .poll(() => readFileSync(path.join(folder, added.path), 'utf8'))
    .toMatch(/Fällig: 2030-01-15[\s\S]*Lineare Algebra|Lineare Algebra[\s\S]*Fällig: 2030-01-15/)

  expect(
    (await call('shelf.add', { name: 'Tafel.jpg', data: Buffer.from('jpeg').toString('base64') })).ok,
  ).toBe(true)
  await expect.poll(() => existsSync(path.join(folder, 'Ablage/Tafel.jpg'))).toBe(true)

  const page = (await call('page', { path: 'Willkommen.md' })).r as
    { body: string; mtime: number } | undefined
  const target = page ? 'Willkommen.md' : 'Studium.md'
  const current = (await call('page', { path: target })).r as { body: string; mtime: number }
  expect(
    (await call('page.put', { path: target, body: `${current.body}\nVom iPhone\n`, base: current.mtime })).ok,
  ).toBe(true)
  await expect.poll(() => readFileSync(path.join(folder, target), 'utf8')).toContain('Vom iPhone')
  // An old state is not written over the newer one.
  const conflict = await call('page.put', { path: target, body: 'alt', base: current.mtime })
  expect(conflict).toMatchObject({ ok: false, code: 'conflict' })
  // …the phone's version goes next to it instead – both stay.
  const copy = (await call('page.copy', { path: target, body: 'Fassung vom iPhone', device: 'iPhone' }))
    .r as {
    path: string
  }
  expect(copy.path).toMatch(/\(iPhone .+\)\.md$/)
  await expect.poll(() => readFileSync(path.join(folder, copy.path), 'utf8')).toContain('Fassung vom iPhone')
  expect(readFileSync(path.join(folder, target), 'utf8')).toContain('Vom iPhone')
  // PDFs: changes merged by id into the notes page next to the PDF; page notes against their start.
  expect(((await call('pdfs')).r as Array<{ path: string }>).map((x) => x.path)).toContain(
    'Unterlagen/Skript.pdf',
  )
  const highlight = {
    id: 'ip1',
    type: 'highlight',
    page: 2,
    color: 'green',
    rects: [[10, 20, 100, 12]],
    text: 'B-Baum',
  }
  const put = (params: object) => call('notes.put', { pdf: 'Unterlagen/Skript.pdf', ...params })
  expect((await put({ add: [highlight], notes: [{ page: 2, text: 'Klausurrelevant', base: '' }] })).ok).toBe(
    true,
  )
  const notesFile = path.join(folder, 'Unterlagen/Skript (Notizen).md')
  await expect.poll(() => existsSync(notesFile) && readFileSync(notesFile, 'utf8')).toContain('B-Baum')
  expect(readFileSync(notesFile, 'utf8')).toContain('## Seite 2\n\nKlausurrelevant')
  // The same note changed elsewhere meanwhile: no overwriting.
  expect(await put({ notes: [{ page: 2, text: 'Andere Fassung', base: '' }] })).toMatchObject({
    ok: false,
    code: 'conflict',
  })
  const after = (await put({ remove: ['ip1'] })).r as {
    annotations: unknown[]
    notes: Record<string, string>
  }
  expect(after.annotations).toEqual([])
  expect(after.notes).toEqual({ '2': 'Klausurrelevant' })

  // Rendered like on the Mac.
  const rendered = (await call('page', { path: target })).r as { html: string }
  expect(rendered.html).toContain('<p>')
  // Hidden folders stay out of reach.
  expect((await call('page', { path: '.notiva/settings.json' })).ok).toBe(false)

  // Unpaired: the Mac does not answer the device any more.
  await section.getByRole('button', { name: 'Test-iPhone“ entkoppeln', exact: false }).first().click()
  await window.getByRole('dialog').getByRole('button', { name: 'Entkoppeln' }).click()
  await expect(section.getByRole('list', { name: 'Gekoppelte Geräte' })).toHaveCount(0)
  await expect(call('hello')).rejects.toThrow()
  expect(readdirSync(folder)).toContain('Ablage')
})
