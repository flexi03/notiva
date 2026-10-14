/**
 * Moodle pages in their own windows: the sign-in (Microsoft/SSO incl. 2FA) and course pages
 * "in the app". All of them share one persistent session (`persist:moodle`) so the university
 * login stays valid – fully separated from Notiva's own window, without preload or Node, sandboxed.
 */
import { BrowserWindow, session, shell, type Session } from 'electron'
import path from 'node:path'
import { launchUrl, newPassport, parseSsoAnswer, SSO_SCHEME } from './moodleSso'

const PARTITION = 'persist:moodle'
const LOGIN_TIMEOUT = 15 * 60_000

let prepared: Session | null = null
let pendingAnswer: ((url: string) => void) | null = null

/** Moodle's session: no permissions (camera, notifications …), answers of the sign-in caught. */
function moodleSession(): Session {
  if (prepared) return prepared
  const ses = session.fromPartition(PARTITION)
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  // Some identity providers block "embedded" browsers: present as plain Chrome.
  ses.setUserAgent(ses.getUserAgent().replace(/\s(Electron|notiva)\/\S+/gi, ''))
  ses.protocol.handle(SSO_SCHEME, (request) => {
    pendingAnswer?.(request.url)
    return new Response(
      '<!doctype html><meta charset="utf-8"><p>Angemeldet – du kannst das Fenster schließen.</p>',
      {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      },
    )
  })
  prepared = ses
  return ses
}

function moodleWindow(parent: BrowserWindow | null, title: string, width = 980, height = 760): BrowserWindow {
  const win = new BrowserWindow({
    ...(parent ? { parent } : {}),
    width,
    height,
    title,
    autoHideMenuBar: true,
    webPreferences: {
      session: moodleSession(),
      // Hides passkeys (Touch ID / Face ID can't work in Electron – the prompt would hang).
      preload: path.join(__dirname, 'moodlePreload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
    },
  })
  // Pop-ups (e.g. "open in new window") stay in this window; other schemes go to the system.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void win.loadURL(url)
    else if (/^mailto:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  return win
}

/** Opens the Moodle app sign-in and resolves with the token once Moodle hands it over. */
export function ssoLogin(parent: BrowserWindow | null, site: string): Promise<{ token: string }> {
  const passport = newPassport()
  const win = moodleWindow(parent, 'Bei Moodle anmelden', 560, 760)
  return new Promise((resolve, reject) => {
    let done = false
    const finish = (error: Error | null, token?: string) => {
      if (done) return
      done = true
      pendingAnswer = null
      clearTimeout(timer)
      if (!win.isDestroyed()) win.close()
      if (error) reject(error)
      else resolve({ token: token! })
    }
    const check = (url: string) => {
      if (!url.startsWith(`${SSO_SCHEME}://`)) return false
      const answer = parseSsoAnswer(url, site, passport)
      finish(answer ? null : new Error('Moodle hat eine ungültige Anmeldung zurückgegeben'), answer?.token)
      return true
    }
    pendingAnswer = (url) => void check(url)
    const timer = setTimeout(
      () => finish(new Error('Anmeldung abgebrochen (Zeitüberschreitung)')),
      LOGIN_TIMEOUT,
    )
    const intercept = (e: Electron.Event, url: string) => {
      if (check(url)) e.preventDefault()
    }
    win.webContents.on('will-redirect', intercept)
    win.webContents.on('will-navigate', intercept)
    win.webContents.on('did-fail-load', (_e, code, description, url) => {
      if (url && check(url)) return
      // -3 = aborted (our own preventDefault); real errors are shown to the user.
      if (code !== -3 && !done && url.startsWith(site))
        finish(new Error(`Moodle-Anmeldeseite lädt nicht: ${description}`))
    })
    win.on('closed', () => finish(new Error('Anmeldung abgebrochen')))
    void win.loadURL(launchUrl(site, passport))
  })
}

/** A Moodle page (course, file, forum …) in a Notiva window with the university login. */
export function openMoodlePage(parent: BrowserWindow | null, url: string): void {
  const win = moodleWindow(parent, 'Moodle')
  void win.loadURL(url)
}

/** Signs out of the Moodle web session (cookies of the login). */
export async function clearMoodleSession(): Promise<void> {
  await moodleSession().clearStorageData()
}
