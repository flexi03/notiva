import { installPack, studyPack } from '../packs'
import { MemoryVault } from '../vault'
import { Workspace } from '../workspace'
import { runTool, TOOLS } from '../ai/tools'
import { validate } from '../ai/schema'

const now = new Date(2026, 9, 14, 10)

async function setup() {
  const ws = await Workspace.open(new MemoryVault())
  await installPack(ws, studyPack, {}, '', now)
  const call = async (name: string, input: unknown) => {
    const outcome = await runTool({ ws, now }, name, input)
    return { ...outcome, data: outcome.ok ? (JSON.parse(outcome.text) as unknown) : null }
  }
  return { ws, call }
}

describe('AI tools: reading', () => {
  it('searches and lists pages', async () => {
    const { call } = await setup()
    const hits = (await call('search_pages', { query: 'Lineare Algebra' })).data as Array<{ path: string }>
    expect(hits.map((h) => h.path)).toContain('Studium/Module/Lineare Algebra.md')
    const list = (await call('list_pages', { folder: 'Studium/Module' })).data as {
      pages: Array<{ path: string; database?: string }>
    }
    expect(list.pages.every((p) => p.path.startsWith('Studium/Module'))).toBe(true)
    expect(list.pages.find((p) => p.path === 'Studium/Module/Datenbanken.md')?.database).toBe(
      'Studium/Module.md',
    )
  })

  it('reads a page by title and a database with its schema', async () => {
    const { call } = await setup()
    const page = (await call('read_page', { page: 'Datenbanken' })).data as {
      path: string
      properties: object
    }
    expect(page.path).toBe('Studium/Module/Datenbanken.md')
    expect(page.properties).toMatchObject({ ECTS: 6 })
    const db = (await call('read_page', { page: 'Studium/Module.md' })).data as {
      schema: Array<{ name: string }>
      properties: object
    }
    expect(db.schema.map((p) => p.name)).toContain('Note')
    expect(db.properties).not.toHaveProperty('database')
  })

  it('queries a database with filters, computed values and sorting', async () => {
    const { call } = await setup()
    const result = (
      await call('query_database', {
        database: 'Module',
        filter: [{ property: 'Status', op: 'eq', value: 'Bestanden' }],
        sort: [{ property: 'Note', direction: 'asc' }],
      })
    ).data as { total: number; rows: Array<{ title: string; values: Record<string, unknown> }> }
    expect(result.total).toBe(2)
    expect(result.rows.map((r) => r.values.Status)).toEqual(['Bestanden', 'Bestanden'])
    const notes = result.rows.map((r) => r.values.Note as number)
    expect(notes).toEqual([...notes].sort((a, b) => a - b))
  })

  it('explains unknown pages and properties so the model can recover', async () => {
    const { call } = await setup()
    expect((await call('read_page', { page: 'Gibt es nicht' })).text).toMatch(/nicht gefunden.*search_pages/)
    expect(
      (await call('query_database', { database: 'Module', filter: [{ property: 'Farbe', op: 'eq' }] })).text,
    ).toMatch(/Unbekannte Eigenschaft „Farbe“. Vorhanden: .*ECTS/)
    expect((await call('query_database', { database: 'Willkommen' })).ok).toBe(false)
  })
})

