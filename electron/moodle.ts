/**
 * Moodle access (main process only – the renderer has no network). Two ways in:
 * - web service like the Moodle app: login once with user name + password (only the token is
 *   kept, never the password) or a token from Moodle's security keys page,
 * - the calendar link (Kalender → Exportieren), which needs no password but only has dates.
 * The secret (token or calendar link) is stored encrypted with the OS keychain (safeStorage).
 */
import { safeFileName } from '../src/lib/moodle'
import {
  snapshotFromIcs,
  snapshotFromWebService,
  type MoodleMaterial,
  type MoodleSnapshot,
} from '../src/lib/moodle'

export type MoodleConnect =
  | { mode: 'browser'; site: string }
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
const MAX_FILE = 250_000_000

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/zip': 'zip',
  'text/plain': 'txt',
  'image/png': 'png',
  'image/jpeg': 'jpg',
}

/** A file name that is safe on every OS (no folders, no reserved characters). */
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
  if (r.mode === 'browser') return { mode: 'browser', site: siteRoot(r.site) }
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
  async connect(request: Exclude<MoodleConnect, { mode: 'browser' }>): Promise<MoodleConfig> {
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

  async fetch(
    config: MoodleConfig,
    now = new Date(),
    onProgress: (done: number, total: number, text: string) => void = () => {},
    /** Course contents (files, texts) only when due; otherwise they come from `previous`. */
    options: { contents?: boolean; previous?: MoodleSnapshot | null } = {},
  ): Promise<MoodleSnapshot> {
    if (config.mode === 'calendar')
      return snapshotFromIcs(await this.request(config.secret), config.site, now)
    const { site, secret } = config
    onProgress(0, 1, 'Anmeldung prüfen')
    const siteInfo = await this.call(site, secret, 'core_webservice_get_site_info')
    onProgress(0, 1, 'Kurse und Termine')
    const userId = (siteInfo as { userid?: number }).userid ?? config.userId ?? 0
    const from = Math.floor(now.getTime() / 1000) - 86_400
    const [courses, events, grades, notices] = await Promise.all([
      this.call(site, secret, 'core_enrol_get_users_courses', { userid: userId }),
      this.call(site, secret, 'core_calendar_get_action_events_by_timesort', {
        timesortfrom: from,
        timesortto: from + 200 * 86_400,
        limitnum: 50,
      }),
      // Not every Moodle allows the grade overview – it's optional.
      this.call(site, secret, 'gradereport_overview_get_course_grades').catch(() => null),
      this.call(site, secret, 'message_popup_get_popup_notifications', { useridto: userId, limit: 30 }).catch(
        () => null,
      ),
    ])
    // Materials per course (scripts, slides, links); a course that fails is just skipped.
    const contents: Record<string, unknown> = {}
    const ids =
      options.contents === false
        ? []
        : Array.isArray(courses)
          ? courses
              .map((c: unknown) => String((c as { id?: unknown }).id ?? ''))
              .filter(Boolean)
              .slice(0, 40)
          : []
    const names = new Map(
      (Array.isArray(courses) ? courses : []).map((c: { id?: unknown; fullname?: unknown }) => [
        String(c.id ?? ''),
        String(c.fullname ?? ''),
      ]),
    )
    let done = 0
    let lastError = ''
    await Promise.all(
      ids.map(async (id) => {
        try {
          contents[id] = await this.call(site, secret, 'core_course_get_contents', { courseid: id })
        } catch (error) {
          contents[id] = null
          lastError = (error as Error).message
        }
        onProgress(++done, ids.length, `Unterlagen: ${names.get(id) ?? id}`)
      }),
    )
    // Course texts: pages and announcements (optional – not every Moodle allows them).
    onProgress(ids.length, ids.length, 'Kursinfos und Ankündigungen')
    const pageCourses = ids.filter((id) => modulesOf(contents[id]).some((m) => m.modname === 'page'))
    const pages = pageCourses.length
      ? await this.call(
          site,
          secret,
          'mod_page_get_pages_by_courses',
          Object.fromEntries(pageCourses.map((id, i) => [`courseids[${i}]`, id])),
        ).catch(() => null)
      : null
    const discussions: Record<string, unknown> = {}
    await Promise.all(
      ids.map(async (id) => {
        // All forums of the course (announcements first) – cancelled lectures are posted there.
        const forums = modulesOf(contents[id])
          .filter((m) => m.modname === 'forum' && m.instance)
          .sort(
            (a, b) =>
              Number(/ankündig|nachricht|news|announce/i.test(String(b.name ?? ''))) -
              Number(/ankündig|nachricht|news|announce/i.test(String(a.name ?? ''))),
          )
          .slice(0, 5)
        const lists = await Promise.all(
          forums.map(async (forum) => {
            const forumid = Number(forum.instance)
            const data = await this.call(site, secret, 'mod_forum_get_forum_discussions', {
              forumid,
              page: 0,
              perpage: 10,
            }).catch(() =>
              this.call(site, secret, 'mod_forum_get_forum_discussions_paginated', {
                forumid,
                page: 0,
                perpage: 10,
              }).catch(() => null),
            )
            return { forum: String(forum.name ?? 'Forum'), data }
          }),
        )
        if (lists.length) discussions[id] = lists
      }),
    )
    // Each assignment's own state: open, submitted, graded (optional – a Moodle may not allow it).
    const submissions: Record<string, unknown> = {}
    const assignments = (
      (events as { events?: Array<{ id?: unknown; modulename?: unknown; instance?: unknown }> } | null)
        ?.events ?? []
    )
      .filter((e) => e.modulename === 'assign' && e.instance)
      .slice(0, 30)
    await Promise.all(
      assignments.map(async (e) => {
        submissions[String(e.id)] = await this.call(site, secret, 'mod_assign_get_submission_status', {
          assignid: Number(e.instance),
        }).catch(() => null)
      }),
    )
    const snapshot = snapshotFromWebService(
      site,
      { siteInfo, courses, events, grades, contents, notices, pages, discussions, submissions },
      now,
    )
    if (options.contents === false && options.previous) {
      if (options.previous.materials) snapshot.materials = options.previous.materials
      if (options.previous.info) snapshot.info = options.previous.info
    }
    // No course delivered its contents: say why instead of showing empty lists.
    if (ids.length && Object.values(contents).every((c) => c === null))
      snapshot.materialsError = `Moodle gibt die Kursinhalte nicht heraus: ${lastError}`
    return snapshot
  }
}

