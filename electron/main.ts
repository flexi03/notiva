/**
 * Electron main process. Security model:
 * - renderer: contextIsolation, sandbox, no Node, served from the custom app:// protocol
 * - only the preload's small API (vault ops) is reachable; every IPC input is validated
 * - file access is limited to the folder the user picked (FsVault)
 * - no navigation away from the app, new windows only as http(s) links in the system browser
 * - all permission requests (camera, notifications, …) are denied
 * - the renderer has no network access (CSP); AI requests go through `ai:request` (validated, http(s) only)
 */
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  Notification,
  powerMonitor,
  protocol,
  safeStorage,
  session,
  systemPreferences,
  shell,
  type IpcMainInvokeEvent,
} from 'electron'
import { watch, type FSWatcher, promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { FsVault } from './vaultFs'
import { parseAiRequest } from './aiRequest'
import { GitRepo, type GitState } from './git'
import { loadShellPath } from './shellPath'
import { cliArgs, detectClis, parseCliRequest, startCli, type CliInfo, type McpLaunch } from './aiCli'
import type { ChildProcess } from 'node:child_process'
import {
  checkUrl,
  MoodleClient,
  parseConnect,
  parseStoredConfig,
  downloadMaterial,
  safeFileName,
  statusOf,
  type MoodleConfig,
} from './moodle'
import { clearMoodleSession, openMoodlePage, ssoLogin } from './moodleWindow'
import { WhisperEngine } from './whisper'
import { Ecampus, NeedsLogin } from './ecampus'
import { examNews, type ExamSnapshot } from '../src/lib/ecampus'
import { NotificationStore, parseNotifySettings, type NotifySettings } from './notifier'
import { deadlineReminders, moodleNews, type AppNotification } from '../src/lib/notifications'
import type { MoodleSnapshot } from '../src/lib/moodle'

const DIST = path.join(__dirname, '..', 'dist')
const userFile = (name: string) => path.join(process.env.NOTIVA_E2E_USERDATA ?? app.getPath('userData'), name)
const CONFIG = () => userFile('config.json')
/** Moodle access (encrypted) and the last fetched data (no secrets, read by the MCP server). */
const MOODLE = () => userFile('moodle.bin')
const MOODLE_SNAPSHOT = () => userFile('moodle-snapshot.json')
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'"

// E2E tests (unpackaged only): a fresh profile per run, so browser storage never leaks between runs.
if (!app.isPackaged && process.env.NOTIVA_E2E_USERDATA)
  app.setPath('userData', process.env.NOTIVA_E2E_USERDATA)
// One app per profile: a second start would fight over the logins (cookies, Moodle, eCampus).
// The development build (npm run electron) next to the installed app gets its own profile.
let secondInstance = false
if (!process.env.NOTIVA_E2E_USERDATA && !app.requestSingleInstanceLock()) {
  secondInstance = app.isPackaged
  if (secondInstance) app.quit()
  else {
    app.setPath('userData', `${app.getPath('userData')}-dev`)
    console.warn(
      'Notiva läuft schon – die Entwicklungsversion nutzt ein eigenes Profil:',
      app.getPath('userData'),
    )
  }
}
app.on('second-instance', () => {
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.focus()
})
// E2E tests: a WAV file instead of the real microphone (never records the room, no OS prompt).
if (!app.isPackaged && process.env.NOTIVA_E2E_FAKE_AUDIO) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  app.commandLine.appendSwitch('use-file-for-fake-audio-capture', process.env.NOTIVA_E2E_FAKE_AUDIO)
  // The sandboxed audio service could not read the file.
  app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess,AudioServiceSandbox')
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

let vault: FsVault | null = null
let watcher: FSWatcher | null = null
let window: BrowserWindow | null = null

interface AppConfig {
  lastFolder?: string
  notify?: NotifySettings
}

async function readConfig(): Promise<AppConfig> {
  try {
    return JSON.parse(await fs.readFile(CONFIG(), 'utf8')) as AppConfig
  } catch {
    return {}
  }
}

async function writeConfig(config: AppConfig): Promise<void> {
  await fs.mkdir(path.dirname(CONFIG()), { recursive: true })
  await fs.writeFile(CONFIG(), JSON.stringify(config))
}

/** Only messages from our own window and app:// origin are accepted. */
function trusted(event: IpcMainInvokeEvent): boolean {
  return event.sender === window?.webContents && (event.senderFrame?.url ?? '').startsWith('app://')
}

function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => Promise<R>): void {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!trusted(event)) throw new Error('Untrusted sender')
    return fn(...(args as A))
  })
}

