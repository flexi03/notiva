import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { studyPack } from '../src/lib/packs/study'
import { expandPack } from '../src/lib/templates'

let app: ElectronApplication
let window: Page

test.beforeAll(async () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-calendar-'))
  for (const file of expandPack(studyPack, '', {}).files) {
    mkdirSync(path.dirname(path.join(folder, file.path)), { recursive: true })
    writeFileSync(path.join(folder, file.path), file.content)
  }
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

/** The feed as the phone gets it (the Mac itself instead of its network address). */
const local = (url: string) => url.replace(/^webcal:\/\/[^:/]+/, 'http://127.0.0.1')

test('Kalender aufs Handy: freigeben, abonnieren (QR), neue Adresse stoppt alte Abos', async () => {
  await window.evaluate(() => (location.hash = '#/settings/study'))
  const section = window.getByTestId('calendar-settings')
  await section.getByRole('switch', { name: 'Kalender im Netzwerk freigeben' }).click()
  await expect(section.getByRole('img', { name: 'QR-Code der Kalender-Adresse' })).toBeVisible()
  const url = await window.evaluate(async () => {
    const s = await (
      window as unknown as { notiva: { calendar: { status(): Promise<{ urls: string[] }> } } }
    ).notiva.calendar.status()
    return s.urls[0]!
  })
  expect(url).toMatch(/^webcal:\/\/[\d.]+:\d+\/cal\/[\w-]+\.ics$/)
  await expect
    .poll(async () => (await fetch(local(url)).catch(() => null))?.status ?? 0, { timeout: 10_000 })
    .toBe(200)
  const text = await (await fetch(local(url))).text()
  expect(text).toContain('BEGIN:VCALENDAR')
  expect(text).toContain('RRULE:FREQ=WEEKLY')
  expect(text).toContain('SUMMARY:Prüfung: Klausur Lineare Algebra')

  await section.getByRole('button', { name: 'Neue Adresse (alte Abos stoppen)' }).click()
  // The old address gets nothing any more (404, or no answer at all); the new one works.
  await expect.poll(async () => (await fetch(local(url)).catch(() => null))?.status ?? 0).not.toBe(200)
  const fresh = await window.evaluate(async () => {
    const s = await (
      window as unknown as { notiva: { calendar: { status(): Promise<{ urls: string[] }> } } }
    ).notiva.calendar.status()
    return s.urls[0]!
  })
  expect(fresh).not.toBe(url)
  await expect.poll(async () => (await fetch(local(fresh)).catch(() => null))?.status ?? 0).toBe(200)
})
