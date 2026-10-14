/**
 * eCampus (HISinOne/QIS) exam results – main process. There is no API for students, so Notiva uses
 * the web pages like the user does: a window with the university login (Microsoft, 2FA) in its own
 * persistent session, then the "Prüfungsverwaltung" → "Leistungen anzeigen" pages. The results table
 * is recognized in any frame; the way there is remembered (and found again in later sessions).
 */
import { BrowserWindow, session, type Session, type WebContents } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  extractTables,
  pageState,
  parseResults,
  pickResultsLink,
  snapshotRecords,
  withSessionAsi,
  type ExamSnapshot,
  type PageState,
  type RawTable,
} from '../src/lib/ecampus'

export interface EcampusConfig {
  startUrl: string
  examsUrl: string
  /** Single sign-on start (HISinOne: "Anmelden mit HSD Account") – found on the login page. */
  ssoUrl?: string
  /** URL of the results list found last time (session part replaced on each visit). */
  resultsUrl?: string
}

export const ECAMPUS_DEFAULTS: EcampusConfig = {
  startUrl: 'https://ecampus.hs-duesseldorf.de/qisserver/pages/cs/sys/portal/hisinoneStartPage.faces',
  examsUrl:
    'https://ecampus.hs-duesseldorf.de/qisserver/pages/cs/sys/portal/hisinoneIframePage.faces?id=Pruefungsverwaltung&navigationPosition=hisinoneMeinStudium%2CHSD_Pruefungsverwaltung&recordRequest=true',
  ssoUrl: 'https://ecampus.hs-duesseldorf.de/qisserver/api/identityprovider/redirect/2/login',
}

export class NeedsLogin extends Error {
  constructor() {
    super('Die eCampus-Anmeldung ist abgelaufen – bitte neu anmelden (Einstellungen → eCampus).')
    this.name = 'NeedsLogin'
  }
}

const PARTITION = 'persist:ecampus'
/** How long the sign-in is kept across restarts (the university may end it earlier). */
const KEEP_DAYS = 14
/** HISinOne: "Anmelden mit … Account" leads to the university's identity provider. */
const SSO_SCAN = `(() => { const a = Array.from(document.querySelectorAll('a[href]')).find((x) => /identityprovider|shibboleth|saml|\\/sso/i.test(x.getAttribute('href') || '') && /anmelden|login/i.test(x.textContent || '')); return a ? a.href : null })()`
const SCAN = `(() => { const extract = ${extractTables.toString()}; return (${pageState.toString()})(document, extract) })()`

type Progress = (text: string) => void

export function parseEcampusConfig(raw: unknown): EcampusConfig {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const url = (v: unknown, fallback: string) => {
    if (typeof v !== 'string') return fallback
    try {
      const u = new URL(v.trim())
      const local = u.hostname === '127.0.0.1' || u.hostname === 'localhost'
      return u.protocol === 'https:' || (local && u.protocol === 'http:') ? u.toString() : fallback
    } catch {
      return fallback
    }
  }
  const config: EcampusConfig = {
    startUrl: url(r.startUrl, ECAMPUS_DEFAULTS.startUrl),
    examsUrl: url(r.examsUrl, ECAMPUS_DEFAULTS.examsUrl),
  }
  const results = typeof r.resultsUrl === 'string' ? url(r.resultsUrl, '') : ''
  if (results) config.resultsUrl = results
  const sso =
    typeof r.ssoUrl === 'string'
      ? url(r.ssoUrl, '')
      : config.startUrl === ECAMPUS_DEFAULTS.startUrl
        ? ECAMPUS_DEFAULTS.ssoUrl!
        : ''
  // Only on the eCampus itself (the link leads from there to the identity provider).
  if (sso && new URL(sso).origin === new URL(config.startUrl).origin) config.ssoUrl = sso
  return config
}

export class Ecampus {
  private ses: Session | null = null

