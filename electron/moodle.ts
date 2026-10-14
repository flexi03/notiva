/**
 * Moodle access (main process only – the renderer has no network). Two ways in:
 * - web service like the Moodle app: login once with user name + password (only the token is
 *   kept, never the password) or a token from Moodle's security keys page,
 * - the calendar link (Kalender → Exportieren), which needs no password but only has dates.
 * The secret (token or calendar link) is stored encrypted with the OS keychain (safeStorage).
 */
import { snapshotFromIcs, snapshotFromWebService, type MoodleSnapshot } from '../src/lib/moodle'

export type MoodleConnect =
  | { mode: 'login'; site: string; username: string; password: string }
  | { mode: 'token'; site: string; token: string }
  | { mode: 'calendar'; url: string }

export interface MoodleConfig {
  mode: 'webservice' | 'calendar'
  site: string
  /** Web service token or the full calendar link – both secret. */
  secret: string
  user?: string
  userId?: number
}

export interface MoodleStatus {
  connected: boolean
  mode?: MoodleConfig['mode']
  site?: string
  user?: string
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

const TIMEOUT = 30_000
const MAX_RESPONSE = 10_000_000

/** https only (http just for localhost, e.g. tests); no credentials in the URL. */
export function checkUrl(raw: unknown): URL {
  if (typeof raw !== 'string' || raw.length > 2000) throw new MoodleError('Ungültige Adresse')
  let url: URL
  try {
    url = new URL(raw.trim().includes('://') ? raw.trim() : `https://${raw.trim()}`)
  } catch {
    throw new MoodleError('Ungültige Adresse')
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))
    throw new MoodleError('Die Adresse muss mit https:// beginnen')
  if (url.username || url.password) throw new MoodleError('Die Adresse darf keine Zugangsdaten enthalten')
  return url
}

/** Moodle root from what the user typed ("moodle.uni.de", ".../my/", ".../login/index.php"). */
export function siteRoot(raw: unknown): string {
  const url = checkUrl(raw)
  const path = url.pathname.replace(/\/(my|login|course|calendar|admin)(\/.*)?$/, '').replace(/\/+$/, '')
  return `${url.origin}${path}`
}

export function parseConnect(raw: unknown): MoodleConnect {
  if (typeof raw !== 'object' || raw === null) throw new MoodleError('Ungültige Anfrage')
  const r = raw as Record<string, unknown>
  const str = (v: unknown, max = 500) => (typeof v === 'string' && v.length <= max ? v : '')
  if (r.mode === 'calendar') {
    const url = checkUrl(r.url)
    if (!url.search)
      throw new MoodleError('Das ist kein Kalender-Link (Moodle: Kalender → Exportieren → URL abfragen)')
    return { mode: 'calendar', url: url.toString() }
  }
  if (r.mode === 'token') {
    const token = str(r.token).trim()
    if (!/^[a-zA-Z0-9]{16,128}$/.test(token)) throw new MoodleError('Der Token sieht nicht richtig aus')
    return { mode: 'token', site: siteRoot(r.site), token }
  }
  if (r.mode === 'login') {
    const username = str(r.username, 200).trim()
    const password = str(r.password, 500)
    if (!username || !password) throw new MoodleError('Benutzername und Passwort fehlen')
    return { mode: 'login', site: siteRoot(r.site), username, password }
  }
  throw new MoodleError('Ungültige Anfrage')
}

export class MoodleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MoodleError'
  }
}

/** Readable messages for Moodle's error codes. */
function explain(code: string, message: string): string {
  switch (code) {
    case 'invalidlogin':
      return 'Benutzername oder Passwort stimmen nicht. Meldet sich deine Uni über ein eigenes Portal (SSO) an, nimm den Kalender-Link oder einen Token.'
    case 'invalidtoken':
      return 'Die Anmeldung bei Moodle ist abgelaufen – bitte neu verbinden.'
    case 'enablewsdescription':
    case 'servicenotavailable':
    case 'accessexception':
    case 'webservicesnotenabled':
      return 'Dein Moodle erlaubt diesen Zugriff nicht (Web-Services bzw. Mobile-App sind aus). Nimm stattdessen den Kalender-Link.'
    case 'sitemaintenance':
      return 'Moodle wird gerade gewartet. Versuch es später noch einmal.'
    default:
      return message || code || 'Unbekannter Fehler von Moodle'
  }
}

export class MoodleClient {
  constructor(private readonly fetchFn: Fetch) {}

