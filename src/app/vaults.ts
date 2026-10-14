/** Opening vaults on each platform and remembering the last one. */
import {
  DirectoryVault,
  electronBridge,
  ElectronVault,
  MemoryVault,
  openOpfsVault,
  supportsFolderPicker,
  supportsOpfs,
  type VaultAdapter,
  type VaultKind,
} from '@/lib/vault'
import { Workspace } from '@/lib/workspace'
import { installPack, studyPack } from '@/lib/packs'
import { WELCOME_PAGE } from '@/lib/packs/welcome'

const LAST_KEY = 'notiva.lastVault'
const DB_NAME = 'notiva'

export interface VaultOptions {
  folder: boolean
  browser: boolean
  electron: boolean
}

export function availableVaults(): VaultOptions {
  return {
    folder: supportsFolderPicker() || electronBridge() !== null,
    browser: supportsOpfs(),
    electron: electronBridge() !== null,
  }
}

function remember(kind: VaultKind | null): void {
  try {
    if (kind) localStorage.setItem(LAST_KEY, kind)
    else localStorage.removeItem(LAST_KEY)
  } catch {
    /* storage unavailable (private mode) – nothing to remember */
  }
}

export function lastVaultKind(): VaultKind | null {
  try {
    const value = localStorage.getItem(LAST_KEY)
    return value === 'opfs' || value === 'directory' || value === 'electron' ? value : null
  } catch {
    return null
  }
}

/* --- folder handles persist in IndexedDB (they are structured-cloneable) --- */

function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1)
    open.onupgradeneeded = () => open.result.createObjectStore('handles')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const tx = open.result.transaction('handles', mode)
      const request = run(tx.objectStore('handles'))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    }
  })
}

type PermissionHandle = FileSystemDirectoryHandle & {
  queryPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>
}

export async function storedFolderName(): Promise<string | null> {
  const bridge = electronBridge()
  if (bridge) return (await bridge.lastFolder())?.split(/[\\/]/).pop() ?? null
  try {
    const handle = await idb<FileSystemDirectoryHandle | undefined>('readonly', (s) => s.get('folder'))
    return handle?.name ?? null
  } catch {
    return null
  }
}

async function finish(adapter: VaultAdapter, kind: VaultKind): Promise<Workspace> {
  const ws = await Workspace.open(adapter)
  if (ws.all().length === 0) await ws.createPage({ title: 'Willkommen', body: WELCOME_PAGE })
  remember(kind)
  return ws
}

export async function openFolder(): Promise<Workspace | null> {
  const bridge = electronBridge()
  if (bridge) {
    const folder = await bridge.pickFolder()
    if (!folder) return null
    const { name } = await bridge.vault.open(folder)
    return finish(new ElectronVault(bridge, name), 'electron')
  }
  const picker = (
    window as unknown as { showDirectoryPicker(o: { mode: 'readwrite' }): Promise<FileSystemDirectoryHandle> }
  ).showDirectoryPicker
  let handle: FileSystemDirectoryHandle
  try {
    handle = await picker.call(window, { mode: 'readwrite' })
  } catch (error) {
    if ((error as DOMException).name === 'AbortError') return null
    throw error
  }
  await idb('readwrite', (s) => s.put(handle, 'folder')).catch(() => undefined)
  return finish(new DirectoryVault(handle, 'directory'), 'directory')
}

/** Reopens the last folder. In browsers this needs a user gesture for the permission prompt. */
export async function reopenFolder(): Promise<Workspace | null> {
  const bridge = electronBridge()
  if (bridge) {
    const folder = await bridge.lastFolder()
    if (!folder) return null
    const { name } = await bridge.vault.open(folder)
    return finish(new ElectronVault(bridge, name), 'electron')
  }
  const handle = (await idb<PermissionHandle | undefined>('readonly', (s) => s.get('folder'))) ?? null
  if (!handle) return null
  const state = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted'
  if (state !== 'granted' && (await handle.requestPermission?.({ mode: 'readwrite' })) !== 'granted')
    return null
  return finish(new DirectoryVault(handle, 'directory'), 'directory')
}

export async function openBrowserVault(): Promise<Workspace> {
  return finish(await openOpfsVault(), 'opfs')
}

/** In-memory vault with the study pack installed – for trying Notiva out. */
export async function openDemo(): Promise<Workspace> {
  const ws = await Workspace.open(new MemoryVault('Demo'))
  await ws.createPage({ title: 'Willkommen', body: WELCOME_PAGE })
  await installPack(ws, studyPack, { studiengang: 'Informatik (B.Sc.)' })
  return ws
}

/** Opens the last vault without user interaction where possible (OPFS, Electron). */
export async function autoOpen(): Promise<Workspace | null> {
  const kind = lastVaultKind()
  if (kind === 'opfs' && supportsOpfs()) return openBrowserVault()
  if (kind === 'electron' && electronBridge()) return reopenFolder()
  return null
}

export function forgetVault(): void {
  remember(null)
}