function requireVault(): FsVault {
  if (!vault) throw new Error('No vault open')
  return vault
}

let clis: Promise<CliInfo[]> | null = null
let cliRunCounter = 0
const cliRuns = new Map<number, ChildProcess>()

const moodleClient = new MoodleClient((url, init) => net.fetch(url, init))
let moodle: MoodleConfig | null | undefined
let moodleRemembered = true

/** E2E tests (unpackaged) store the Moodle access unencrypted – no keychain prompts on CI. */
const plainSecrets = () => !app.isPackaged && !!process.env.NOTIVA_E2E_USERDATA

async function loadMoodle(): Promise<MoodleConfig | null> {
  if (moodle !== undefined) return moodle
  try {
    const raw = await fs.readFile(MOODLE())
    moodle = parseStoredConfig(plainSecrets() ? raw.toString('utf8') : safeStorage.decryptString(raw))
  } catch {
    moodle = null
  }
  return moodle
}

/** Saves the access encrypted; without a keychain (some Linux setups) it lasts only this session. */
async function saveMoodle(config: MoodleConfig | null): Promise<boolean> {
  moodle = config
  if (!config) {
    await fs.rm(MOODLE(), { force: true })
    await fs.rm(MOODLE_SNAPSHOT(), { force: true })
    return true
  }
  const json = JSON.stringify(config)
  if (plainSecrets()) await fs.writeFile(MOODLE(), json, { mode: 0o600 })
  else if (safeStorage.isEncryptionAvailable())
    await fs.writeFile(MOODLE(), safeStorage.encryptString(json), { mode: 0o600 })
  else return (moodleRemembered = false)
  return (moodleRemembered = true)
}

/* ---------- notification center + Moodle polling ---------- */

const notifications = new NotificationStore(
  userFile('notifications.json'),
  (added) => void showBanners(added),
  () => window?.webContents.send('notifications:changed'),
)

async function showBanners(added: AppNotification[]): Promise<void> {
  const settings = parseNotifySettings((await readConfig()).notify)
  if (!settings.system || !Notification.isSupported() || process.env.NOTIVA_E2E_USERDATA) return
  const banner =
    added.length > 3
      ? new Notification({ title: 'Notiva', body: `${added.length} Neuigkeiten – z. B. ${added[0]!.title}` })
      : null
  for (const n of banner ? [] : added) {
    const one = new Notification({
      title: n.course ? `${n.course}: ${n.title}` : n.title,
      ...(n.body ? { body: n.body } : {}),
    })
    one.on('click', () => focusNotification(n.id))
    one.show()
  }
  banner?.on('click', () => focusNotification(null))
  banner?.show()
}

function focusNotification(id: string | null): void {
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
  window.webContents.send('notifications:open', id)
}

const LOCALE = () => (app.getLocale().startsWith('de') ? 'de-DE' : 'en-US')

/** Fetches Moodle, stores the snapshot and turns the differences into notifications. */
async function pollMoodle(): Promise<MoodleSnapshot> {
  const config = await loadMoodle()
  if (!config) throw new Error('Moodle ist nicht verbunden')
  const snapshot = await moodleClient.fetch(config, new Date(), (done, total, text) =>
    window?.webContents.send('moodle:progress', { done, total, text }),
  )
  const previous = await fs
    .readFile(MOODLE_SNAPSHOT(), 'utf8')
    .then((text) => JSON.parse(text) as MoodleSnapshot)
    .catch(() => null)
  await fs.writeFile(MOODLE_SNAPSHOT(), JSON.stringify(snapshot), { mode: 0o600 })
  // The app saves new materials into the vault (its folder logic lives in the renderer).
  window?.webContents.send('moodle:polled')
  const now = new Date()
  await notifications.add([
    ...moodleNews(previous, snapshot, { now, locale: LOCALE() }),
    ...deadlineReminders(
      snapshot.events.map((e) => ({
        id: e.id,
        title: e.title,
        due: e.due,
        ...(e.course ? { course: e.course.name } : {}),
        ...(e.url ? { target: { type: 'url' as const, url: e.url } } : {}),
      })),
      { now, locale: LOCALE() },
    ),
  ])
  return snapshot
}

let pollTimer: ReturnType<typeof setTimeout> | null = null

