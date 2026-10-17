import { MemoryVault } from '../vault'
import { Workspace, TRASH_DIR } from '../workspace'

const DB = `---
icon: 📚
database:
  properties:
    - { name: ECTS, type: number }
    - { name: Status, type: select, options: [Laufend, Bestanden] }
---
Alle Module.
`

async function setup(files: Record<string, string> = {}) {
  const vault = new MemoryVault('Test', {
    'Start.md': '# Start\nSiehe [[Analysis]] und [[Studium]]. #wichtig',
    'Studium.md': '---\nicon: 🎓\ntags: [uni]\n---\nÜbersicht',
    'Studium/Module.md': DB,
    'Studium/Module/Analysis.md': '---\nECTS: 9\nStatus: Bestanden\n---\nGrenzwerte #mathe',
    'Studium/Module/Algebra.md': '---\nECTS: 6\n---\n',
    'Studium/Notizen/Idee.md': 'Link auf [[Start]]',
    'Archiv/Start.md': 'Altes Start',
    'bild.png': 'PNG',
    ...files,
  })
  return { vault, ws: await Workspace.open(vault) }
}

describe('Workspace index', () => {
  it('builds pages with titles, icons and tags', async () => {
    const { ws } = await setup()
    const page = ws.get('Studium.md')!
    expect(page).toMatchObject({ title: 'Studium', icon: '🎓', tags: ['uni'] })
    expect(ws.get('Start.md')!.tags).toEqual(['wichtig'])
    expect(ws.assets().map((a) => a.path)).toEqual(['bild.png'])
  })

  it('detects databases and their rows', async () => {
    const { ws } = await setup()
    expect(ws.databases().map((d) => d.path)).toEqual(['Studium/Module.md'])
    expect(ws.get('Studium/Module/Analysis.md')!.parentDatabase).toBe('Studium/Module.md')
    expect(
      ws
        .rows('Studium/Module.md')
        .map((r) => r.title)
        .sort(),
    ).toEqual(['Algebra', 'Analysis'])
    const rows = ws.resolvedRows('Studium/Module.md')
    expect(rows.find((r) => r.row.title === 'Analysis')!.values).toMatchObject({
      ECTS: 9,
      Status: 'Bestanden',
    })
  })

  it('builds a tree that merges folders with pages and hides rows', async () => {
    const { ws } = await setup()
    const shape = (nodes: ReturnType<Workspace['tree']>): unknown =>
      nodes.map((n) => (n.children.length ? { [n.title]: shape(n.children) } : n.title))
    expect(shape(ws.tree())).toEqual([
      { Archiv: ['Start'] },
      'Start',
      { Studium: ['Module', { Notizen: ['Idee'] }] },
    ])
  })

  it('resolves links by name, path and proximity', async () => {
    const { ws } = await setup()
    expect(ws.resolveLink('analysis')).toBe('Studium/Module/Analysis.md')
    expect(ws.resolveLink('Archiv/Start')).toBe('Archiv/Start.md')
    expect(ws.resolveLink('Start')).toBe('Start.md')
    expect(ws.resolveLink('Start', 'Archiv/Other.md')).toBe('Archiv/Start.md')
    expect(ws.resolveLink('Fehlt')).toBeNull()
    expect(ws.linkText('Archiv/Start.md')).toBe('Archiv/Start')
  })

  it('links files with their extension', async () => {
    const { ws } = await setup({ 'Unterlagen/P/Blatt 01.pdf': 'PDF', 'Unterlagen/Q/Blatt 01.pdf': 'PDF' })
    expect(ws.linkText('bild.png')).toBe('bild.png')
    expect(ws.resolveLink(ws.linkText('bild.png'))).toBe('bild.png')
    // Same name twice: the full path.
    expect(ws.linkText('Unterlagen/P/Blatt 01.pdf')).toBe('Unterlagen/P/Blatt 01.pdf')
    expect(ws.resolveLink('Unterlagen/P/Blatt 01.pdf')).toBe('Unterlagen/P/Blatt 01.pdf')
    // Moved into another folder: still found by its name.
    expect(ws.resolveLink('Unterlagen/Alt/bild.png')).toBe('bild.png')
  })

  it('computes backlinks and tags', async () => {
    const { ws } = await setup()
    expect(ws.backlinks('Studium/Module/Analysis.md').map((p) => p.path)).toEqual(['Start.md'])
    expect(ws.backlinks('Start.md').map((p) => p.path)).toEqual(['Studium/Notizen/Idee.md'])
    expect([...ws.tags().keys()]).toEqual(['mathe', 'uni', 'wichtig'])
  })

  it('searches titles and content with prefix and fuzzy matching', async () => {
    const { ws } = await setup()
    expect(ws.search('grenzw')[0]!.path).toBe('Studium/Module/Analysis.md')
    expect(ws.search('Anlysis')[0]!.path).toBe('Studium/Module/Analysis.md')
    expect(ws.search('   ')).toEqual([])
  })

  it('keeps pages with broken YAML readable', async () => {
    const { ws } = await setup({ 'Kaputt.md': '---\na: [\n---\nText' })
    expect(ws.get('Kaputt.md')!.error).toBeTruthy()
  })

  it('builds breadcrumbs', async () => {
    const { ws } = await setup()
    expect(ws.breadcrumbs('Studium/Notizen/Idee.md')).toEqual([
      { path: 'Studium.md', title: 'Studium', folder: 'Studium' },
      { path: null, title: 'Notizen', folder: 'Studium/Notizen' },
    ])
  })
})

