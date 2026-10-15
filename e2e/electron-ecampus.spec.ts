import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { studyPack } from '../src/lib/packs/study'
import { expandPack } from '../src/lib/templates'
import { QIS_RESULTS_HTML } from '../src/test/fixtures/qis'
import { tablePdf } from './fixtures/tablePdf'

/**
 * A small HISinOne/QIS: login, exam administration with an iframe, QIS menu → "Notenspiegel" →
 * degree tree → results list. The session id ("asi") changes on every visit of the exam page.
 */
// Exam dates relative to today (the app enters only the last 30 days and the future).
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000)
const de = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const EXAM = inDays(40)
const MOVED = inDays(41)

const fake = {
  sessions: new Set<string>(),
  /** Sessions of the identity provider (single sign-on without input while valid). */
  idp: new Set<string>(),
  asi: '',
  results: QIS_RESULTS_HTML,
  log: [] as string[],
  planFile: '20260608-SoSe2026-Pruefungsplanung.pdf',
  plan: examPlan(de(EXAM)),
}

/** Exam plan PDF: header and two rows (one of another program). */
function examPlan(date: string) {
  const X = [40, 90, 120, 170, 250, 420, 500, 560, 610, 680]
  const row = (y: number, cells: string[]) =>
    cells.map((text, i) => ({ x: X[i]!, y, text })).filter((c) => c.text)
  return tablePdf([
    { x: 40, y: 30, text: 'Version 1.1, 08.06.2026' },
    ...row(50, [
      'Datum',
      'Tag',
      'Studieng.',
      'Code',
      'Fachname',
      'PrüferIn',
      'Raum',
      'Dauer',
      'Beginn',
      'Titel',
    ]),
    ...row(65, [date, 'Do', 'BMI18', 'BMI 02', 'Datenbanksysteme 1', 'Prof. X', 'H1', '90', '10:00']),
    ...row(80, [date, 'Do', 'BMT18', 'BMT 01', 'Datenbanksysteme 1', 'Prof. X', 'H1', '90', '12:00']),
  ])
}

function page(body: string, loggedIn: boolean) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>eCampus</title></head><body>${
    loggedIn ? '<a href="/qisserver/rds?state=user&type=4" id="logoutButton">Abmelden</a>' : ''
  }${body}</body></html>`
}

function startFake(): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    const cookie = /sess=([a-z0-9]+)/.exec(req.headers.cookie ?? '')?.[1]
    const idpCookie = /idp=([a-z0-9]+)/.exec(req.headers.cookie ?? '')?.[1]
    const loggedIn = !!cookie && fake.sessions.has(cookie)
    const send = (html: string) => {
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.end(html)
    }
    const loginForm = page(
      '<a href="/qisserver/api/identityprovider/redirect/2/login">Anmelden mit Hochschul-Account</a><form method="post" action="/login"><label>Benutzer <input name="asdf"></label><label>Passwort <input type="password" name="fdsa"></label><button>Anmelden</button></form>',
      false,
    )
    fake.log.push(url.pathname + url.search)
    if (url.pathname === '/login' && req.method === 'POST') {
      const id = Math.random().toString(36).slice(2)
      const idp = Math.random().toString(36).slice(2)
      fake.sessions.add(id)
      fake.idp.add(idp)
      res.statusCode = 302
      res.setHeader('set-cookie', [`sess=${id}; Path=/`, `idp=${idp}; Path=/`])
      res.setHeader('location', '/qisserver/pages/cs/sys/portal/hisinoneStartPage.faces')
      return res.end()
    }
    if (url.pathname === '/pruefungen') {
      res.setHeader('content-type', 'text/html; charset=utf-8')
      return res.end(`<a href="/docs/${fake.planFile}">Prüfungsplanung</a>`)
    }
    if (url.pathname.startsWith('/docs/')) {
      res.setHeader('content-type', 'application/pdf')
      return res.end(fake.plan)
    }
    if (url.pathname === '/qisserver/api/identityprovider/redirect/2/login') {
      if (!idpCookie || !fake.idp.has(idpCookie)) return send(loginForm)
      const id = Math.random().toString(36).slice(2)
      fake.sessions.add(id)
      res.statusCode = 302
      res.setHeader('set-cookie', `sess=${id}; Path=/`)
      res.setHeader('location', '/qisserver/pages/cs/sys/portal/hisinoneStartPage.faces')
      return res.end()
    }
    if (url.pathname.endsWith('hisinoneStartPage.faces'))
      return send(loggedIn ? page('<h1>Startseite</h1>', true) : loginForm)
    if (url.pathname.endsWith('hisinoneIframePage.faces')) {
      if (!loggedIn) return send(loginForm)
      fake.asi = Math.random().toString(36).slice(2)
      return send(
        page(
          `<iframe src="/qisserver/rds?state=change&type=1&moduleParameter=studyPOSMenu&next=menu.vm&asi=${fake.asi}" width="900" height="600"></iframe>`,
          true,
        ),
      )
    }
    if (url.pathname === '/qisserver/rds') {
      if (!loggedIn || url.searchParams.get('asi') !== fake.asi)
        return send(page('<p>Ihre Sitzung ist abgelaufen.</p>', false))
      const next = url.searchParams.get('next')
      const asi = `asi=${fake.asi}`
      if (url.searchParams.get('state') === 'change')
        return send(
          page(
            `<a href="/qisserver/rds?state=info&${asi}">Info über angemeldete Prüfungen</a> <a href="/qisserver/rds?state=notenspiegelStudent&next=tree.vm&nextdir=qispos/notenspiegel/student&${asi}">Notenspiegel</a>`,
            true,
          ),
        )
      if (next === 'tree.vm')
        return send(
          page(
            `<a href="/qisserver/rds?state=notenspiegelStudent&next=tree.vm&expand=1&${asi}">Abschluss 84 Bachelor Informatik</a> <a title="Leistungen für Abschluss 84 Bachelor Informatik anzeigen" href="/qisserver/rds?state=notenspiegelStudent&next=list.vm&nextdir=qispos/notenspiegel/student&nodeID=auswahlBaum%7Cabschluss%3Aabschl%3D84&${asi}"><img alt="Leistungen anzeigen"></a>`,
            true,
          ),
        )
      if (next === 'list.vm')
        return send(
          fake.results.replace('<body>', '<body><a href="/qisserver/rds?state=user&type=4">Abmelden</a>'),
        )
    }
    res.statusCode = 404
    res.end()
  })
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}` }),
    ),
  )
}