/** eCampus exam results (HISinOne) – own login session, results snapshot in the profile. */
const ecampus = new Ecampus(userFile(''), path.join(__dirname, 'moodlePreload.cjs'))
const ecampusProgress = (text: string) => window?.webContents.send('ecampus:progress', text)
let lastEcampusCheck = 0

/** Fetches the results and turns changes into notifications. */
async function pollEcampus(): Promise<ExamSnapshot> {
  const previous = await ecampus.snapshot()
  try {
    const next = await ecampus.fetch(ecampusProgress)
    lastEcampusCheck = Date.now()
    await notifications.add(examNews(previous, next))
    window?.webContents.send('ecampus:polled')
    return next
  } catch (error) {
    if (error instanceof NeedsLogin)
      await notifications.add([
        {
          id: `ecampus-login:${new Date().toISOString().slice(0, 10)}`,
          kind: 'notice',
          title: 'eCampus: bitte neu anmelden',
          body: 'Die Anmeldung ist abgelaufen – Einstellungen → eCampus → Anmelden.',
          time: new Date().toISOString(),
        },
      ])
    throw error
  }
}

/** Local speech to text (whisper.cpp) – models live in the app profile. */
const whisper = new WhisperEngine(userFile('whisper-models'), (url, init) => net.fetch(url, init))
const whisperProgress = (event: object) => window?.webContents.send('whisper:progress', event)

/** Checks Moodle now and then every few minutes (settings) – quietly, errors only end this round. */
async function schedulePolling(delay?: number): Promise<void> {
  if (pollTimer) clearTimeout(pollTimer)
  const minutes = parseNotifySettings((await readConfig()).notify).intervalMinutes
  pollTimer = setTimeout(
    async () => {
      if (await loadMoodle()) await pollMoodle().catch(() => undefined)
      // Exam results change rarely: at most every 30 minutes.
      if ((await ecampus.config()) && Date.now() - lastEcampusCheck > 30 * 60_000)
        await pollEcampus().catch(() => undefined)
      void schedulePolling()
    },
    delay ?? minutes * 60_000,
  )
}

function mcpLaunch(): McpLaunch {
  const script = app.isPackaged
    ? path.join(process.resourcesPath, 'mcp', 'notiva-mcp.mjs')
    : path.join(__dirname, '..', 'dist-mcp', 'notiva-mcp.mjs')
  return {
    command: process.execPath,
    args: [script, requireVault().root],
    env: {
      ELECTRON_RUN_AS_NODE: '1',
      NOTIVA_MOODLE_SNAPSHOT: MOODLE_SNAPSHOT(),
      NOTIVA_ECAMPUS_SNAPSHOT: ecampus.snapshotFile,
    },
  }
}

const NO_REPO: GitState = {
  isRepo: false,
  branch: null,
  head: null,
  upstream: null,
  ahead: 0,
  behind: 0,
  changes: [],
}

async function requireRepo(): Promise<GitRepo> {
  const repo = await GitRepo.open(requireVault())
  if (!repo) throw new Error('Kein Git-Repository')
  return repo
}

function watchVault(root: string): void {
  watcher?.close()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    watcher = watch(root, { recursive: true }, (_event, file) => {
      if (file && /(^|[\\/])\.(git|notiva[\\/]trash)|\.tmp$/.test(String(file))) return
      clearTimeout(timer)
      timer = setTimeout(() => window?.webContents.send('vault:changed'), 300)
    })
  } catch {
    watcher = null // recursive watch unsupported (older Linux): changes show after reload
  }
}