describe('Workspace writes', () => {
  it('creates pages with unique, safe file names', async () => {
    const { ws, vault } = await setup()
    const a = await ws.createPage({ title: 'Start' })
    const b = await ws.createPage({ folder: 'Neu', title: 'Mathe: Teil 1/2', body: 'x' })
    expect(a).toBe('Start 2.md')
    expect(b).toBe('Neu/Mathe Teil 1 2.md')
    expect(ws.get(b)!.title).toBe('Mathe: Teil 1/2')
    expect(await vault.read(b)).toBe('---\ntitle: "Mathe: Teil 1/2"\n---\nx')
  })

  it('creates database rows in the row folder', async () => {
    const { ws } = await setup()
    const path = await ws.createRow('Studium/Module.md', 'Stochastik', { ECTS: 5 })
    expect(path).toBe('Studium/Module/Stochastik.md')
    expect(ws.get(path)!.parentDatabase).toBe('Studium/Module.md')
  })

  it('saves properties and notifies subscribers', async () => {
    const { ws } = await setup()
    const listener = vi.fn()
    ws.subscribe(listener)
    await ws.setProperty('Studium/Module/Algebra.md', 'Status', 'Laufend')
    expect(ws.resolvedRows('Studium/Module.md').find((r) => r.row.title === 'Algebra')!.values.Status).toBe(
      'Laufend',
    )
    expect(listener).toHaveBeenCalled()
  })

  it('renames a page, moves its sub-pages and rewrites links', async () => {
    const { ws, vault } = await setup()
    const next = await ws.rename('Studium/Module/Analysis.md', 'Analysis I')
    expect(next).toBe('Studium/Module/Analysis I.md')
    expect(await vault.read('Start.md')).toContain('[[Analysis I]]')
    const moved = await ws.rename('Studium.md', 'Uni')
    expect(moved).toBe('Uni.md')
    expect(ws.get('Uni/Module.md')!.database).not.toBeNull()
    expect(ws.rows('Uni/Module.md')).toHaveLength(2)
    expect(await vault.read('Start.md')).toContain('[[Uni]]')
  })

  it('only rewrites links that pointed to the renamed page', async () => {
    const { ws, vault } = await setup({ 'Archiv/Notiz.md': '[[Start]] meint Archiv/Start' })
    await ws.rename('Start.md', 'Home')
    expect(await vault.read('Archiv/Notiz.md')).toBe('[[Start]] meint Archiv/Start')
    expect(await vault.read('Studium/Notizen/Idee.md')).toBe('Link auf [[Home]]')
  })

  it('updates relation values on rename', async () => {
    const { ws, vault } = await setup({ 'Plan.md': '---\nModul: "[[Algebra]]"\n---\n' })
    await ws.rename('Studium/Module/Algebra.md', 'Lineare Algebra')
    expect(await vault.read('Plan.md')).toContain('[[Lineare Algebra]]')
  })

  it('refuses to move a page into itself', async () => {
    const { ws } = await setup()
    await expect(ws.moveTo('Studium.md', 'Studium/Notizen')).rejects.toThrow()
  })

  it('moves pages to the trash and restores them', async () => {
    const { ws, vault } = await setup()
    const entry = await ws.trash('Studium.md')
    expect(ws.get('Studium.md')).toBeUndefined()
    expect(ws.get('Studium/Module/Analysis.md')).toBeUndefined()
    expect(
      Object.keys(await vault.snapshot()).some((p) =>
        p.startsWith(`${TRASH_DIR}/${entry.id}/Studium/Module/`),
      ),
    ).toBe(true)
    expect((await ws.listTrash()).map((e) => e.original)).toEqual(['Studium.md'])
    await ws.restore(entry.id)
    expect(ws.rows('Studium/Module.md')).toHaveLength(2)
    expect(await ws.listTrash()).toEqual([])
  })

  it('renames database properties including stored values and views', async () => {
    const { ws } = await setup()
    await ws.renameDatabaseProperty('Studium/Module.md', 'ECTS', 'Credits')
    expect(ws.get('Studium/Module.md')!.database!.properties[0]!.name).toBe('Credits')
    expect(ws.get('Studium/Module/Analysis.md')!.data).toEqual({ Credits: 9, Status: 'Bestanden' })
  })

  it('serializes concurrent writes', async () => {
    const { ws } = await setup()
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => ws.createPage({ title: 'Parallel', body: String(i) })),
    )
    expect(ws.all().filter((p) => p.title.startsWith('Parallel'))).toHaveLength(10)
  })

  it('reads and writes meta files', async () => {
    const { ws } = await setup()
    expect(await ws.readMeta('settings.json')).toBeNull()
    await ws.writeMeta('settings.json', { theme: 'dark' })
    expect(await ws.readMeta('settings.json')).toEqual({ theme: 'dark' })
    expect(ws.get('.notiva/settings.json')).toBeUndefined()
  })

  it('does not try to read meta files that are not there (no error in the log)', async () => {
    const { vault, ws } = await setup({ '.notiva/old.json': '{"a":1}' })
    const read = vi.spyOn(vault, 'read')
    expect(await ws.readMeta('moodle-removed.json')).toBeNull()
    expect(read).not.toHaveBeenCalled()
    expect(await ws.readMeta('old.json')).toEqual({ a: 1 })
  })
})

