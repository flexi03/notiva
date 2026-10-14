import { installPack, studyPack } from '../packs'
import { MemoryVault } from '../vault'
import { Workspace } from '../workspace'
import { runTool, TOOLS } from '../ai/tools'
import { validate } from '../ai/schema'
import { MODULHANDBUCH_PDF } from '@/test/fixtures/pdf'
import type { MoodleSnapshot } from '../moodle'

const now = new Date(2026, 9, 14, 10)

const MOODLE: MoodleSnapshot = {
  site: 'https://moodle.example.org',
  source: 'webservice',
  fetchedAt: now.toISOString(),
  courses: [{ id: 'course:43', name: 'Betriebssysteme' }],
  events: [
    {
      id: 'event:1',
      title: 'Shell-Projekt',
      due: '2026-10-28T10:00:00.000Z',
      course: { id: 'course:43', name: 'Betriebssysteme' },
      kind: 'assign',
    },
    { id: 'event:2', title: 'Alt', due: '2026-09-01T10:00:00.000Z', kind: 'assign' },
  ],
  grades: [{ course: 'Betriebssysteme', grade: '1,3' }],
}

async function setup(moodle: MoodleSnapshot | null = MOODLE) {
  const ws = await Workspace.open(new MemoryVault())
  await installPack(ws, studyPack, {}, '', now)
  const call = async (name: string, input: unknown) => {
    const outcome = await runTool({ ws, now, moodle: async () => moodle }, name, input)
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
    expect(TOOLS.filter((t) => t.destructive).map((t) => t.name)).toEqual([
      'replace_page_body',
      'remove_widget',
      'trash_page',
    ])
    const { ws, call } = await setup()
    await ws.writeFile('notiz.txt', 'Text')
    const version = ws.version
    for (const tool of TOOLS.filter((t) => t.readOnly)) {
      const input =
        tool.name === 'read_file'
          ? { path: 'notiz.txt' }
          : tool.name === 'search_pages'
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

describe('AI tools: dashboard and files', () => {
  it('explains the formats', async () => {
    const { call } = await setup()
    const guide = (await call('notiva_format', {})).data as { guide: string }
    expect(guide.guide).toContain('weightedAvg')
    expect(guide.guide).toContain('countdown')
  })

  it('lists and replaces a widget without touching the rest of the page', async () => {
    const { ws, call } = await setup()
    const list = (await call('list_widgets', { page: 'Studium' })).data as {
      widgets: Array<{ index: number; type: string; yaml: string; tiles?: number }>
    }
    expect(list.widgets[0]).toMatchObject({ index: 0, type: 'tiles', tiles: 11 })
    const before = ws.get('Studium.md')!.body
    const yaml = list.widgets[0]!.yaml.replace('columns: 4', 'columns: 3')
    const result = await call('update_widget', { page: 'Studium', index: 0, yaml })
    expect(result.ok).toBe(true)
    const after = ws.get('Studium.md')!.body
    expect(after).toBe(before.replace('columns: 4', 'columns: 3'))
  })

  it('rejects widgets the dashboard could not show', async () => {
    const { ws, call } = await setup()
    const before = ws.get('Studium.md')!.body
    const bad = await call('update_widget', {
      page: 'Studium',
      index: -1,
      yaml: 'type: tiles\ntiles:\n  - { type: stat, source: Studium/Gibtsnicht }\n  - { type: chart }\n  - { type: stat, source: Studium/Module, property: Farbe }',
    })
    expect(bad.ok).toBe(false)
    expect(bad.text).toContain('Gibtsnicht')
    expect(bad.text).toContain('unbekanntem')
    expect(bad.text).toContain('Farbe')
    const view = await call('update_widget', {
      page: 'Studium',
      index: -1,
      yaml: 'type: view\nsource: Studium/Module\nview: Gibtsnicht',
    })
    expect(view.text).toContain('vorhanden: Board')
    expect(ws.get('Studium.md')!.body).toBe(before)
  })

  it('appends and removes widgets', async () => {
    const { ws, call } = await setup()
    const count = () => (ws.get('Studium.md')!.body.match(/```notiva/g) ?? []).length
    const n = count()
    const add = await call('update_widget', {
      page: 'Studium',
      index: -1,
      yaml: 'type: tiles\ntiles:\n  - { type: countdown, title: Nächste Abgabe, source: Studium/Aufgaben, dateProperty: Fällig }',
    })
    expect(add.ok).toBe(true)
    expect(count()).toBe(n + 1)
    expect(await call('remove_widget', { page: 'Studium', index: n })).toMatchObject({ ok: true })
    expect(count()).toBe(n)
  })

  it('extends a database with properties, options and views', async () => {
    const { ws, call } = await setup()
    const result = await call('update_database', {
      database: 'Studium/Module',
      add_properties: [
        { name: 'Moodle', type: 'url' },
        { name: 'Schwerpunkt', type: 'select', options: ['KI', 'Web'] },
      ],
      add_options: [{ property: 'Prüfungsform', values: ['Portfolio', 'Klausur'] }],
      add_views: [{ name: 'Nach Schwerpunkt', type: 'board', groupBy: 'Schwerpunkt' }],
    })
    expect(result.ok).toBe(true)
    const def = ws.get('Studium/Module.md')!.database!
    expect(def.properties.find((p) => p.name === 'Moodle')?.type).toBe('url')
    expect(def.properties.find((p) => p.name === 'Prüfungsform')?.options?.map((o) => o.value)).toContain(
      'Portfolio',
    )
    expect(def.views.map((v) => v.name)).toContain('Nach Schwerpunkt')
    // Nothing existing is lost.
    expect(def.properties.find((p) => p.name === 'Note')).toBeTruthy()
    expect(
      (
        await call('update_database', {
          database: 'Studium/Module',
          add_properties: [{ name: 'ECTS', type: 'text' }],
        })
      ).text,
    ).toContain('gibt es schon')
    expect(
      (
        await call('update_database', {
          database: 'Studium/Module',
          add_views: [{ name: 'X', type: 'board' }],
        })
      ).text,
    ).toContain('groupBy')
  })

  it('reads PDFs and text files from the folder', async () => {
    const { ws, call } = await setup()
    await ws.writeFile('Unterlagen/Modulhandbuch.pdf', MODULHANDBUCH_PDF)
    await ws.writeFile('Unterlagen/noten.csv', 'Modul;Note\nAnalysis;1,7\n')
    await ws.writeFile('Unterlagen/foto.png', new Uint8Array([137, 80, 78, 71]))
    const files = (await call('list_files', { folder: 'Unterlagen' })).data as {
      files: Array<{ path: string; readable: boolean }>
    }
    expect(files.files.map((f) => [f.path, f.readable])).toEqual([
      ['Unterlagen/Modulhandbuch.pdf', true],
      ['Unterlagen/noten.csv', true],
      ['Unterlagen/foto.png', false],
    ])
    const pdf = (await call('read_file', { path: 'Unterlagen/Modulhandbuch.pdf' })).data as {
      text: string
      pages: number
    }
    expect(pdf.text).toContain('Analysis 9 ECTS')
    expect(
      ((await call('read_file', { path: 'Unterlagen/noten.csv' })).data as { text: string }).text,
    ).toContain('1,7')
    expect((await call('read_file', { path: 'Unterlagen/foto.png' })).ok).toBe(false)
    expect((await call('read_file', { path: '../etc/passwd' })).ok).toBe(false)
  })
})

describe('AI tools: labels', () => {
  it('every tool has a label in the chat (de + en)', async () => {
    const { de } = await import('@/i18n/de')
    const { en } = await import('@/i18n/en')
    for (const tool of TOOLS) {
      expect(Object.keys(de)).toContain(`ai.tool.${tool.name}`)
      expect(Object.keys(en)).toContain(`ai.tool.${tool.name}`)
      if (tool.destructive) expect(Object.keys(de)).toContain(`ai.confirm.${tool.name}`)
    }
  })
})

describe('AI tools: Moodle', () => {
  it('shows upcoming deadlines and grades', async () => {
    const { call } = await setup()
    const data = (await call('moodle_overview', {})).data as {
      deadlines: Array<{ title: string }>
      grades: unknown[]
    }
    expect(data.deadlines.map((d) => d.title)).toEqual(['Shell-Projekt'])
    expect(data.grades).toHaveLength(1)
  })

  it('imports into the dashboard and links the new pages', async () => {
    const { ws, call } = await setup()
    const result = await call('import_moodle', {})
    expect(result.data).toMatchObject({ folder: 'Studium', created: ['Betriebssysteme', 'Shell-Projekt'] })
    expect(result.touched).toHaveLength(2)
    expect(ws.rows('Studium/Aufgaben.md').find((r) => r.title === 'Shell-Projekt')!.data.Modul).toEqual([
      '[[Betriebssysteme]]',
    ])
    expect(((await call('import_moodle', {})).data as { created: string[] }).created).toEqual([])
  })

  it('tells the model when Moodle is not connected', async () => {
    const { call } = await setup(null)
    expect((await call('moodle_overview', {})).text).toContain('Einstellungen → Moodle')
  })
})