function registerIpc(): void {
  handle('app:pickFolder', async () => {
    // E2E tests (unpackaged builds only) skip the native dialog.
    if (!app.isPackaged && process.env.NOTIVA_E2E_FOLDER) return process.env.NOTIVA_E2E_FOLDER
    const result = await dialog.showOpenDialog(window!, { properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  handle('app:lastFolder', async () => (await readConfig()).lastFolder ?? null)
  handle('vault:open', async (folder: unknown) => {
    if (typeof folder !== 'string') throw new Error('Invalid folder')
    vault = await FsVault.open(folder)
    await writeConfig({ ...(await readConfig()), lastFolder: vault.root })
    watchVault(vault.root)
    return { name: vault.name }
  })
  handle('vault:list', async () => requireVault().list())
  handle('vault:read', async (p: unknown) => requireVault().read(p as string))
  handle('vault:readBinary', async (p: unknown) => requireVault().readBinary(p as string))
  handle('vault:write', async (p: unknown, content: unknown) =>
    requireVault().write(p as string, content as string | Uint8Array),
  )
  handle('vault:remove', async (p: unknown) => requireVault().remove(p as string))
  handle('vault:rename', async (from: unknown, to: unknown) =>
    requireVault().rename(from as string, to as string),
  )
  handle('ai:request', async (raw: unknown) => {
    const request = parseAiRequest(raw)
    const response = await net.fetch(request.url, {
      method: request.method,
      headers: request.headers,
      ...(request.body !== undefined ? { body: request.body } : {}),
      signal: AbortSignal.timeout(180_000),
    })
    const body = await response.text()
    return { status: response.status, body: body.slice(0, 8_000_000) }
  })
  // How AI apps start the MCP server for the open folder (Electron runs the script as Node).
  handle('app:mcpInfo', async () => mcpLaunch())
  handle('ai:cli:detect', async () => (clis ??= detectClis()))
  handle('ai:cli:start', async (raw: unknown) => {
    const request = parseCliRequest(raw)
    const info = (await (clis ??= detectClis())).find((c) => c.id === request.cli)
    if (!info) throw new Error(`${request.cli} ist nicht installiert`)
    const root = requireVault().root
    const mcp = request.cli === 'claude' ? mcpLaunch() : null
    const runId = ++cliRunCounter
    const send = (payload: object) => window?.webContents.send('ai:cli:event', runId, payload)
    const child = startCli(
      info.path,
      request,
      root,
      mcp,
      (line) => send({ line }),
      (code, stderr) => {
        cliRuns.delete(runId)
        send({ exit: code, stderr })
      },
    )
    cliRuns.set(runId, child)
    return { runId, command: [info.path, ...cliArgs(request, mcp)] }
  })
  handle('ai:cli:cancel', async (runId: unknown) => {
    cliRuns.get(Number(runId))?.kill()
  })
  handle('git:state', async () => {
    const repo = await GitRepo.open(requireVault())
    return repo ? repo.state() : NO_REPO
  })
  handle('git:show', async (rev: unknown, p: unknown) => (await requireRepo()).show(String(rev), p as string))
  handle('git:commit', async (message: unknown, paths: unknown) =>
    (await requireRepo()).commit(message, paths),
  )
  handle('git:discard', async (paths: unknown) => (await requireRepo()).discard(paths))
  handle('git:log', async (limit: unknown, p: unknown) =>
    (await requireRepo()).log(Number(limit) || 50, p === null ? undefined : p),
  )
  handle('git:commitFiles', async (hash: unknown) => (await requireRepo()).commitFiles(hash))
  handle('git:init', async () => (await GitRepo.init(requireVault())).state())
  handle('git:push', async () => (await requireRepo()).push())
  handle('git:pull', async () => (await requireRepo()).pull())
  handle('moodle:status', async () => {
    const config = await loadMoodle()
    return { ...statusOf(config), ...(config ? { remembered: moodleRemembered } : {}) }
  })
  handle('moodle:connect', async (raw: unknown) => {
    const request = parseConnect(raw)
    // University login (Microsoft, 2FA …) in a Moodle window, like the Moodle app.
    const config = await moodleClient.connect(
      request.mode === 'browser'
        ? { mode: 'token', site: request.site, token: (await ssoLogin(window, request.site)).token }
        : request,
    )
    const remembered = await saveMoodle(config)
    // First fetch right away: it is the baseline for "what's new".
    void pollMoodle().catch(() => undefined)
    return { ...statusOf(config), remembered }
  })
  handle('moodle:disconnect', async () => {
    await saveMoodle(null)
    await clearMoodleSession()
    return statusOf(null)
  })
  handle('moodle:fetch', async () => pollMoodle())
  handle('notifications:list', async () => notifications.all())
  handle('notifications:add', async (raw: unknown) => {
    // From the renderer: reminders for the vault's own tasks.
    await notifications.add(Array.isArray(raw) ? (raw as AppNotification[]).slice(0, 50) : [])
  })
  handle('notifications:markRead', async (ids: unknown) =>
    notifications.markRead(
      ids === 'all' ? 'all' : Array.isArray(ids) ? ids.filter((i) => typeof i === 'string') : [],
    ),
  )
  handle('notifications:clear', async () => notifications.clear())
  handle('notifications:settings', async () => parseNotifySettings((await readConfig()).notify))
  handle('notifications:setSettings', async (raw: unknown) => {
    const notify = parseNotifySettings(raw)
    await writeConfig({ ...(await readConfig()), notify })
    void schedulePolling()
    return notify
  })
  // Moodle pages open in a Notiva window with the university login – or in the system browser.
  handle('moodle:open', async (raw: unknown, external: unknown) => {
    const config = await loadMoodle()
    const url = checkUrl(raw)
    if (!config || url.origin !== new URL(config.site).origin)
      throw new Error('Nur Seiten des verbundenen Moodle')
    if (external === true) await shell.openExternal(url.toString())
    else openMoodlePage(window, url.toString())
  })
  // Saves a course material from the last fetch into the vault: <folder>/<course>/<file>.
  handle('moodle:download', async (id: unknown, folder: unknown) => {
    const config = await loadMoodle()
    if (!config) throw new Error('Moodle ist nicht verbunden')
    const snapshot = JSON.parse(await fs.readFile(MOODLE_SNAPSHOT(), 'utf8')) as MoodleSnapshot
    const material = snapshot.materials?.find((m) => m.id === id)
    if (!material) throw new Error('Unterlage nicht gefunden – bitte Moodle aktualisieren')
    if (typeof folder !== 'string' || folder.length > 300) throw new Error('Ungültiger Ordner')
    const course = snapshot.courses.find((c) => c.id === material.courseId)?.name ?? 'Kurs'
    const { bytes, filename } = await downloadMaterial((url, init) => net.fetch(url, init), config, material)
    const target = [folder.replace(/^\/+|\/+$/g, ''), safeFileName(course), filename]
      .filter(Boolean)
      .join('/')
    await requireVault().write(target, bytes)
    return { path: target }
  })
  handle('moodle:snapshot', async () => {
    if (!(await loadMoodle())) return null
    try {
      return JSON.parse(await fs.readFile(MOODLE_SNAPSHOT(), 'utf8')) as unknown
    } catch {
      return null
    }
  })
  // Opens a vault file (e.g. slides as .pptx) with the system's default app.
  handle('vault:openWithSystem', async (p: unknown) => {
    const absolute = await requireVault().resolve(p as string)
    const error = await shell.openPath(absolute)
    if (error) throw new Error(error)
  })
  // Speech to text for the lecture mode: the renderer has no network, the main process sends it.
  handle('transcribe', async (raw: unknown) => {
    const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
    const url = new URL(String(r.url))
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password)
      throw new Error('Nur http(s)-Adressen')
    if (!(r.audio instanceof Uint8Array) || r.audio.length > 25_000_000)
      throw new Error('Ungültige Audiodaten')
    const form = new FormData()
    for (const [key, value] of Object.entries((r.fields ?? {}) as Record<string, unknown>))
      if (/^[a-z_]{1,40}$/.test(key) && typeof value === 'string' && value.length <= 2000)
        form.append(key, value)
    form.append('file', new Blob([r.audio.slice()], { type: 'audio/wav' }), 'chunk.wav')
    const headers: Record<string, string> = {}
    const auth = (r.headers as Record<string, unknown> | undefined)?.authorization
    if (typeof auth === 'string' && auth.length < 1000 && !/[\r\n]/.test(auth)) headers.authorization = auth
    try {
      const response = await net.fetch(url.toString(), {
        method: 'POST',
        body: form,
        headers,
        signal: AbortSignal.timeout(120_000),
      })
      return { status: response.status, body: (await response.text()).slice(0, 2_000_000) }
    } catch (error) {
      return { status: 0, body: (error as Error).message }
    }
  })
  handle('ecampus:status', async () => {
    const config = await ecampus.config()
    const snapshot = await ecampus.snapshot()
    return {
      connected: !!config,
      ...(config ?? {}),
      ...(snapshot ? { fetchedAt: snapshot.fetchedAt, count: snapshot.records.length } : {}),
    }
  })
  handle('ecampus:connect', async (raw: unknown) => {
    const previous = await ecampus.snapshot()
    const snapshot = await ecampus.login(window, raw, ecampusProgress)
    lastEcampusCheck = Date.now()
    await notifications.add(examNews(previous, snapshot))
    return snapshot
  })
  handle('ecampus:fetch', async () => pollEcampus())
  handle('ecampus:snapshot', async () => ecampus.snapshot())
  handle('ecampus:disconnect', async () => ecampus.disconnect())
  handle('whisper:status', async () => whisper.status())
  handle('whisper:install', async () => whisper.install(whisperProgress))
  handle('whisper:download', async (id: unknown) => whisper.download(String(id), whisperProgress))
  handle('whisper:remove', async (id: unknown) => whisper.removeModel(String(id)))
  handle('whisper:transcribe', async (raw: unknown) => {
    const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
    if (!(r.audio instanceof Uint8Array) || r.audio.length > 25_000_000)
      throw new Error('Ungültige Audiodaten')
    const fields: Record<string, string> = {}
    for (const [key, value] of Object.entries((r.fields ?? {}) as Record<string, unknown>))
      if (/^[a-z_]{1,40}$/.test(key) && typeof value === 'string' && value.length <= 2000) fields[key] = value
    try {
      return await whisper.transcribe(
        String(r.model),
        /^[a-z]{0,2}$/.test(String(r.language)) ? String(r.language) : 'de',
        fields,
        r.audio,
      )
    } catch (error) {
      return { status: 0, body: (error as Error).message }
    }
  })
  // macOS asks the user once for microphone access (lecture mode).
  handle('app:microphone', async () => {
    if (process.platform !== 'darwin' || (!app.isPackaged && process.env.NOTIVA_E2E_USERDATA)) return true
    if (systemPreferences.getMediaAccessStatus('microphone') === 'granted') return true
    return systemPreferences.askForMediaAccess('microphone')
  })
  handle('app:openExternal', async (url: unknown) => {
    if (typeof url === 'string' && /^(https?:|mailto:)/i.test(url)) await shell.openExternal(url)
  })
}

/** Serves dist/ under app://notiva/ – with path checks and a strict CSP header. */
function registerProtocol(): void {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url)
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
    const file = path.resolve(DIST, relative)
    if (!file.startsWith(DIST + path.sep)) return new Response('Forbidden', { status: 403 })
    const response = await net.fetch(pathToFileURL(file).toString()).catch(() => null)
    if (!response?.ok) return new Response('Not found', { status: 404 })
    const headers = new Headers(response.headers)
    headers.set('Content-Security-Policy', CSP)
    headers.set('X-Content-Type-Options', 'nosniff')
    return new Response(response.body, { status: 200, headers })
  })
}