  private async request(url: string, body?: URLSearchParams): Promise<string> {
    const target = new URL(url)
    let response: Response
    try {
      response = await this.fetchFn(url, {
        method: body ? 'POST' : 'GET',
        ...(body ? { body, headers: { 'content-type': 'application/x-www-form-urlencoded' } } : {}),
        signal: AbortSignal.timeout(TIMEOUT),
        redirect: 'follow',
      })
    } catch (error) {
      throw new MoodleError(`Moodle ist nicht erreichbar (${target.host}): ${(error as Error).message}`)
    }
    // Redirects must stay on the same server (no token leaks to other hosts).
    if (response.url && new URL(response.url).host !== target.host)
      throw new MoodleError(`Moodle hat auf einen anderen Server umgeleitet (${new URL(response.url).host})`)
    if (!response.ok) throw new MoodleError(`Moodle antwortet mit Fehler ${response.status}`)
    const text = await response.text()
    if (text.length > MAX_RESPONSE) throw new MoodleError('Antwort von Moodle ist zu groß')
    return text
  }

  private async json(url: string, body: URLSearchParams): Promise<unknown> {
    const text = await this.request(url, body)
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      throw new MoodleError('Unerwartete Antwort – ist das wirklich die Moodle-Adresse?')
    }
    if (typeof data === 'object' && data !== null) {
      const d = data as Record<string, unknown>
      if (typeof d.exception === 'string' || typeof d.error === 'string')
        throw new MoodleError(explain(String(d.errorcode ?? ''), String(d.message ?? d.error ?? '')))
    }
    return data
  }

  /** Web service function call (REST, JSON). */
  call(
    site: string,
    token: string,
    fn: string,
    params: Record<string, string | number> = {},
  ): Promise<unknown> {
    const body = new URLSearchParams({ wstoken: token, wsfunction: fn, moodlewsrestformat: 'json' })
    for (const [k, v] of Object.entries(params)) body.set(k, String(v))
    return this.json(`${site}/webservice/rest/server.php`, body)
  }

  async login(site: string, username: string, password: string): Promise<string> {
    const body = new URLSearchParams({ username, password, service: 'moodle_mobile_app' })
    const data = (await this.json(`${site}/login/token.php`, body)) as { token?: unknown }
    if (typeof data.token !== 'string' || !data.token)
      throw new MoodleError('Moodle hat keinen Zugang ausgestellt')
    return data.token
  }

  /** Checks the access and returns what is stored (without the password). */
  async connect(request: MoodleConnect): Promise<MoodleConfig> {
    if (request.mode === 'calendar') {
      const text = await this.request(request.url)
      if (!text.includes('BEGIN:VCALENDAR')) throw new MoodleError('Der Link liefert keinen Kalender')
      return { mode: 'calendar', site: new URL(request.url).origin, secret: request.url }
    }
    const token =
      request.mode === 'login'
        ? await this.login(request.site, request.username, request.password)
        : request.token
    const info = (await this.call(request.site, token, 'core_webservice_get_site_info')) as {
      userid?: unknown
      fullname?: unknown
    }
    if (typeof info.userid !== 'number') throw new MoodleError('Unerwartete Antwort von Moodle')
    return {
      mode: 'webservice',
      site: request.site,
      secret: token,
      userId: info.userid,
      ...(typeof info.fullname === 'string' ? { user: info.fullname } : {}),
    }
  }

  async fetch(config: MoodleConfig, now = new Date()): Promise<MoodleSnapshot> {
    if (config.mode === 'calendar')
      return snapshotFromIcs(await this.request(config.secret), config.site, now)
    const { site, secret } = config
    const siteInfo = await this.call(site, secret, 'core_webservice_get_site_info')
    const userId = (siteInfo as { userid?: number }).userid ?? config.userId ?? 0
    const from = Math.floor(now.getTime() / 1000) - 86_400
    const [courses, events, grades] = await Promise.all([
      this.call(site, secret, 'core_enrol_get_users_courses', { userid: userId }),
      this.call(site, secret, 'core_calendar_get_action_events_by_timesort', {
        timesortfrom: from,
        timesortto: from + 200 * 86_400,
        limitnum: 50,
      }),
      // Not every Moodle allows the grade overview – it's optional.
      this.call(site, secret, 'gradereport_overview_get_course_grades').catch(() => null),
    ])
    return snapshotFromWebService(site, { siteInfo, courses, events, grades }, now)
  }
}

export function statusOf(config: MoodleConfig | null): MoodleStatus {
  return config
    ? { connected: true, mode: config.mode, site: config.site, ...(config.user ? { user: config.user } : {}) }
    : { connected: false }
}

export function parseStoredConfig(text: string): MoodleConfig | null {
  try {
    const c = JSON.parse(text) as Partial<MoodleConfig>
    if (
      (c.mode !== 'webservice' && c.mode !== 'calendar') ||
      typeof c.site !== 'string' ||
      typeof c.secret !== 'string'
    )
      return null
    return {
      mode: c.mode,
      site: c.site,
      secret: c.secret,
      ...(typeof c.user === 'string' ? { user: c.user } : {}),
      ...(typeof c.userId === 'number' ? { userId: c.userId } : {}),
    }
  } catch {
    return null
  }
}
