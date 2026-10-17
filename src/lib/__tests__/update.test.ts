import { describe, expect, it } from 'vitest'
import { compareVersions, pickAsset, releaseNotes, toReleases, type GitHubRelease } from '../update'

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
      'Notiva-1.1.0-linux-arm64.AppImage',
      'Notiva-1.1.0-linux-x86_64.AppImage',
      'latest-mac.yml',
    ].map((name) => ({ name, url: `https://x/${name}`, size: 1 }))
    expect(pickAsset(assets, 'darwin', 'arm64')?.name).toBe('Notiva-1.1.0-mac-arm64.zip')
    expect(pickAsset(assets, 'darwin', 'x64')).toBeUndefined()
    expect(pickAsset(assets, 'win32', 'x64')?.name).toBe('Notiva-1.1.0-win-x64.exe')
    expect(pickAsset(assets, 'linux', 'x64')?.name).toBe('Notiva-1.1.0-linux-x86_64.AppImage')
    expect(pickAsset(assets, 'linux', 'arm64')?.name).toBe('Notiva-1.1.0-linux-arm64.AppImage')
  })
})

describe('versions list', () => {
  const release = (tag: string, extra: Partial<GitHubRelease> = {}): GitHubRelease => ({
    tag_name: tag,
    published_at: '2026-10-17T12:00:00Z',
    body: '',
    html_url: `https://github.com/flexi03/notiva/releases/tag/${tag}`,
    assets: [{ name: `Notiva-${tag.slice(1)}-mac-arm64.zip`, browser_download_url: 'u', size: 1 }],
    ...extra,
  })

  it('lists published versions newest first, with the file for this system', () => {
    const list = toReleases(
      [
        release('v0.2.0'),
        release('v0.10.0'),
        release('v0.3.0', { draft: true }),
        release('v0.2.4', { assets: [] }),
      ],
      'darwin',
      'arm64',
    )
    expect(list.map((r) => r.version)).toEqual(['0.10.0', '0.2.4', '0.2.0'])
    expect(list[0]!.asset?.name).toBe('Notiva-0.10.0-mac-arm64.zip')
    expect(list[1]!.asset).toBeUndefined()
  })

  it('shows the notes in the app language', () => {
    const body = '## English\n\n- New thing\n\n## Deutsch\n\n- Neues Ding\n'
    expect(releaseNotes(body, 'de')).toBe('- Neues Ding')
    expect(releaseNotes(body, 'en')).toBe('- New thing')
    expect(releaseNotes('- Nur deutsch (alt)', 'en')).toBe('- Nur deutsch (alt)')
  })
})
