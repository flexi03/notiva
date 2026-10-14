// @vitest-environment node
import { mkdtempSync, mkdirSync, promises as fs, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { FsVault, VaultAccessError } from './vaultFs'

function tempDir() {
  return mkdtempSync(path.join(os.tmpdir(), 'notiva-test-'))
}

describe('FsVault', () => {
  let root: string
  let vault: FsVault

  beforeEach(async () => {
    root = tempDir()
    mkdirSync(path.join(root, 'Studium'))
    writeFileSync(path.join(root, 'Studium', 'Analysis.md'), '# A')
    mkdirSync(path.join(root, '.git'))
    writeFileSync(path.join(root, '.git', 'config'), 'x')
    vault = await FsVault.open(root)
  })

  it('lists, reads and writes files', async () => {
    await vault.write('Neu/Notiz.md', 'Hallo')
    expect((await vault.list()).map((f) => f.path).sort()).toEqual(['Neu/Notiz.md', 'Studium/Analysis.md'])
    expect(await vault.read('Neu/Notiz.md')).toBe('Hallo')
    expect(await vault.readBinary('Studium/Analysis.md')).toEqual(new TextEncoder().encode('# A'))
  })

  it('writes atomically without leaving temp files', async () => {
    await vault.write('a.md', 'x'.repeat(10000))
    expect((await fs.readdir(root)).filter((n) => n.endsWith('.tmp'))).toEqual([])
  })

  it('renames without overwriting and prunes empty folders', async () => {
    await vault.rename('Studium/Analysis.md', 'Uni/Analysis.md')
    expect((await vault.list()).map((f) => f.path)).toEqual(['Uni/Analysis.md'])
    await expect(fs.stat(path.join(root, 'Studium'))).rejects.toThrow()
    await vault.write('b.md', 'b')
    await expect(vault.rename('b.md', 'Uni/Analysis.md')).rejects.toThrow(/Exists/)
  })

  it('removes files', async () => {
    await vault.remove('Studium/Analysis.md')
    expect(await vault.list()).toEqual([])
  })
})

describe('security: FsVault stays inside the vault', () => {
  let root: string
  let outside: string
  let vault: FsVault

  beforeEach(async () => {
    root = tempDir()
    outside = tempDir()
    writeFileSync(path.join(outside, 'secret.md'), 'geheim')
    symlinkSync(outside, path.join(root, 'link-out'))
    symlinkSync(path.join(outside, 'secret.md'), path.join(root, 'secret-link.md'))
    mkdirSync(path.join(root, 'inner'))
    writeFileSync(path.join(root, 'inner', 'ok.md'), 'ok')
    symlinkSync(path.join(root, 'inner'), path.join(root, 'link-in'))
    vault = await FsVault.open(root)
  })

  it.each([
    '../secret.md',
    '/etc/passwd',
    'a/../../x.md',
    'C:/Windows/win.ini',
    'a\\..\\b',
    'x\u0000.md',
    '',
  ])('rejects %j', async (bad) => {
    await expect(vault.read(bad)).rejects.toBeInstanceOf(VaultAccessError)
    await expect(vault.write(bad, 'x')).rejects.toBeInstanceOf(VaultAccessError)
    await expect(vault.remove(bad)).rejects.toBeInstanceOf(VaultAccessError)
  })

  it('blocks symlinks that point outside', async () => {
    await expect(vault.read('link-out/secret.md')).rejects.toThrow(/Symlink/)
    await expect(vault.read('secret-link.md')).rejects.toThrow(/Symlink/)
    await expect(vault.write('link-out/new.md', 'x')).rejects.toThrow(/Symlink/)
    expect(await fs.readdir(outside)).toEqual(['secret.md'])
  })

  it('does not list files behind escaping symlinks, but follows internal ones', async () => {
    const paths = (await vault.list()).map((f) => f.path).sort()
    expect(paths).toEqual(['inner/ok.md', 'link-in/ok.md'])
  })

  it('rejects non-string content', async () => {
    await expect(vault.write('a.md', { evil: true } as unknown as string)).rejects.toBeInstanceOf(
      VaultAccessError,
    )
  })
})
