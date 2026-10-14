import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer, type Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { studyPack } from '../src/lib/packs/study'
import { expandPack } from '../src/lib/templates'

const TOKEN = 'tok1234567890abcdef'
const day = 86_400
const now = Math.floor(Date.now() / 1000)

/** A small fake Moodle: token login and the web service functions Notiva uses. */
function fakeMoodle(): Promise<{ server: Server; url: string; calls: string[] }> {
  const calls: string[] = []
  const server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c: Buffer) => (raw += c.toString()))
    req.on('end', () => {
      const body = new URLSearchParams(raw)
      const send = (data: unknown) => {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(data))
      }
      if (req.url === '/login/token.php') {
        calls.push(`login:${body.get('username')}:${body.get('service')}`)
        return send(
          body.get('username') === 'alex' && body.get('password') === 'richtig'
            ? { token: TOKEN }
            : { error: 'Invalid login, please try again', errorcode: 'invalidlogin' },
        )
      }
      if (req.url === '/webservice/rest/server.php') {
        if (body.get('wstoken') !== TOKEN)
          return send({ exception: 'x', errorcode: 'invalidtoken', message: 'x' })
        const fn = body.get('wsfunction')!
        calls.push(fn)
        if (fn === 'core_webservice_get_site_info') return send({ userid: 7, fullname: 'Alex Beispiel' })
        if (fn === 'core_enrol_get_users_courses')
          return send([
            { id: 42, shortname: 'LA', fullname: 'Lineare Algebra' },
            { id: 43, shortname: 'BS', fullname: 'Betriebssysteme' },
          ])
        if (fn === 'core_calendar_get_action_events_by_timesort')
          return send({
            events: [
              {
                id: 501,
                name: 'Blatt 5 ist fällig',
                activityname: 'Blatt 5',
                modulename: 'assign',
                timesort: now + 6 * day,
                course: { id: 42 },
              },
              {
                id: 502,
                name: 'Projekt Shell ist fällig',
                activityname: 'Projekt Shell',
                modulename: 'assign',
                timesort: now + 20 * day,
                course: { id: 43 },
              },
            ],
          })
        return send({ exception: 'x', errorcode: 'nopermission', message: 'Keine Berechtigung' })
      }
      res.statusCode = 404
      res.end()
    })
  })
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as { port: number }
      resolve({ server, url: `http://127.0.0.1:${address.port}`, calls })
    }),
  )
}

let app: ElectronApplication
let window: Page
let folder: string
let userData: string
let moodle: Awaited<ReturnType<typeof fakeMoodle>>

test.beforeAll(async () => {
  moodle = await fakeMoodle()
  folder = mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-moodle-'))
  userData = mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-user-'))
  for (const file of expandPack(studyPack, '', {}).files) {
    mkdirSync(path.dirname(path.join(folder, file.path)), { recursive: true })
    writeFileSync(path.join(folder, file.path), file.content)
  }
  app = await electron.launch({
    args: ['.'],
    env: { ...process.env, NOTIVA_E2E_FOLDER: folder, NOTIVA_E2E_USERDATA: userData },
  })
  window = await app.firstWindow()
  await window.getByRole('button', { name: 'Ordner wählen' }).click()
  await window.getByRole('button', { name: 'Einstellungen' }).click()
})

test.afterAll(async () => {
  await app?.close()
  moodle?.server.close()
})

const section = () => window.getByRole('region', { name: 'Moodle' })

function allFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name)
    return statSync(p).isDirectory() ? allFiles(p) : [p]
  })
}

test('meldet sich an, ohne das Passwort zu speichern', async () => {
  await section().getByRole('textbox', { name: 'Moodle-Adresse' }).fill(moodle.url)
  await section().getByRole('textbox', { name: 'Benutzername' }).fill('alex')
  await section().getByLabel('Passwort').fill('falsch')
  await section().getByRole('button', { name: 'Verbinden' }).click()
  await expect(section().getByRole('alert')).toContainText('Benutzername oder Passwort stimmen nicht')
  await section().getByLabel('Passwort').fill('richtig')
  await section().getByRole('button', { name: 'Verbinden' }).click()
  await expect(section().getByRole('status')).toHaveText(`Verbunden mit ${moodle.url} als Alex Beispiel.`)
  expect(moodle.calls).toContain('login:alex:moodle_mobile_app')
  const stored = readFileSync(path.join(userData, 'moodle.bin'), 'utf8')
  expect(stored).toContain(TOKEN)
  expect(stored).not.toContain('richtig')
  // Never in the vault (it may be pushed to Git).
  for (const file of allFiles(folder)) expect(readFileSync(file, 'utf8')).not.toContain(TOKEN)
})

test('zeigt vor dem Übernehmen, was aus Moodle kommt', async () => {
  await section().getByRole('button', { name: 'Jetzt abrufen …' }).click()
  const dialog = window.getByRole('dialog', { name: 'Aus Moodle übernehmen' })
  await expect(dialog).toContainText('2 Kurse und 2 Termine')
  await expect(dialog.getByRole('region', { name: 'Neue Module' })).toContainText('Betriebssysteme')
  const tasks = dialog.getByRole('region', { name: 'Neue Aufgaben' })
  await expect(tasks).toContainText('Blatt 5')
  await expect(tasks).toContainText('Lineare Algebra')
  // "Lineare Algebra" exists already: it is only linked, not duplicated.
  await expect(dialog.getByRole('region', { name: 'Aktualisieren' })).toContainText('Lineare Algebra')
  await tasks.getByRole('checkbox', { name: 'Projekt Shell' }).uncheck()
  await dialog.getByRole('button', { name: '3 übernehmen' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(window.getByText('3 Einträge aus Moodle übernommen')).toBeVisible()

  const task = readFileSync(path.join(folder, 'Studium/Aufgaben/Blatt 5.md'), 'utf8')
  expect(task).toContain('moodle: event:501')
  expect(task).toMatch(/Modul:\n {2}- "\[\[Lineare Algebra\]\]"/)
  expect(existsSync(path.join(folder, 'Studium/Module/Betriebssysteme.md'))).toBe(true)
  expect(existsSync(path.join(folder, 'Studium/Aufgaben/Projekt Shell.md'))).toBe(false)
})

test('importiert beim zweiten Mal nur, was noch fehlt', async () => {
  await section().getByRole('button', { name: 'Jetzt abrufen …' }).click()
  const dialog = window.getByRole('dialog', { name: 'Aus Moodle übernehmen' })
  await expect(dialog.getByRole('region', { name: 'Neue Aufgaben' })).toContainText('Projekt Shell')
  await expect(dialog.getByRole('region', { name: 'Neue Module' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: '1 übernehmen' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Abbrechen' }).click()
})

test('trennt und löscht den Zugang', async () => {
  await section().getByRole('button', { name: 'Trennen' }).click()
  await expect(section().getByRole('button', { name: 'Verbinden' })).toBeVisible()
  expect(existsSync(path.join(userData, 'moodle.bin'))).toBe(false)
})