describe('saves keep the file format (small Git diffs)', () => {
  it('changes only the edited frontmatter line', async () => {
    const original =
      '---\nStatus: In Arbeit\nModul: ["[[Datenbanken]]"]\nFällig: 2026-10-19\nPriorität: Mittel\nArt: Abgabe\n---\n\nNotizen\n'
    const vault = new MemoryVault('Test', { 'Aufgabe.md': original })
    const ws = await Workspace.open(vault)
    await ws.setProperty('Aufgabe.md', 'Fällig', '2026-10-01')
    expect(await vault.read('Aufgabe.md')).toBe(original.replace('2026-10-19', '2026-10-01'))
    await ws.save('Aufgabe.md', { body: '\nNotizen und mehr\n' })
    expect(await vault.read('Aufgabe.md')).toBe(
      original.replace('2026-10-19', '2026-10-01').replace('Notizen', 'Notizen und mehr'),
    )
  })

  it('source mode writes the text as typed and skips unchanged saves', async () => {
    const original = '---\ntags: [a, b]   # Liste\n---\nText\n'
    const vault = new MemoryVault('Test', { 'A.md': original })
    const ws = await Workspace.open(vault)
    expect(ws.source('A.md')).toBe(original)
    const write = vi.spyOn(vault, 'write')
    await ws.saveSource('A.md', original)
    expect(write).not.toHaveBeenCalled()
    await ws.saveSource('A.md', original.replace('Text', 'Neu'))
    expect(await vault.read('A.md')).toBe('---\ntags: [a, b]   # Liste\n---\nNeu\n')
    await expect(ws.saveSource('A.md', '---\na: [\n---\n')).rejects.toThrow()
  })
})