/** The modules (activities) of a core_course_get_contents answer. */
function modulesOf(contents: unknown): Array<{ modname?: unknown; name?: unknown; instance?: unknown }> {
  if (!Array.isArray(contents)) return []
  return contents.flatMap((section: { modules?: unknown }) =>
    Array.isArray(section?.modules) ? (section.modules as Array<{ modname?: unknown }>) : [],
  )
}

/**
 * Downloads a material. Moodle files get the token (only ever sent to the Moodle server itself);
 * plain links are fetched as they are and must point to a file, not a web page.
 */
export async function downloadMaterial(
  fetchFn: Fetch,
  config: MoodleConfig,
  material: MoodleMaterial,
): Promise<{ bytes: Uint8Array; filename: string }> {
  if (material.kind === 'page')
    throw new MoodleError('Moodle-Seiten lassen sich nur öffnen, nicht herunterladen')
  const url = checkUrl(material.url)
  const site = new URL(config.site)
  const own = url.origin === site.origin
  if (own) {
    if (config.mode !== 'webservice')
      throw new MoodleError('Für Dateien aus Moodle bitte mit dem Uni-Login verbinden')
    url.pathname = url.pathname
      .replace(/\/pluginfile\.php/, '/webservice/pluginfile.php')
      .replace('/webservice/webservice/', '/webservice/')
    url.searchParams.set('token', config.secret)
  }
  let response: Response
  try {
    response = await fetchFn(url.toString(), { signal: AbortSignal.timeout(120_000), redirect: 'follow' })
  } catch (error) {
    throw new MoodleError(`Download fehlgeschlagen: ${(error as Error).message}`)
  }
  if (own && response.url && new URL(response.url).origin !== site.origin)
    throw new MoodleError('Moodle hat auf einen anderen Server umgeleitet')
  if (!response.ok) throw new MoodleError(`Download fehlgeschlagen (Fehler ${response.status})`)
  const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  if (type === 'text/html')
    throw new MoodleError(
      own
        ? 'Moodle hat statt der Datei eine Webseite geliefert – bitte neu verbinden.'
        : 'Der Link führt zu einer Webseite, nicht zu einer Datei – öffne ihn im Browser.',
    )
  if (Number(response.headers.get('content-length') ?? 0) > MAX_FILE)
    throw new MoodleError('Datei ist zu groß (max. 250 MB)')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.length > MAX_FILE) throw new MoodleError('Datei ist zu groß (max. 250 MB)')
  let filename = material.filename ?? decodeURIComponent(url.pathname.split('/').pop() ?? '')
  if (!/\.[a-z0-9]{2,5}$/i.test(filename)) filename = `${material.title}.${EXTENSIONS[type] ?? 'bin'}`
  return { bytes, filename: safeFileName(filename) }
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

export { safeFileName }
