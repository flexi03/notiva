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
import { ssoAnswer } from '../electron/moodleSso'
import { MODULHANDBUCH_PDF } from '../src/test/fixtures/pdf'
import { tablePdf } from './fixtures/tablePdf'

const TOKEN = 'tok1234567890abcdef'
/** Switched on later: Moodle then has a new assignment, a new script and a forum message. */
const news = { on: false }
/** Switched on later: the lecturer uploads a new version of vl01.pdf. */
const revised = { on: false }
const day = 86_400
const now = Math.floor(Date.now() / 1000)

/** A small fake Moodle: token login and the web service functions Notiva uses. */
function fakeMoodle(): Promise<{ server: Server; url: string; calls: string[] }> {
  const calls: string[] = []
  let base = ''
  const server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c: Buffer) => (raw += c.toString()))
    req.on('end', () => {
      const body = new URLSearchParams(raw)
      const send = (data: unknown) => {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(data))
      }
      // Moodle app sign-in: the university login page, then the redirect with the token.
      if (req.url?.startsWith('/admin/tool/mobile/launch.php')) {
        const passport = new URL(req.url, 'http://x').searchParams.get('passport') ?? ''
        res.setHeader('content-type', 'text/html; charset=utf-8')
        return res.end(
          `<!doctype html><title>Uni-Login</title><form method="post" action="/sso"><input type="hidden" name="passport" value="${passport}"><label>Code <input name="code"></label><button>Anmelden</button></form>`,
        )
      }
      if (req.url?.startsWith('/webservice/pluginfile.php/')) {
        const url = new URL(req.url, 'http://x')
        calls.push(`file:${url.pathname}`)
        if (url.searchParams.get('token') !== TOKEN) {
          res.setHeader('content-type', 'text/html')
          return res.end('<html>Login</html>')
        }
        res.setHeader('content-type', 'application/pdf')
        if (revised.on && url.pathname.endsWith('/vl01.pdf'))
          return res.end(tablePdf([{ x: 72, y: 700, text: 'Neue Fassung mit Klausurhinweis' }]))
        return res.end(Buffer.from(MODULHANDBUCH_PDF))
      }
      if (req.url === '/sso') {
        calls.push(`sso:${body.get('code')}`)
        res.statusCode = 303
        res.setHeader('location', ssoAnswer(base, body.get('passport') ?? '', TOKEN))
        return res.end()
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
        if (fn === 'core_course_get_contents')
          return send(
            body.get('courseid') === '42'
              ? [
                  {
                    id: 1,
                    name: 'Woche 1',
                    summary: news.on ? '<p>Klausur am <b>03.02.</b></p>' : '<p>Klausurtermin folgt</p>',
                    modules: [
                      {
                        id: 77,
                        name: 'Vorlesung 1',
                        modname: 'resource',
                        contents: [
                          {
                            type: 'file',
                            filename: 'vl01.pdf',
                            fileurl: `${base}/webservice/pluginfile.php/1/vl01.pdf`,
                            timemodified: revised.on ? now - 30 : now - 10 * day,
                          },
                        ],
                      },
                      ...(news.on
                        ? [
                            {
                              id: 78,
                              name: 'Vorlesung 2 – Skript',
                              modname: 'resource',
                              contents: [
                                {
                                  type: 'file',
                                  filename: 'vl02.pdf',
                                  fileurl: `${base}/webservice/pluginfile.php/1/vl02.pdf`,
                                  timemodified: now - 60,
                                },
                              ],
                            },
                          ]
                        : []),
                    ],
                  },
                ]
              : body.get('courseid') === '43' && revised.on
                ? [
                    {
                      id: 2,
                      name: 'Praktikum',
                      modules: [
                        {
                          id: 90,
                          name: 'Praktikumsaufgaben (ProjectBase)',
                          modname: 'url',
                          url: `${base}/mod/url/view.php?id=90`,
                          contents: [
                            {
                              type: 'url',
                              fileurl: 'https://projectbase.example.org/bs/praktikum-1/-/tree/main',
                            },
                          ],
                        },
                      ],
                    },
                  ]
                : [],
          )
        if (fn === 'message_popup_get_popup_notifications')
          return send({
            notifications: news.on
              ? [
                  {
                    id: 9,
                    subject: 'Raumänderung: heute H3',
                    smallmessage: 'Die Vorlesung ist heute in H3.',
                    timecreated: now - 30,
                  },
                ]
              : [],
          })
        // Blatt 5 is handed in already.
        if (fn === 'mod_assign_get_submission_status')
          return send(
            body.get('assignid') === '9001'
              ? { lastattempt: { submission: { status: 'submitted' }, gradingstatus: 'notgraded' } }
              : { lastattempt: { submission: { status: 'new' } } },
          )
        if (fn === 'core_calendar_get_action_events_by_timesort')
          return send({
            events: [
              ...(news.on
                ? [
                    {
                      id: 503,
                      name: 'Blatt 6 ist fällig',
                      activityname: 'Blatt 6',
                      modulename: 'assign',
                      timesort: now + 9 * day,
                      course: { id: 42 },
                    },
                  ]
                : []),
              {
                id: 501,
                name: 'Blatt 5 ist fällig',
                activityname: 'Blatt 5',
                modulename: 'assign',
                instance: 9001,
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
      base = `http://127.0.0.1:${address.port}`
      resolve({ server, url: base, calls })
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
  await window.getByRole('tab', { name: 'Studium' }).click()
})

/** Settings open as side panel – closed again once set up. */
async function closeSettings() {
  const panel = window.getByRole('complementary', { name: 'Einstellungen' })
  if (await panel.isVisible())
    await window
      .getByRole('navigation', { name: 'Werkzeugleiste rechts' })
      .getByRole('button', { name: 'Einstellungen' })
      .click()
}

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
  await section().getByRole('radio', { name: 'Benutzername' }).click()
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

test('meldet sich über den Uni-Login (SSO mit 2FA) im eigenen Fenster an', async () => {
  await section().getByRole('radio', { name: 'Uni-Login' }).click()
  await section().getByRole('textbox', { name: 'Moodle-Adresse' }).fill(moodle.url)
  const popup = app.waitForEvent('window')
  await section().getByRole('button', { name: 'Anmeldefenster öffnen' }).click()
  const login = await popup
  await expect(login).toHaveTitle('Uni-Login')
  // The login window has no Notiva bridge.
  expect(await login.evaluate(() => typeof (window as { notiva?: unknown }).notiva)).toBe('undefined')
  // Passkeys (Touch ID / Face ID) would hang in Electron: the page must not see WebAuthn.
  expect(
    await login.evaluate(() => typeof (window as { PublicKeyCredential?: unknown }).PublicKeyCredential),
  ).toBe('undefined')
  expect(
    await login.evaluate(() =>
      navigator.credentials.get({ publicKey: { challenge: new Uint8Array(8) } }).then(
        () => 'ok',
        (e: Error) => e.name,
      ),
    ),
  ).toBe('NotAllowedError')
  await login.getByLabel('Code').fill('123456')
  await login.getByRole('button', { name: 'Anmelden' }).click()
  await expect(section().getByRole('status')).toHaveText(`Verbunden mit ${moodle.url} als Alex Beispiel.`)
  expect(moodle.calls).toContain('sso:123456')
})

test('zeigt die Kurse und öffnet sie in der App', async () => {
  await window.getByRole('button', { name: 'Moodle', exact: true }).click()
  const courses = window.getByRole('list', { name: 'Kurse' })
  await expect(courses).toContainText('Betriebssysteme')
  await expect(courses).toContainText('Blatt 5')
  const popup = app.waitForEvent('window')
  await window.getByRole('button', { name: '„Lineare Algebra“ in Notiva öffnen' }).click()
  const page = await popup
  await page.waitForLoadState()
  expect(page.url()).toBe(`${moodle.url}/course/view.php?id=42`)
  await page.close()
})

test('meldet Neuigkeiten aus Moodle im Benachrichtigungscenter', async () => {
  await closeSettings()
  news.on = true
  await window.getByRole('button', { name: 'Aktualisieren' }).click()
  const bar = window.getByRole('navigation', { name: 'Werkzeugleiste rechts' })
  const bell = bar.getByRole('button', { name: /Benachrichtigungen/ })
  // 4 news + the (one) suggestion to save the new scripts.
  await expect(bell).toContainText('5')
  await bell.click()
  const panel = window.getByRole('complementary', { name: 'Benachrichtigungen' })
  const list = panel.getByRole('list', { name: 'Benachrichtigungen' })
  await expect(list).toContainText('Neue Abgabe: Blatt 6')
  await expect(list).toContainText('Neue Unterlage: Vorlesung 2 – Skript')
  await expect(list).toContainText('Mitteilung: Raumänderung: heute H3')
  // Each check leaves one entry (replaced next time) – read, not counted as news.
  await expect(list).toContainText('Moodle geprüft')
  // Changed course texts (section summary) – with the new text.
  await expect(list).toContainText('Geändert: Woche 1')
  await expect(list).toContainText('Klausur am 03.02.')
  await expect(list).toContainText('neue Unterlagen in Moodle')
  // "Ungelesen": an opened entry stays (now read) with its details until the filter changes.
  await panel.getByRole('button', { name: /^Ungelesen/ }).click()
  const entry = list.getByRole('button', { name: /Raumänderung: heute H3/ })
  await entry.click()
  await expect(entry).toHaveAttribute('aria-expanded', 'true')
  await expect(list).toContainText('Die Vorlesung ist heute in H3.')
  await panel.getByRole('button', { name: 'Alle', exact: true }).click()
  await panel.getByRole('button', { name: 'Alle als gelesen markieren' }).click()
  await expect(bell).not.toContainText('5')
  // Stored on the device, not in the vault.
  expect(readFileSync(path.join(userData, 'notifications.json'), 'utf8')).toContain('Blatt 6')
  for (const file of allFiles(folder)) expect(readFileSync(file, 'utf8')).not.toContain('Raumänderung')
  // A second check finds nothing new.
  await window.getByRole('button', { name: 'Aktualisieren' }).click()
  await expect(bell).not.toContainText('5')
  // "Heute" knows what is handed in already (Moodle's submission status).
  await window.getByRole('navigation', { name: 'Seiten' }).getByRole('button', { name: 'Heute' }).click()
  const soon = window.getByTestId('day-upcoming')
  await expect(soon.getByRole('listitem').filter({ hasText: 'Blatt 5' }).first()).toContainText('abgegeben')
})

test('schlägt neue Skripte vor und speichert sie nach Bestätigung – mit Fortschritt', async () => {
  test.setTimeout(90_000)
  await closeSettings()
  // The fetches above found new PDFs: suggested (hint + notification), not saved silently.
  const saved = path.join(folder, 'Studium/Unterlagen/Lineare Algebra/Vorlesung/vl01.pdf')
  expect(existsSync(saved)).toBe(false)
  // The suggestion waits in the notifications (until decided).
  const panel = window.getByRole('complementary', { name: 'Benachrichtigungen' })
  if (!(await panel.isVisible()))
    await window
      .getByRole('navigation', { name: 'Werkzeugleiste rechts' })
      .getByRole('button', { name: /Benachrichtigungen/ })
      .click()
  await panel
    .getByRole('button', { name: /neue Unterlagen in Moodle/ })
    .first()
    .click()
  await panel.getByRole('button', { name: 'Ansehen und entscheiden' }).first().click()
  const dialog = window.getByRole('dialog', { name: /neue Unterlagen in Moodle/ })
  await expect(dialog).toContainText('vl01.pdf')
  await dialog.getByRole('button', { name: 'Übernehmen' }).click()
  await expect.poll(() => existsSync(saved)).toBe(true)
  expect(readFileSync(saved).subarray(0, 4).toString()).toBe('%PDF')
  expect(existsSync(path.join(folder, 'Studium/Unterlagen/Lineare Algebra/Vorlesung/vl02.pdf'))).toBe(true)
  expect(moodle.calls).toContain('file:/webservice/pluginfile.php/1/vl01.pdf')

  // A manual refresh shows its progress and ends with a confirmation.
  await window.getByRole('button', { name: 'Moodle', exact: true }).click()
  await window.getByRole('button', { name: 'Aktualisieren' }).click()
  await expect(window.getByTestId('progress-summary')).toContainText(
    'Moodle abgerufen: 2 Kurse, 2 Unterlagen',
  )

  await window.getByRole('button', { name: 'Unterlagen (2)' }).click()
  const week = window.getByRole('region', { name: 'Woche 1' })
  const row = week.getByRole('listitem').filter({ hasText: 'Vorlesung 1' })
  await expect(row).toContainText('in Notiva gespeichert')
  await row.getByRole('button', { name: 'Öffnen', exact: true }).click()
  await expect(window.getByTestId('pdf-pages')).toHaveText('/ 1')
  await expect(window.locator('.textLayer')).toContainText('Modulhandbuch Informatik')
})

test('legt eine neue Version daneben, vergleicht sie und ersetzt nach Wahl', async () => {
  test.setTimeout(90_000)
  revised.on = true
  const dir = path.join(folder, 'Studium/Unterlagen/Lineare Algebra/Vorlesung')
  const before = readFileSync(path.join(dir, 'vl01.pdf'))
  await window.getByRole('button', { name: 'Moodle', exact: true }).click()
  await window.getByRole('button', { name: 'Unterlagen neu einlesen' }).click()
  const dialog = window.getByRole('dialog', { name: /Änderung\(en\) an den Unterlagen/ })
  await expect(dialog).toContainText('Neue Version: vl01.pdf')
  await dialog.getByRole('button', { name: 'Ausführen' }).click()
  // Next to the current file – that one is unchanged.
  const next = () => readdirSync(dir).find((f) => /^vl01 \(neu \d{4}-\d\d-\d\d\)\.pdf$/.test(f))
  await expect.poll(next).toBeTruthy()
  expect(readFileSync(path.join(dir, 'vl01.pdf')).equals(before)).toBe(true)

  await window.getByRole('button', { name: '1 neue Version(en)' }).click()
  await expect(window.getByRole('heading', { name: 'Neue Versionen', level: 1 })).toBeVisible()
  await expect(window.getByTestId('version-summary')).toContainText('1 neu, 1 entfernt')
  await window.getByRole('button', { name: 'Alte ersetzen' }).click()
  await expect.poll(next).toBeFalsy()
  expect(readFileSync(path.join(dir, 'vl01.pdf')).toString('latin1')).toContain('Klausurhinweis')
  await expect(window.getByText('Keine neuen Versionen')).toBeVisible()

  // A link to a Git project: in the browser (sign-in with 2FA works there) or into the lab.
  await window.getByRole('button', { name: 'Moodle', exact: true }).click()
  await window.getByRole('button', { name: 'Unterlagen (1)' }).click()
  const row = window.getByRole('listitem').filter({ hasText: 'Praktikumsaufgaben (ProjectBase)' })
  await expect(row.getByRole('button', { name: 'Im Browser öffnen' })).toBeVisible()
  await expect(row.getByRole('button', { name: 'In der App öffnen' })).toBeVisible()
  await expect(row.getByRole('button', { name: 'Repository ins Praktikum holen' })).toBeVisible()

  // The module page: Moodle's news and links in time order, the Git link with its button.
  const modulePage = path.join(folder, 'Studium/Module/Software Engineering.md')
  const text = readFileSync(modulePage, 'utf8')
  writeFileSync(modulePage, text.replace(/^---\n/, '---\nkurse: [course:43]\n'))
  await window.evaluate(
    (h) => (location.hash = h),
    `#/p/${encodeURIComponent('Studium/Module/Software Engineering.md')}`,
  )
  const moodle = window.getByTestId('module-moodle')
  await expect(moodle).toContainText('Praktikumsaufgaben (ProjectBase)')
  // Links grouped by their Moodle section.
  await expect(moodle.getByTestId('moodle-links')).toContainText('Praktikum')
  await expect(moodle.getByRole('button', { name: 'Repository ins Praktikum holen' })).toBeVisible()
  // A course taken later / not at all: chosen per course; not counted → its entries are hidden.
  await moodle.getByLabel(/Wie zählt „Betriebssysteme“/).selectOption('ignore')
  await expect(moodle).not.toContainText('Praktikumsaufgaben (ProjectBase)')
  expect(readFileSync(path.join(folder, '.notiva/course-choices.json'), 'utf8')).toContain(
    '"course:43": "ignore"',
  )
  await moodle.getByLabel(/Wie zählt „Betriebssysteme“/).selectOption('now')
  await expect(moodle).toContainText('Praktikumsaufgaben (ProjectBase)')
})