function createWindow(): void {
  window = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 360,
    minHeight: 480,
    title: 'Notiva',
    backgroundColor: '#f5f6f8',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
      devTools: !app.isPackaged,
    },
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|mailto:)/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('app://notiva/')) event.preventDefault()
  })
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  // Autosave off and unsaved changes: the page asks to stay – let the user decide.
  window.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(window!, {
      type: 'warning',
      buttons: ['Abbrechen', 'Ohne Speichern schließen'],
      defaultId: 0,
      cancelId: 0,
      message: 'Es gibt ungespeicherte Änderungen.',
      detail: 'Mit ⌘S bzw. Strg+S speichern, dann schließen.',
    })
    if (choice === 1) event.preventDefault()
  })
  window.on('closed', () => {
    window = null
  })
  void window.loadURL(process.env.NOTIVA_DEV_URL ?? 'app://notiva/index.html')
}

app.whenReady().then(async () => {
  if (secondInstance) return
  await loadShellPath()
  // Only Notiva's own window may use the microphone (lecture mode) – audio only, nothing else.
  const ownAudio = (
    wc: Electron.WebContents | null,
    permission: string,
    details: { mediaTypes?: string[] } = {},
  ) =>
    wc === window?.webContents &&
    permission === 'media' &&
    (details.mediaTypes ?? ['audio']).every((t) => t === 'audio')
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) =>
    callback(ownAudio(wc, permission, details as { mediaTypes?: string[] })),
  )
  session.defaultSession.setPermissionCheckHandler((wc, permission, _origin, details) =>
    ownAudio(wc, permission, { mediaTypes: details.mediaType ? [details.mediaType] : ['audio'] }),
  )
  registerProtocol()
  registerIpc()
  createWindow()
  // Check Moodle shortly after start, then regularly – and after waking from sleep.
  void schedulePolling(20_000)
  powerMonitor.on('resume', () => void schedulePolling(10_000))
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => whisper.stop())
app.on('window-all-closed', () => {
  whisper.stop()
  for (const child of cliRuns.values()) child.kill()
  watcher?.close()
  if (process.platform !== 'darwin') app.quit()
})

// Hardening: no other process may create webContents with relaxed settings.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault())
})