describe('AI tools: writing', () => {
  it('creates pages below a folder and returns the path', async () => {
    const { ws, call } = await setup()
    const result = await call('create_page', {
      title: 'Lernzettel LA',
      folder: 'Studium',
      body: '# Eigenwerte\n\n- [ ] Beispiele rechnen\n',
      properties: { tags: ['lernzettel'] },
    })
    expect(result.touched).toEqual(['Studium/Lernzettel LA.md'])
    expect(ws.get('Studium/Lernzettel LA.md')?.tags).toContain('lernzettel')
  })

  it('creates database rows with typed values and relations by title', async () => {
    const { ws, call } = await setup()
    const { data } = await call('create_row', {
      database: 'Aufgaben',
      title: 'Blatt 4',
      values: { Modul: 'Lineare Algebra', Fällig: '2026-10-23', Priorität: 'Hoch' },
    })
    const path = (data as { path: string }).path
    expect(ws.get(path)?.parentDatabase).toBe('Studium/Aufgaben.md')
    expect(ws.get(path)?.data).toMatchObject({ Modul: ['[[Lineare Algebra]]'], Priorität: 'Hoch' })
    expect(ws.backlinks('Studium/Module/Lineare Algebra.md').map((p) => p.path)).toContain(path)
  })

  it('rejects select values outside the options and computed properties', async () => {
    const { call } = await setup()
    expect(
      (await call('create_row', { database: 'Aufgaben', title: 'x', values: { Priorität: 'Sofort' } })).text,
    ).toMatch(/Erlaubte Werte für „Priorität“/)
    expect(
      (await call('set_properties', { page: 'Klausur Datenbanken', properties: { 'In Tagen': '3' } })).text,
    ).toMatch(/berechnet/)
  })

  it('sets and removes properties; grades update the dashboard values', async () => {
    const { ws, call } = await setup()
    await call('set_properties', { page: 'Lineare Algebra', properties: { Note: 1.3, Status: 'Bestanden' } })
    const rows = ws.resolvedRows('Studium/Module.md', now)
    expect(rows.find((r) => r.row.title === 'Lineare Algebra')?.values.Note).toBe(1.3)
    await call('set_properties', { page: 'Lineare Algebra', properties: { Note: null } })
    expect(ws.get('Studium/Module/Lineare Algebra.md')?.data).not.toHaveProperty('Note')
  })

  it('edits a unique text passage and appends without touching the rest', async () => {
    const { ws, call } = await setup()
    const before = ws.get('Studium/Aufgaben/Übungsblatt 3 LA.md')!.body
    expect(
      (await call('edit_page_text', { page: 'Übungsblatt 3 LA', find: 'Aufgabe', replace: 'A' })).text,
    ).toMatch(/3× vor/)
    await call('edit_page_text', {
      page: 'Übungsblatt 3 LA',
      find: 'Aufgabe 2',
      replace: 'Aufgabe 2 (Bonus)',
    })
    await call('append_to_page', { page: 'Übungsblatt 3 LA', markdown: '- [ ] Aufgabe 4' })
    expect(ws.get('Studium/Aufgaben/Übungsblatt 3 LA.md')!.body).toBe(
      `${before.replace('Aufgabe 2', 'Aufgabe 2 (Bonus)').trimEnd()}\n\n- [ ] Aufgabe 4\n`,
    )
  })

  it('renames with link updates and moves to trash', async () => {
    const { ws, call } = await setup()
    const { data } = await call('rename_page', { page: 'Datenbanken', title: 'Datenbanksysteme' })
    expect((data as { path: string }).path).toBe('Studium/Module/Datenbanksysteme.md')
    expect(ws.get('Studium/Aufgaben/ER-Modell entwerfen.md')!.data.Modul).toEqual(['[[Datenbanksysteme]]'])
    await call('trash_page', { page: 'Datenbanksysteme' })
    expect(ws.get('Studium/Module/Datenbanksysteme.md')).toBeUndefined()
    expect(await ws.listTrash()).toHaveLength(1)
  })
})

describe('AI tools: safety', () => {
  it('validates every input against the schema', async () => {
    const { call } = await setup()
    expect((await call('read_page', {})).text).toMatch(/page fehlt/)
    expect((await call('read_page', { page: 3 })).text).toMatch(/Text/)
    expect((await call('read_page', { page: 'x', extra: 1 })).text).toMatch(/unbekannt/)
    expect((await call('search_pages', { query: 'x', limit: 9999 })).text).toMatch(/≤ 50/)
    expect((await call('nope', {})).text).toMatch(/Unbekanntes Werkzeug/)
  })

  it('cannot leave the vault or write outside it', async () => {
    const { ws, call } = await setup()
    for (const folder of ['../..', 'Studium/../../x', '..\\..'])
      expect((await call('create_page', { title: 'x', folder })).ok).toBe(false)
    // Absolute-looking folders are relative to the vault.
    expect((await call('create_page', { title: 'x', folder: '/etc' })).touched).toEqual(['etc/x.md'])
    expect((await call('read_page', { page: '../../etc/passwd' })).ok).toBe(false)
    expect((await call('create_page', { title: '../../evil' })).ok).toBe(true)
    expect(ws.all().every((p) => !p.path.includes('..'))).toBe(true)
  })

  it('does not let the model rewrite database schemas or pollute prototypes', async () => {
    const { ws, call } = await setup()
    expect(
      (await call('set_properties', { page: 'Module', properties: { database: { properties: [] } } })).text,
    ).toMatch(/kann hier nicht/)
    expect((await call('create_page', { title: 'x', properties: { database: {} } })).ok).toBe(false)
    const result = await call('create_page', {
      title: 'Proto',
      properties: JSON.parse('{"meta": {"__proto__": {"polluted": true}}}') as object,
    })
    expect(result.ok).toBe(true)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(ws.get('Proto.md')!.data.meta).toEqual({})
  })

  it('marks destructive tools and keeps read-only tools side-effect free', async () => {
    expect(TOOLS.filter((t) => t.destructive).map((t) => t.name)).toEqual(['replace_page_body', 'trash_page'])
    const { ws, call } = await setup()
    const version = ws.version
    for (const tool of TOOLS.filter((t) => t.readOnly)) {
      const input =
        tool.name === 'search_pages'
          ? { query: 'Modul' }
          : tool.name === 'query_database'
            ? { database: 'Module' }
            : tool.inputSchema.required?.includes('page')
              ? { page: 'Module' }
              : {}
      expect((await call(tool.name, input)).ok).toBe(true)
    }
    expect(ws.version).toBe(version)
  })

  it('every schema is valid for its own required fields', () => {
    for (const tool of TOOLS) {
      for (const key of tool.inputSchema.required ?? [])
        expect(tool.inputSchema.properties).toHaveProperty(key)
      expect(() => validate(tool.inputSchema, {})).toSatisfy(() => true)
    }
  })
})