describe('documents in the tree', () => {
  it('shows PDFs and slides in their folder, not images', async () => {
    const vault = new MemoryVault('Test', {
      'Studium.md': '# Studium',
      'Studium/Unterlagen/LA/vl01.pdf': '%PDF',
      'Studium/Unterlagen/LA/folien.pptx': 'x',
      'Studium/bild.png': 'PNG',
    })
    const ws = await Workspace.open(vault)
    const studium = ws.tree().find((n) => n.id === 'Studium.md')!
    const la = studium.children[0]!.children[0]!
    expect(la.title).toBe('LA')
    expect(la.children.map((n) => [n.title, n.file])).toEqual([
      ['folien.pptx', 'Studium/Unterlagen/LA/folien.pptx'],
      ['vl01.pdf', 'Studium/Unterlagen/LA/vl01.pdf'],
    ])
    expect(JSON.stringify(ws.tree())).not.toContain('bild.png')
  })
})

describe('autosave off', () => {
  it('keeps changes in memory until saveAll', async () => {
    const vault = new MemoryVault('Test', { 'A.md': '# A\n' })
    const ws = await Workspace.open(vault)
    await ws.setAutosave(false)
    await ws.save('A.md', { body: '# A\n\nNeu\n' })
    const created = await ws.createPage({ title: 'B', body: 'Entwurf' })
    // Visible in the app …
    expect(ws.get('A.md')!.body).toContain('Neu')
    expect(ws.get(created)).toBeTruthy()
    // … but not on disk yet.
    expect(await vault.read('A.md')).toBe('# A\n')
    await expect(vault.read('B.md')).rejects.toThrow()
    expect(ws.unsaved().sort()).toEqual(['A.md', 'B.md'])
    // A reload (e.g. file watcher) keeps them.
    await ws.reload()
    expect(ws.get('A.md')!.body).toContain('Neu')
    expect(await ws.saveAll()).toBe(2)
    expect(await vault.read('A.md')).toContain('Neu')
    expect(await vault.read('B.md')).toBe('Entwurf')
    expect(ws.unsaved()).toEqual([])
  })

  it('writes pending changes when it is switched on, before moves, and can discard them', async () => {
    const vault = new MemoryVault('Test', { 'A.md': 'alt', 'C.md': 'c' })
    const ws = await Workspace.open(vault)
    await ws.setAutosave(false)
    await ws.save('A.md', { body: 'neu' })
    await ws.setAutosave(true)
    expect(await vault.read('A.md')).toBe('neu')

    await ws.setAutosave(false)
    await ws.save('A.md', { body: 'vor dem Umbenennen' })
    const moved = await ws.rename('A.md', 'Z')
    expect(await vault.read(moved)).toBe('vor dem Umbenennen')

    await ws.save('C.md', { body: 'verworfen' })
    await ws.discardUnsaved()
    expect(ws.get('C.md')!.body).toBe('c')
  })
})

describe('tree and trash for files', () => {
  it('hangs a notes page under its PDF and trashes files and folders restorably', async () => {
    const vault = new MemoryVault('T', {
      'U/Skript.pdf': 'PDF',
      'U/Skript (Notizen).md': '---\npdf: Skript.pdf\n---\n',
      'U/alt/a.pdf': 'A',
      'U/alt/b.sql': 'B',
    })
    const ws = await Workspace.open(vault)
    const u = ws.tree().find((n) => n.title === 'U')!
    const pdf = u.children.find((n) => n.file === 'U/Skript.pdf')!
    expect(pdf.children.map((c) => c.title)).toEqual(['Skript (Notizen)'])
    expect(u.children.some((c) => c.page?.path === 'U/Skript (Notizen).md')).toBe(false)
    const entry = await ws.trashPath('U/alt')
    expect(ws.has('U/alt/a.pdf')).toBe(false)
    expect(entry.files.sort()).toEqual(['U/alt/a.pdf', 'U/alt/b.sql'])
    await ws.restore(entry.id)
    expect(ws.has('U/alt/b.sql')).toBe(true)
    const file = await ws.trashPath('U/Skript.pdf')
    expect(ws.has('U/Skript.pdf')).toBe(false)
    await ws.restore(file.id)
    expect(ws.has('U/Skript.pdf')).toBe(true)
  })
})