  constructor(
    private readonly dir: string,
    private readonly preload: string,
  ) {}

  private get configFile() {
    return path.join(this.dir, 'ecampus.json')
  }
  get snapshotFile() {
    return path.join(this.dir, 'ecampus-snapshot.json')
  }

  async config(): Promise<EcampusConfig | null> {
    try {
      return parseEcampusConfig(JSON.parse(await fs.readFile(this.configFile, 'utf8')))
    } catch {
      return null
    }
  }

  private async saveConfig(config: EcampusConfig): Promise<void> {
    await fs.writeFile(this.configFile, JSON.stringify(config), { mode: 0o600 })
  }

  async snapshot(): Promise<ExamSnapshot | null> {
    try {
      const snapshot = JSON.parse(await fs.readFile(this.snapshotFile, 'utf8')) as ExamSnapshot
      return { ...snapshot, records: snapshotRecords(snapshot) }
    } catch {
      return null
    }
  }

  private session(): Session {
    if (this.ses) return this.ses
    const ses = session.fromPartition(PARTITION)
    ses.setPermissionRequestHandler((_wc, _p, callback) => callback(false))
    ses.setUserAgent(ses.getUserAgent().replace(/\s(Electron|notiva)\/\S+/gi, ''))
    // Session cookies (eCampus, identity provider) would end with the app: keep them like
    // "stay signed in" so the background check still works after a restart. Only this profile.
    ses.cookies.on('changed', (_event, cookie, cause, removed) => {
      if (removed || cause !== 'explicit' || cookie.session === false || !cookie.domain) return
      const host = cookie.domain.replace(/^\./, '')
      void ses.cookies
        .set({
          url: `${cookie.secure ? 'https' : 'http'}://${host}${cookie.path ?? '/'}`,
          name: cookie.name,
          value: cookie.value,
          ...(cookie.hostOnly ? {} : { domain: cookie.domain }),
          path: cookie.path ?? '/',
          secure: cookie.secure ?? false,
          httpOnly: cookie.httpOnly ?? false,
          ...(cookie.sameSite ? { sameSite: cookie.sameSite } : {}),
          expirationDate: Date.now() / 1000 + KEEP_DAYS * 86_400,
        })
        .catch(() => undefined)
    })
    this.ses = ses
    return ses
  }

  private window(show: boolean, parent: BrowserWindow | null): BrowserWindow {
    const win = new BrowserWindow({
      ...(parent && show ? { parent } : {}),
      show,
      width: 1100,
      height: 800,
      title: 'eCampus',
      autoHideMenuBar: true,
      webPreferences: {
        session: this.session(),
        preload: this.preload,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) void win.loadURL(url)
      return { action: 'deny' }
    })
    return win
  }

  /** State of every frame (the results live in an iframe). */
  private async scan(wc: WebContents): Promise<PageState[]> {
    const frames = wc.mainFrame.framesInSubtree
    const states = await Promise.all(
      frames.map((f) => f.executeJavaScript(SCAN).catch(() => null) as Promise<PageState | null>),
    )
    return states.filter((s): s is PageState => s !== null)
  }

