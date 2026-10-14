/**
 * Electron main process. Security model:
 * - renderer: contextIsolation, sandbox, no Node, served from the custom app:// protocol
 * - only the preload's small API (vault ops) is reachable; every IPC input is validated
 * - file access is limited to the folder the user picked (FsVault)
 * - no navigation away from the app, new windows only as http(s) links in the system browser
 * - all permission requests (camera, notifications, …) are denied
 */
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  session,
  shell,
  type IpcMainInvokeEvent,
} from 'electron'
import { watch, type FSWatcher, promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { FsVault } from './vaultFs'

const DIST = path.join(__dirname, '..', 'dist')
const CONFIG = () => path.join(process.env.NOTIVA_E2E_USERDATA ?? app.getPath('userData'), 'config.json')
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'"

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

let vault: FsVault | null = null
let watcher: FSWatcher | null = null
let window: BrowserWindow | null = null

async function readConfig(): Promise<{ lastFolder?: string }> {
  try {
    return JSON.parse(await fs.readFile(CONFIG(), 'utf8')) as { lastFolder?: string }
  } catch {
    return {}
  }
}

async function writeConfig(config: { lastFolder?: string }): Promise<void> {
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
  window.on('closed', () => {
    window = null
  })
  void window.loadURL(process.env.NOTIVA_DEV_URL ?? 'app://notiva/index.html')
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  registerProtocol()
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  watcher?.close()
  if (process.platform !== 'darwin') app.quit()
})

// Hardening: no other process may create webContents with relaxed settings.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault())
})
