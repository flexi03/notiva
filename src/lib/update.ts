/** Versions and release assets for the self-updater (GitHub releases). Pure. */

export const RELEASES_REPO = 'flexi03/notiva'

/** -1, 0 or 1 for "1.2.3" vs "1.10.0" (a leading "v" and pre-release suffixes are ignored). */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    v
      .replace(/^v/i, '')
      .split(/[-+]/)[0]!
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0)
  const x = parts(a)
  const y = parts(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d) return d > 0 ? 1 : -1
  }
  return 0
}

export interface ReleaseAsset {
  name: string
  url: string
  size: number
}

/**
 * The file the updater installs on this system (names from electron-builder's artifactName
 * "Notiva-<version>-<os>-<arch>.<ext>"): macOS zip, Windows installer, Linux AppImage.
 */
export function pickAsset(assets: ReleaseAsset[], platform: string, arch: string): ReleaseAsset | undefined {
  const ext = platform === 'darwin' ? '.zip' : platform === 'win32' ? '.exe' : '.AppImage'
  const os = platform === 'darwin' ? 'mac' : platform === 'win32' ? 'win' : 'linux'
  const wanted = (a: ReleaseAsset) => a.name.endsWith(ext) && a.name.includes(`-${os}-`)
  const archName = arch === 'x64' && platform === 'linux' ? 'x86_64' : arch
  return (
    assets.find((a) => wanted(a) && a.name.includes(`-${archName}.`)) ??
    // Windows/Linux installers may be universal (no arch in the name).
    (platform === 'darwin' ? undefined : assets.find(wanted))
  )
}

export type UpdateStatus =
  | { state: 'idle' | 'checking' | 'current'; version: string; checkedAt?: string }
  | { state: 'available'; version: string; latest: string; notes: string; url: string; checkedAt?: string }
  | { state: 'downloading'; version: string; latest: string; done: number; total: number }
  | { state: 'ready'; version: string; latest: string }
  | { state: 'error'; version: string; message: string }
