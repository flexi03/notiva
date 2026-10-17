import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSnapshot, listSnapshots, restoreSnapshot, snapshotsToDelete } from './backup'

function vault() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'notiva-backup-vault-'))
  mkdirSync(path.join(dir, 'Unterlagen'), { recursive: true })
  mkdirSync(path.join(dir, '.git'), { recursive: true })
  mkdirSync(path.join(dir, '.notiva/cache'), { recursive: true })
  writeFileSync(path.join(dir, 'Notiz.md'), '# Notiz\n')
  writeFileSync(path.join(dir, 'Unterlagen/Skript.pdf'), '%PDF-1')
  writeFileSync(path.join(dir, '.git/HEAD'), 'ref')
  writeFileSync(path.join(dir, '.notiva/cache/x.json'), '{}')
  writeFileSync(path.join(dir, '.notiva/settings.json'), '{}')
  return dir
}

describe('backup', () => {
  it('copies the files (not Git, not caches); unchanged files are hard links to the last snapshot', async () => {
    const src = vault()
    const root = mkdtempSync(path.join(os.tmpdir(), 'notiva-backup-root-'))
    const first = await createSnapshot(src, root, { now: new Date('2026-10-17T10:00:00') })
    expect(first.name).toBe('2026-10-17 1000')
    expect(readFileSync(path.join(first.path, 'Unterlagen/Skript.pdf'), 'utf8')).toBe('%PDF-1')
    expect(existsSync(path.join(first.path, '.git'))).toBe(false)
    expect(existsSync(path.join(first.path, '.notiva/cache'))).toBe(false)
    expect(existsSync(path.join(first.path, '.notiva/settings.json'))).toBe(true)

    // Atomic write of a new version (as Notiva does): the backup keeps the old one.
    writeFileSync(path.join(src, 'Notiz.tmp'), '# Notiz\n\nneu\n')
    const { renameSync } = await import('node:fs')
    renameSync(path.join(src, 'Notiz.tmp'), path.join(src, 'Notiz.md'))
    const second = await createSnapshot(src, root, { now: new Date('2026-10-18T10:00:00') })
    expect(readFileSync(path.join(first.path, 'Notiz.md'), 'utf8')).toBe('# Notiz\n')
    expect(readFileSync(path.join(second.path, 'Notiz.md'), 'utf8')).toContain('neu')
    // The PDF did not change: the same file on disk (hard link).
    expect(statSync(path.join(second.path, 'Unterlagen/Skript.pdf')).ino).toBe(
      statSync(path.join(first.path, 'Unterlagen/Skript.pdf')).ino,
    )
    expect((await listSnapshots(root)).map((s) => s.name)).toEqual(['2026-10-18 1000', '2026-10-17 1000'])

    const restored = await restoreSnapshot(first.path, src)
    expect(readFileSync(path.join(restored, 'Notiz.md'), 'utf8')).toBe('# Notiz\n')
    expect(restored).toContain('(Sicherung 2026-10-17 1000)')
  })

  it('keeps one per day for 14 days, then the first of each month', () => {
    const names = [
      '2026-10-17 0900',
      '2026-10-17 1800',
      '2026-10-10 0900',
      '2026-09-20 0900',
      '2026-09-02 0900',
      '2026-08-15 0900',
    ]
    expect(snapshotsToDelete(names, new Date('2026-10-17T20:00:00')).sort()).toEqual([
      '2026-09-20 0900',
      '2026-10-17 0900',
    ])
  })
})
