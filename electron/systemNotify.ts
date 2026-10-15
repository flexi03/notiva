/**
 * System notifications (macOS: Mitteilungszentrale). Electron's notifications need a properly
 * signed app on macOS; Notiva without an Apple certificate is refused ("UNErrorDomain 1") and
 * macOS never asks. Then Notiva uses AppleScript's `display notification` instead – it reaches the
 * notification centre too (shown for "Skripteditor"). Texts go as arguments, never as code.
 */
import { execFile } from 'node:child_process'
import { Notification } from 'electron'

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
  if (process.platform === 'darwin' && nativeRefused) return viaAppleScript(title, body)
  if (!Notification.isSupported()) return
  const n = new Notification({ title, body, silent: true })
  shown.add(n)
  if (onClick) n.on('click', onClick)
  n.on('close', () => shown.delete(n))
  n.on('failed', () => {
    shown.delete(n)
    if (process.platform !== 'darwin') return
    nativeRefused = true
    viaAppleScript(title, body)
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
      if (process.platform === 'darwin') viaAppleScript('Notiva', 'So sehen Mitteilungen von Notiva aus.')
      resolve('refused')
    })
    n.show()
  })
}
