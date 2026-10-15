/**
 * System notifications (macOS: Mitteilungszentrale). Electron's notifications need a properly
 * signed app on macOS; Notiva without an Apple certificate is refused ("UNErrorDomain 1") and
 * macOS never asks. Then Notiva uses AppleScript's `display notification` instead – it reaches the
 * notification centre too (shown for "Skripteditor"). Texts go as arguments, never as code.
 */
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app, Notification } from 'electron'

/**
 * macOS refuses notifications of Notiva without an Apple certificate. Instead of AppleScript's
 * "Skripteditor" Notiva builds a tiny helper app named "Notiva" (an AppleScript applet with the
 * Notiva icon) that shows the messages – they appear as "Notiva" and macOS asks once.
 */
const HELPER_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'Notiva-Mitteilungen')
const HELPER = path.join(HELPER_DIR, 'Notiva.app')
const SEP = String.fromCharCode(31)
const APPLET = `on run
  set dir to POSIX path of (path to home folder) & "Library/Application Support/Notiva-Mitteilungen/inbox/"
  set names to paragraphs of (do shell script "ls " & quoted form of dir & " 2>/dev/null || true")
  repeat with n in names
    if (n as text) is not "" then
      set p to dir & n
      set content to do shell script "cat " & quoted form of p & "; rm -f " & quoted form of p
      set AppleScript's text item delimiters to (ASCII character 31)
      set parts to text items of content
      if (count of parts) > 1 then
        display notification (item 2 of parts) with title (item 1 of parts)
      else
        display notification content with title "Notiva"
      end if
      delay 0.4
    end if
  end repeat
end run`

const run = (cmd: string, args: string[]) =>
  new Promise<void>((resolve, reject) => execFile(cmd, args, (e) => (e ? reject(e) : resolve())))

let helperReady: Promise<boolean> | null = null
function ensureHelper(): Promise<boolean> {
  helperReady ??= (async () => {
    try {
      if (await fs.stat(path.join(HELPER, 'Contents', 'Info.plist')).catch(() => null)) return true
      await fs.mkdir(path.join(HELPER_DIR, 'inbox'), { recursive: true })
      await run('osacompile', ['-o', HELPER, '-e', APPLET])
      const plist = path.join(HELPER, 'Contents', 'Info.plist')
      const set = (key: string, value: string) =>
        run('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist]).catch(() =>
          run('/usr/libexec/PlistBuddy', ['-c', `Add :${key} string ${value}`, plist]),
        )
      await set('CFBundleIdentifier', 'io.github.flexi03.notiva.mitteilungen')
      await set('CFBundleName', 'Notiva')
      await set('LSUIElement', 'true').catch(() => undefined)
      // The Notiva icon (packaged app: resources; development: build/icon.icns).
      const icon = [
        path.join(process.resourcesPath ?? '', 'icon.icns'),
        path.join(app.getAppPath(), 'build', 'icon.icns'),
      ]
      for (const candidate of icon)
        if (await fs.stat(candidate).catch(() => null)) {
          await fs.copyFile(candidate, path.join(HELPER, 'Contents', 'Resources', 'applet.icns'))
          break
        }
      await run('codesign', ['--force', '--deep', '-s', '-', HELPER]).catch(() => undefined)
      return true
    } catch {
      helperReady = null
      return false
    }
  })()
  return helperReady
}

async function viaHelper(title: string, body: string): Promise<boolean> {
  if (!(await ensureHelper())) return false
  const file = path.join(HELPER_DIR, 'inbox', `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
  await fs.writeFile(
    file,
    `${title.replaceAll(SEP, ' ').slice(0, 200)}${SEP}${body.replaceAll(SEP, ' ').slice(0, 500)}`,
  )
  return run('open', ['-g', HELPER]).then(
    () => true,
    () => false,
  )
}

/** Fallback when macOS refuses Notiva's own notifications: the "Notiva" helper, else AppleScript. */
function fallback(title: string, body: string): void {
  void viaHelper(title, body).then((ok) => ok || viaAppleScript(title, body))
}

let nativeRefused = false
/** Keeps shown notifications alive (otherwise garbage collected before a click). */
const shown = new Set<Notification>()

function viaAppleScript(title: string, body: string): void {
  execFile(
    'osascript',
    [
      '-e',
      'on run argv',
      '-e',
      'display notification (item 2 of argv) with title (item 1 of argv)',
      '-e',
      'end run',
      title.slice(0, 200),
      body.slice(0, 500),
    ],
    () => undefined,
  )
}

export function systemNotify(title: string, body: string, onClick?: () => void): void {
  if (process.platform === 'darwin' && nativeRefused) return fallback(title, body)
  if (!Notification.isSupported()) return
  const n = new Notification({ title, body, silent: true })
  shown.add(n)
  if (onClick) n.on('click', onClick)
  n.on('close', () => shown.delete(n))
  n.on('failed', () => {
    shown.delete(n)
    if (process.platform !== 'darwin') return
    nativeRefused = true
    fallback(title, body)
  })
  n.show()
}

/** Test: did macOS take the notification? "shown", "refused" (then AppleScript was used) or "unsupported". */
export function testNotify(): Promise<'shown' | 'refused' | 'unsupported'> {
  if (!Notification.isSupported()) return Promise.resolve('unsupported')
  return new Promise((resolve) => {
    const n = new Notification({
      title: 'Notiva',
      body: 'So sehen Mitteilungen von Notiva aus.',
      silent: true,
    })
    shown.add(n)
    const timer = setTimeout(() => resolve('shown'), 3000)
    n.on('show', () => {
      clearTimeout(timer)
      nativeRefused = false
      resolve('shown')
    })
    n.on('failed', () => {
      clearTimeout(timer)
      shown.delete(n)
      nativeRefused = true
      if (process.platform === 'darwin') fallback('Notiva', 'So sehen Mitteilungen von Notiva aus.')
      resolve('refused')
    })
    n.show()
  })
}
