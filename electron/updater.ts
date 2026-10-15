/**
 * Self-update from GitHub releases. electron-updater needs an Apple-signed app on macOS – Notiva
 * is not signed, so it does it itself: look up the latest release, tell the user, download the
 * file for this system and swap the app after it quit (macOS: replace the .app, Windows: run the
 * installer, Linux: replace the AppImage), then start again. Only in the packaged app.
 */
import { spawn } from 'node:child_process'
import { createWriteStream, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app, net } from 'electron'
import {
  compareVersions,
  pickAsset,
  RELEASES_REPO,
  type ReleaseAsset,
  type UpdateStatus,
} from '../src/lib/update'

let status: UpdateStatus = { state: 'idle', version: app.getVersion() }
let asset: ReleaseAsset | null = null
let downloaded: string | null = null
let listener: (s: UpdateStatus) => void = () => undefined

const set = (next: UpdateStatus) => {
  status = next
  listener(status)
}

export function onUpdateStatus(fn: (s: UpdateStatus) => void): void {
  listener = fn
}

export function updateStatus(): UpdateStatus {
  return status
}

/** Looks for a newer release. Returns the status (and notifies once per new version). */
export async function checkForUpdate(): Promise<UpdateStatus> {
  if (status.state === 'downloading' || status.state === 'ready') return status
  const version = app.getVersion()
  set({ state: 'checking', version })
  try {
    const res = await net.fetch(`https://api.github.com/repos/${RELEASES_REPO}/releases/latest`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': `Notiva/${version}` },
    })
    if (res.status === 404) {
      set({ state: 'current', version, checkedAt: new Date().toISOString() })
      return status
    }
    if (!res.ok) throw new Error(`GitHub: ${res.status}`)
    const release = (await res.json()) as {
      tag_name: string
      body?: string
      html_url: string
      assets: Array<{ name: string; browser_download_url: string; size: number }>
    }
    const latest = release.tag_name.replace(/^v/i, '')
    const file = pickAsset(
      release.assets.map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size })),
      process.platform,
      process.arch,
    )
    const checkedAt = new Date().toISOString()
    if (compareVersions(latest, version) <= 0 || !file) {
      set({ state: 'current', version, checkedAt })
      return status
    }
    asset = file
    set({ state: 'available', version, latest, notes: release.body ?? '', url: release.html_url, checkedAt })
  } catch (e) {
    set({ state: 'error', version, message: e instanceof Error ? e.message : String(e) })
  }
  return status
}

async function download(): Promise<string> {
  if (status.state !== 'available' || !asset) throw new Error('Kein Update verfügbar')
  const { version, latest } = status
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'notiva-update-'))
  const file = path.join(dir, asset.name)
  const res = await net.fetch(asset.url)
  if (!res.ok || !res.body) throw new Error(`Download: ${res.status}`)
  const total = Number(res.headers.get('content-length')) || asset.size
  let done = 0
  const out = createWriteStream(file)
  const reader = res.body.getReader()
  let last = 0
  for (;;) {
    const { done: end, value } = await reader.read()
    if (end) break
    done += value.byteLength
    if (!out.write(value)) await new Promise((r) => out.once('drain', r))
    if (Date.now() - last > 200) {
      last = Date.now()
      set({ state: 'downloading', version, latest, done, total })
    }
  }
  await new Promise<void>((resolve, reject) => out.end((e?: Error | null) => (e ? reject(e) : resolve())))
  if (asset.size && done !== asset.size) throw new Error('Download unvollständig')
  return file
}

/** The running .app bundle (macOS). */
const appBundle = () => {
  const i = process.execPath.indexOf('.app/')
  return i > 0 ? process.execPath.slice(0, i + 4) : null
}

/** Downloads the update and swaps the app after it quit; starts the new version. */
export async function installUpdate(): Promise<void> {
  if (!app.isPackaged) throw new Error('Nur in der installierten App')
  const current = status
  if (current.state !== 'available') throw new Error('Kein Update verfügbar')
  try {
    downloaded = await download()
    set({ state: 'ready', version: current.version, latest: current.latest })
    const pid = String(process.pid)
    if (process.platform === 'darwin') {
      const target = appBundle()
      if (!target) throw new Error('App-Pfad nicht gefunden')
      const unpack = path.join(path.dirname(downloaded), 'new')
      // Wait for Notiva to quit, unpack, swap, remove the download quarantine, start again.
      const script = [
        'while kill -0 "$1" 2>/dev/null; do sleep 0.3; done',
        'mkdir -p "$4" && /usr/bin/ditto -x -k "$2" "$4"',
        'NEW=$(/usr/bin/find "$4" -maxdepth 1 -name "*.app" | head -n 1)',
        '[ -n "$NEW" ] || exit 1',
        'rm -rf "$3.old" && mv "$3" "$3.old" && mv "$NEW" "$3" && rm -rf "$3.old"',
        '/usr/bin/xattr -dr com.apple.quarantine "$3" 2>/dev/null',
        'open "$3"',
      ].join('\n')
      spawn('/bin/sh', ['-c', script, 'notiva-update', pid, downloaded, target, unpack], {
        detached: true,
        stdio: 'ignore',
      }).unref()
    } else if (process.platform === 'win32') {
      // NSIS: silent install over the old version, then start it.
      spawn(downloaded, ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref()
    } else {
      const target = process.env.APPIMAGE
      if (!target) throw new Error('Nur als AppImage aktualisierbar')
      const script = [
        'while kill -0 "$1" 2>/dev/null; do sleep 0.3; done',
        'mv -f "$2" "$3" && chmod +x "$3" && "$3" >/dev/null 2>&1 &',
      ].join('\n')
      spawn('/bin/sh', ['-c', script, 'notiva-update', pid, downloaded, target], {
        detached: true,
        stdio: 'ignore',
      }).unref()
    }
    setTimeout(() => app.quit(), 300)
  } catch (e) {
    set({ state: 'error', version: current.version, message: e instanceof Error ? e.message : String(e) })
    throw e
  }
}