  /** Waits until the page and its frames stopped loading for a moment. */
  private settle(wc: WebContents, quiet = 900, max = 25_000): Promise<void> {
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const done = () => {
        clearTimeout(timer)
        clearTimeout(limit)
        wc.removeListener('did-stop-loading', arm)
        wc.removeListener('did-frame-finish-load', arm)
        resolve()
      }
      const arm = () => {
        clearTimeout(timer)
        timer = setTimeout(() => (wc.isLoading() ? arm() : done()), quiet)
      }
      const limit = setTimeout(done, max)
      wc.on('did-stop-loading', arm)
      wc.on('did-frame-finish-load', arm)
      arm()
    })
  }

  private results(
    states: PageState[],
  ): { records: ReturnType<typeof parseResults>; url: string; tables: RawTable[] } | null {
    for (const s of states) {
      const records = parseResults(s.tables)
      if (records.length) return { records, url: s.url, tables: s.tables }
    }
    return null
  }

  /** Clicks its way from the exam administration to the results list (max. a few steps). */
  private async walk(wc: WebContents, onProgress: Progress): Promise<ReturnType<Ecampus['results']>> {
    const visited = new Set<string>()
    for (let step = 0; step < 5; step++) {
      await this.settle(wc)
      const states = await this.scan(wc)
      const found = this.results(states)
      if (found) return found
      if (states.some((s) => s.loginPage) && !states.some((s) => s.loggedIn)) throw new NeedsLogin()
      const links = states.flatMap((s) => s.links)
      const next = pickResultsLink(links, visited)
      if (!next) return null
      visited.add(next.href)
      onProgress(`Öffne „${next.text || next.title}“`)
      // Navigate the frame the link lives in (keeps the HISinOne frame around it).
      const frame = wc.mainFrame.framesInSubtree.find((f) =>
        states.find((s) => s.url === f.url)?.links.includes(next),
      )
      if (frame)
        await frame.executeJavaScript(`location.href = ${JSON.stringify(next.href)}`).catch(() => undefined)
      else await wc.loadURL(next.href).catch(() => undefined)
    }
    return null
  }

  private async finish(
    config: EcampusConfig,
    found: NonNullable<ReturnType<Ecampus['results']>>,
  ): Promise<ExamSnapshot> {
    await this.saveConfig({ ...(await this.config()), ...config, resultsUrl: found.url })
    const snapshot: ExamSnapshot = {
      site: new URL(config.startUrl).origin,
      fetchedAt: new Date().toISOString(),
      records: found.records,
      tables: found.tables,
    }
    await fs.writeFile(this.snapshotFile, JSON.stringify(snapshot), { mode: 0o600 })
    return snapshot
  }

  /**
   * Sign-in window: the user logs in (Microsoft, 2FA). Notiva then opens the exam administration
   * and looks for the results – the user can also click there themselves; any results table counts.
   */
  login(parent: BrowserWindow | null, raw: unknown, onProgress: Progress): Promise<ExamSnapshot> {
    const config = parseEcampusConfig(raw)
    const win = this.window(true, parent)
    const wc = win.webContents
    return new Promise((resolve, reject) => {
      let finished = false
      let walking = false
      let openedExams = false
      const check = async () => {
        if (finished || walking || win.isDestroyed()) return
        const states = await this.scan(wc)
        const found = this.results(states)
        if (found) {
          finished = true
          onProgress('Leistungen gefunden')
          const snapshot = await this.finish(config, found)
          if (!win.isDestroyed()) win.close()
          return resolve(snapshot)
        }
        if (!states.some((s) => s.loggedIn)) await this.rememberSso(wc, config)
        if (!openedExams && states.some((s) => s.loggedIn)) {
          openedExams = true
          walking = true
          onProgress('Angemeldet – öffne die Prüfungsverwaltung')
          await wc.loadURL(config.examsUrl).catch(() => undefined)
          const walked = await this.walk(wc, onProgress).catch(() => null)
          walking = false
          if (walked && !finished) {
            finished = true
            const snapshot = await this.finish(config, walked)
            if (!win.isDestroyed()) win.close()
            resolve(snapshot)
          } else onProgress('Bitte in der Prüfungsverwaltung „Leistungen anzeigen“ öffnen')
        }
      }
      let timer: ReturnType<typeof setTimeout> | undefined
      const soon = () => {
        clearTimeout(timer)
        timer = setTimeout(() => void check(), 700)
      }
      wc.on('did-stop-loading', soon)
      wc.on('did-frame-finish-load', soon)
      // The sign-on link sits in an overlay: remember where the user's click leads.
      wc.on('will-navigate', (event) => {
        if (/identityprovider|shibboleth|saml|\/sso/i.test(event.url) && !config.ssoUrl) {
          const remembered = parseEcampusConfig({ ...config, ssoUrl: event.url }).ssoUrl
          if (remembered) config.ssoUrl = remembered
        }
      })
      win.on('closed', () => {
        if (!finished) reject(new Error('eCampus-Anmeldung abgebrochen'))
      })
      onProgress('Bitte im eCampus-Fenster anmelden')
      void win.loadURL(config.startUrl)
    })
  }

  /** Background check in a hidden window; throws {@link NeedsLogin} when the session expired. */
  async fetch(onProgress: Progress): Promise<ExamSnapshot> {
    const config = await this.config()
    if (!config) throw new Error('eCampus ist nicht verbunden')
    const win = this.window(false, null)
    const wc = win.webContents
    try {
      onProgress('Öffne die Prüfungsverwaltung')
      await wc.loadURL(config.examsUrl).catch(() => undefined)
      await this.settle(wc)
      let states = await this.scan(wc)
      if (!states.some((s) => s.loggedIn)) {
        // Signed out on the eCampus – the identity provider may still know us (no input needed).
        onProgress('Anmeldung wird erneuert')
        if (!(await this.silentLogin(wc, config))) throw new NeedsLogin()
        await wc.loadURL(config.examsUrl).catch(() => undefined)
        await this.settle(wc)
        states = await this.scan(wc)
        if (!states.some((s) => s.loggedIn)) throw new NeedsLogin()
      }
      let found = this.results(states)
      // Remembered results page with the session of today.
      if (!found && config.resultsUrl) {
        const current = states.map((s) => s.url).find((u) => /[?&]asi=/.test(u))
        const url = current ? withSessionAsi(config.resultsUrl, current) : null
        if (url) {
          onProgress('Öffne die Leistungsübersicht')
          await wc.loadURL(url).catch(() => undefined)
          await this.settle(wc)
          states = await this.scan(wc)
          found = this.results(states)
        }
      }
      found ??= await this.walk(wc, onProgress)
      if (!found)
        throw new Error(
          'Die Leistungsübersicht wurde nicht gefunden – bitte einmal neu anmelden und „Leistungen anzeigen“ öffnen.',
        )
      onProgress('Leistungen gelesen')
      return await this.finish(config, found)
    } finally {
      if (!win.isDestroyed()) win.destroy()
    }
  }

  /**
   * Single sign-on without a window: follows "Anmelden mit … Account". Works when the identity
   * provider still has a session (Microsoft "angemeldet bleiben"); a login form means no.
   */
  private async silentLogin(wc: WebContents, config: EcampusConfig): Promise<boolean> {
    const sso =
      config.ssoUrl ??
      ((await wc.mainFrame.executeJavaScript(SSO_SCAN).catch(() => null)) as string | null) ??
      null
    if (!sso || !/^https?:/i.test(sso)) return false
    await wc.loadURL(sso).catch(() => undefined)
    // Identity providers redirect a few times (and post forms) – wait until it has settled.
    await this.settle(wc, 2500, 30_000)
    const states = await this.scan(wc)
    return states.some((s) => s.loggedIn) && !states.some((s) => s.loginPage && !s.loggedIn)
  }

  /** Remembers the single sign-on link of the login page (used for {@link silentLogin}). */
  private async rememberSso(wc: WebContents, config: EcampusConfig): Promise<void> {
    if (config.ssoUrl) return
    const sso = (await wc.mainFrame.executeJavaScript(SSO_SCAN).catch(() => null)) as string | null
    if (sso && /^https?:/i.test(sso)) config.ssoUrl = parseEcampusConfig({ ...config, ssoUrl: sso }).ssoUrl
  }

  async disconnect(): Promise<void> {
    await this.session().clearStorageData()
    await fs.rm(this.configFile, { force: true })
    await fs.rm(this.snapshotFile, { force: true })
  }
}
