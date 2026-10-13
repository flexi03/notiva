import { guardVault, MemoryVault, VaultError } from '../vault'
import { UnsafePathError } from '../path'

describe('MemoryVault', () => {
  it('reads, writes, renames and removes files', async () => {
    const vault = new MemoryVault('Test', { 'a.md': 'A' })
    await vault.write('ordner/b.md', 'B')
    expect(await vault.read('ordner/b.md')).toBe('B')
    await vault.rename('ordner/b.md', 'c.md')
    expect((await vault.list()).map((f) => f.path).sort()).toEqual(['a.md', 'c.md'])
    await vault.remove('a.md')
    await expect(vault.read('a.md')).rejects.toBeInstanceOf(VaultError)
  })

  it('refuses to overwrite on rename', async () => {
    const vault = new MemoryVault('Test', { 'a.md': 'A', 'b.md': 'B' })
    await expect(vault.rename('a.md', 'b.md')).rejects.toMatchObject({ code: 'exists' })
  })

  it('skips hidden folders except .notiva', async () => {
    const vault = new MemoryVault('Test', { '.git/config': 'x', '.notiva/settings.json': '{}', 'a.md': '' })
    expect((await vault.list()).map((f) => f.path).sort()).toEqual(['.notiva/settings.json', 'a.md'])
  })
})

describe('security: guardVault', () => {
  const vault = guardVault(new MemoryVault('Test', { 'a.md': 'A' }))

  it.each(['../outside.md', '/etc/passwd', 'a/../../x', 'C:\\\\x'])(
    'blocks %j on every operation',
    async (bad) => {
      await expect(vault.read(bad)).rejects.toBeInstanceOf(UnsafePathError)
      await expect(vault.write(bad, 'x')).rejects.toBeInstanceOf(UnsafePathError)
      await expect(vault.remove(bad)).rejects.toBeInstanceOf(UnsafePathError)
      await expect(vault.rename('a.md', bad)).rejects.toBeInstanceOf(UnsafePathError)
    },
  )
})