let app: ElectronApplication
let window: Page
let folder: string
let userData: string
let ecampus: Awaited<ReturnType<typeof startFake>>
const section = () => window.getByRole('region', { name: 'eCampus (Noten)' })

test.beforeAll(async () => {
  ecampus = await startFake()
  folder = mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-ecampus-'))
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
  ecampus?.server.close()
})

test('meldet sich an und findet die Leistungsübersicht selbst', async () => {
  await section()
    .getByRole('button', { name: /Adressen anpassen/ })
    .click()
  await section()
    .getByRole('textbox', { name: 'eCampus-Startseite' })
    .fill(`${ecampus.url}/qisserver/pages/cs/sys/portal/hisinoneStartPage.faces`)
  await section()
    .getByRole('textbox', { name: 'Seite der Prüfungsverwaltung' })
    .fill(`${ecampus.url}/qisserver/pages/cs/sys/portal/hisinoneIframePage.faces?id=Pruefungsverwaltung`)
  const popup = app.waitForEvent('window')
  await section().getByRole('button', { name: 'Anmelden & Leistungen holen' }).click()
  const login = await popup
  // Progress is visible while the user signs in.
  await expect(window.getByTestId('progress-summary')).toContainText('eCampus: Anmeldung')
  await login.getByLabel('Benutzer').fill('alex')
  await login.getByLabel('Passwort').fill('geheim')
  await login.getByRole('button', { name: 'Anmelden' }).click()
  await expect(window.getByTestId('progress-summary')).toContainText('5 Leistungen aus eCampus gelesen', {
    timeout: 20_000,
  })
  await expect(section().getByRole('status')).toContainText('5 Einträge')
  expect(fake.log.some((l) => l.includes('next=list.vm'))).toBe(true)
  // The login is in the app profile – the password nowhere.
  expect(readFileSync(path.join(userData, 'ecampus.json'), 'utf8')).not.toContain('geheim')
})

test('zeigt Noten, Schnitt und ECTS und übernimmt sie in die Module', async () => {
  await section().getByRole('button', { name: 'Leistungen ansehen' }).click()
  await closeSettings()
  const table = window.getByRole('table', { name: 'Leistungen' })
  await expect(table).toContainText('Lineare Algebra')
  await expect(table).toContainText('1,3')
  await expect(window.getByText('ECTS bestanden')).toBeVisible()
  // One row per module; the attempts open below it.
  await expect(table.getByRole('button', { name: /Programmierung 1/ })).toHaveCount(1)
  await table.getByRole('button', { name: /Programmierung 1/ }).click()
  await expect(table).toContainText('2. Versuch')
  await expect(table).toContainText('nicht bestanden')
  await window.getByRole('button', { name: 'Studium aktualisieren …' }).click()
  const dialog = window.getByRole('dialog', { name: 'Studium aktualisieren' })
  await dialog.getByRole('combobox', { name: 'Studiengang und Prüfungsordnung' }).selectOption({ index: 1 })
  await dialog.getByRole('combobox', { name: 'Erstes Semester' }).selectOption('WiSe 24/25')
  await expect(dialog).toContainText('5. Fachsemester (WiSe 26/27)')
  await expect(dialog).toContainText('Objektorientierte Programmierung 1')
  await dialog.getByRole('button', { name: /Änderungen übernehmen/ }).click()
  await expect(window.getByTestId('progress-summary')).toContainText('Änderungen im Studium übernommen', {
    timeout: 20_000,
  })
  await expect
    .poll(() => readFileSync(path.join(folder, 'Studium/Module/Lineare Algebra.md'), 'utf8'))
    .toContain('Note: 1.3')
  const la = readFileSync(path.join(folder, 'Studium/Module/Lineare Algebra.md'), 'utf8')
  expect(la).toContain('Status: Bestanden')
  expect(la).toContain('Versuche: 1')
  const math = readFileSync(path.join(folder, 'Studium/Module/Mathematik 1.md'), 'utf8')
  expect(math).toContain('Nr: BMI 05')
  expect(math).toContain('type: related')
  expect(readFileSync(path.join(folder, 'Studium.md'), 'utf8')).toContain('beginn: WiSe 24/25')
  // The dashboard opens and shows this semester's modules.
  await expect(window.getByRole('heading', { name: 'Belege ich gerade' })).toBeVisible()
  await expect(window.getByRole('region', { name: 'Module laufend' })).toBeVisible()
  await window.getByRole('button', { name: 'Noten & Leistungen' }).click()
})

