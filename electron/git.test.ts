// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, existsSync, utimesSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { GitRepo } from './git'
import { FsVault } from './vaultFs'

beforeAll(() => {
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
    GIT_CONFIG_NOSYSTEM: '1',
  })
})

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' })

/** A repo whose vault is the folder "Notizen" inside it (vaults need not be the repo root). */
async function setup() {
  const top = mkdtempSync(path.join(os.tmpdir(), 'notiva-git-'))
  git(top, 'init', '-q', '-b', 'main')
  mkdirSync(path.join(top, 'Notizen', 'Studium'), { recursive: true })
  writeFileSync(path.join(top, 'Notizen', 'Alt.md'), 'eins\nzwei\n')
  writeFileSync(path.join(top, 'Notizen', 'Studium', 'Mathe Teil 1.md'), '# Mathe\n')
  writeFileSync(path.join(top, 'README.md'), 'außerhalb des Vaults\n')
  git(top, 'add', '.')
  git(top, 'commit', '-q', '-m', 'Start')
  const vault = await FsVault.open(path.join(top, 'Notizen'))
  const repo = (await GitRepo.open(vault))!
  return { top, root: vault.root, vault, repo }
}

describe('GitRepo', () => {
  it('detects folders without a repository', async () => {
    const plain = await FsVault.open(mkdtempSync(path.join(os.tmpdir(), 'notiva-nogit-')))
    expect(await GitRepo.open(plain)).toBeNull()
  })

  it('reports changes relative to the vault and ignores files outside it', async () => {
    const { top, root, repo } = await setup()
    writeFileSync(path.join(root, 'Alt.md'), 'eins\nZWEI\n')
    writeFileSync(path.join(root, 'Neu.md'), 'neu\n')
    writeFileSync(path.join(top, 'README.md'), 'geändert\n')
    mkdirSync(path.join(root, '.notiva', 'trash', 'x'), { recursive: true })
    writeFileSync(path.join(root, '.notiva', 'trash', 'x', 'a.md'), 'weg')
    const state = await repo.state()
    expect(state).toMatchObject({ isRepo: true, branch: 'main', ahead: 0, behind: 0 })
    expect(state.head).toMatch(/^[0-9a-f]{40}$/)
    expect(state.changes).toEqual([
      { path: 'Alt.md', status: 'modified' },
      { path: 'Neu.md', status: 'untracked' },
    ])
  })

  it('shows file versions at HEAD (null for new files)', async () => {
    const { repo } = await setup()
    expect(await repo.show('HEAD', 'Studium/Mathe Teil 1.md')).toBe('# Mathe\n')
    expect(await repo.show('HEAD', 'Neu.md')).toBeNull()
    await expect(repo.show('HEAD; rm -rf /', 'Alt.md')).rejects.toThrow(/Revision/)
    await expect(repo.show('HEAD', '../README.md')).rejects.toThrow()
  })

  it('commits only the selected files', async () => {
    const { root, repo, top } = await setup()
    writeFileSync(path.join(root, 'Alt.md'), 'eins\nzwei\ndrei\n')
    writeFileSync(path.join(root, 'Neu.md'), 'neu\n')
    await repo.commit('Neue Seite', ['Neu.md'])
    expect(git(top, 'log', '--format=%s', '-n1').trim()).toBe('Neue Seite')
    expect((await repo.state()).changes).toEqual([{ path: 'Alt.md', status: 'modified' }])
    const log = await repo.log(10)
    expect(log.map((c) => c.subject)).toEqual(['Neue Seite', 'Start'])
    expect(await repo.commitFiles(log[0]!.hash)).toEqual([{ path: 'Neu.md', status: 'added' }])
    await expect(repo.commit('', ['Alt.md'])).rejects.toThrow(/Nachricht/)
  })

  it('waits for a locked index and removes a lock left over from a crash', async () => {
    const { root, repo, top } = await setup()
    writeFileSync(path.join(root, 'Neu.md'), 'neu\n')
    const lock = path.join(top, '.git', 'index.lock')
    writeFileSync(lock, '')
    const old = new Date(Date.now() - 20 * 60_000)
    utimesSync(lock, old, old)
    await repo.commit('Trotz Sperre', ['Neu.md'])
    expect(git(top, 'log', '--format=%s', '-n1').trim()).toBe('Trotz Sperre')
    expect(existsSync(lock)).toBe(false)
  })

  it('treats paths literally (no globs) and refuses paths outside the vault', async () => {
    const { root, repo } = await setup()
    writeFileSync(path.join(root, 'Alt.md'), 'x\n')
    writeFileSync(path.join(root, 'Neu.md'), 'y\n')
    await repo.commit('glob?', ['*.md']).catch(() => undefined)
    expect((await repo.state()).changes).toHaveLength(2)
    await expect(repo.commit('x', ['../README.md'])).rejects.toThrow()
    await expect(repo.discard(['/etc/passwd'])).rejects.toThrow()
  })

  it('discards changes: restores tracked files, deletes new ones', async () => {
    const { root, repo } = await setup()
    writeFileSync(path.join(root, 'Alt.md'), 'kaputt\n')
    writeFileSync(path.join(root, 'Neu.md'), 'neu\n')
    await repo.discard(['Alt.md', 'Neu.md'])
    expect(readFileSync(path.join(root, 'Alt.md'), 'utf8')).toBe('eins\nzwei\n')
    expect(existsSync(path.join(root, 'Neu.md'))).toBe(false)
    expect((await repo.state()).changes).toEqual([])
  })

  it('initialises a repository with a sensible .gitignore', async () => {
    const vault = await FsVault.open(mkdtempSync(path.join(os.tmpdir(), 'notiva-init-')))
    const repo = await GitRepo.init(vault)
    expect(await vault.read('.gitignore')).toContain('.notiva/trash/')
    expect((await repo.state()).changes).toEqual([{ path: '.gitignore', status: 'untracked' }])
  })
})
