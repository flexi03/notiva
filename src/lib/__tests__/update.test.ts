import { describe, expect, it } from 'vitest'
import { compareVersions, pickAsset } from '../update'

describe('update', () => {
  it('vergleicht Versionen', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('v1.10.0', '1.9.3')).toBe(1)
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1)
    expect(compareVersions('2.0.0-beta.1', '1.9.9')).toBe(1)
  })

  it('wählt die Datei für dieses System', () => {
    const assets = [
      'Notiva-1.1.0-mac-arm64.dmg',
      'Notiva-1.1.0-mac-arm64.zip',
      'Notiva-1.1.0-win-x64.exe',
      'Notiva-1.1.0-linux-x86_64.AppImage',
      'latest-mac.yml',
    ].map((name) => ({ name, url: `https://x/${name}`, size: 1 }))
    expect(pickAsset(assets, 'darwin', 'arm64')?.name).toBe('Notiva-1.1.0-mac-arm64.zip')
    expect(pickAsset(assets, 'darwin', 'x64')).toBeUndefined()
    expect(pickAsset(assets, 'win32', 'x64')?.name).toBe('Notiva-1.1.0-win-x64.exe')
    expect(pickAsset(assets, 'linux', 'x64')?.name).toBe('Notiva-1.1.0-linux-x86_64.AppImage')
  })
})