test('holt den Prüfungsplan und trägt die eigenen Termine ein', async () => {
  await closeSettings()
  const dash = path.join(folder, 'Studium.md')
  writeFileSync(
    dash,
    readFileSync(dash, 'utf8').replace(
      'beginn: WiSe 24/25',
      `beginn: WiSe 24/25\n  pruefungsplan: ${ecampus.url}/pruefungen`,
    ),
  )
  await expect.poll(() => readFileSync(dash, 'utf8')).toContain('pruefungsplan')
  await window.waitForTimeout(800)
  await window.getByRole('button', { name: 'Prüfungsplan prüfen' }).click()
  await expect(window.getByTestId('progress-summary')).toContainText('Prüfungstermine eingetragen', {
    timeout: 20_000,
  })
  const exams = path.join(folder, 'Studium/Prüfungen')
  const file = readdirSync(exams).find((f) => f.includes('Datenbanksysteme 1'))!
  const text = readFileSync(path.join(exams, file), 'utf8')
  expect(text).toContain(`Datum: ${iso(EXAM)}`)
  expect(text).toContain('Beginn: 10:00')
  expect(readdirSync(exams).filter((f) => f.includes('Datenbanksysteme 1'))).toHaveLength(1)
  expect(readdirSync(path.join(folder, 'Studium/Unterlagen/Prüfungsplan'))).toEqual([fake.planFile])
  // A new version moves the date: updated and reported.
  fake.plan = examPlan(de(MOVED))
  fake.planFile = '20260701-SoSe2026-Pruefungsplanung.pdf'
  await window.getByRole('button', { name: 'Prüfungsplan prüfen' }).click()
  await expect.poll(() => readFileSync(path.join(exams, file), 'utf8')).toContain(`Datum: ${iso(MOVED)}`)
  const bell = window
    .getByRole('navigation', { name: 'Werkzeugleiste rechts' })
    .getByRole('button', { name: /Benachrichtigungen/ })
  await bell.click()
  await expect(window.getByRole('complementary', { name: 'Benachrichtigungen' })).toContainText(
    'Prüfungstermin geändert',
  )
  await bell.click()
})

test('prüft im Hintergrund mit neuer Sitzung und meldet neue Noten', async () => {
  await closeSettings()
  fake.results = QIS_RESULTS_HTML.replace('<td></td><td>angemeldet</td>', '<td>2,0</td><td>bestanden</td>')
  await window.getByRole('button', { name: 'Aktualisieren', exact: true }).click()
  await expect(window.getByRole('table', { name: 'Leistungen' })).toContainText('2,0')
  const bell = window
    .getByRole('navigation', { name: 'Werkzeugleiste rechts' })
    .getByRole('button', { name: /Benachrichtigungen/ })
  await bell.click()
  await expect(window.getByRole('complementary', { name: 'Benachrichtigungen' })).toContainText('Datenbanken')
  await bell.click()
})

test('erneuert eine abgelaufene eCampus-Sitzung selbst über die Hochschul-Anmeldung', async () => {
  await closeSettings()
  fake.sessions.clear()
  fake.log.length = 0
  await window.getByRole('button', { name: 'Aktualisieren', exact: true }).click()
  await expect.poll(() => fake.log.some((l) => l.includes('next=list.vm')), { timeout: 20_000 }).toBe(true)
  expect(fake.log.some((l) => l.includes('identityprovider'))).toBe(true)
  await expect(window.getByRole('button', { name: 'Aktualisieren', exact: true })).toBeEnabled({
    timeout: 10_000,
  })
  await expect(window.getByRole('alert').filter({ hasText: 'Anmeldung ist abgelaufen' })).toHaveCount(0)
})

test('sagt Bescheid, wenn die Anmeldung abgelaufen ist', async () => {
  await closeSettings()
  fake.sessions.clear()
  fake.idp.clear()
  await window.getByRole('button', { name: 'Aktualisieren', exact: true }).click()
  await expect(window.getByRole('alert').filter({ hasText: 'Anmeldung ist abgelaufen' }).first()).toBeVisible(
    {
      timeout: 20_000,
    },
  )
})
