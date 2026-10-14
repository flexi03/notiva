import { installPack, studyPack, TEMPLATE_PACKS } from '../packs'
import { MemoryVault } from '../vault'
import { Workspace } from '../workspace'
import { computeTile, parseWidget, widgetSource, type TileResult, type TileSpec } from '../widgets'
import { blockType, splitBlocks } from '../blocks'

const now = new Date(2026, 9, 14, 10)

async function installed(packId = 'study') {
  const ws = await Workspace.open(new MemoryVault())
  const entry = await installPack(
    ws,
    TEMPLATE_PACKS.find((p) => p.id === packId)!,
    {},
    '',
    now,
  )
  return { ws, entry }
}

function dashboardTiles(ws: Workspace, entry: string): TileSpec[] {
  const block = splitBlocks(ws.get(entry)!.body).find((b) => blockType(b.text) === 'widget')!
  const { widget } = parseWidget(widgetSource(block.text))
  if (widget?.type !== 'tiles') throw new Error('no tiles')
  return widget.tiles
}

describe('template packs', () => {
  it.each(TEMPLATE_PACKS.map((p) => p.id))('%s installs without YAML errors', async (id) => {
    const { ws, entry } = await installed(id)
    expect(ws.get(entry)).toBeDefined()
    expect(
      ws
        .all()
        .filter((p) => p.error)
        .map((p) => `${p.path}: ${p.error}`),
    ).toEqual([])
    for (const db of ws.databases()) expect(db.database!.properties.length).toBeGreaterThan(0)
  })

  it('refuses to overwrite an existing installation', async () => {
    const { ws } = await installed()
    await expect(installPack(ws, studyPack, {}, '', now)).rejects.toThrow(/Exists/)
  })

  it('installs into a custom folder name', async () => {
    const ws = await Workspace.open(new MemoryVault())
    const entry = await installPack(ws, studyPack, { name: 'Master' }, 'Uni', now)
    expect(entry).toBe('Uni/Master.md')
    expect(ws.databases().map((d) => d.path)).toContain('Uni/Master/Module.md')
  })
})

describe('study dashboard works end to end', () => {
  it('creates five linked databases', async () => {
    const { ws } = await installed()
    expect(ws.databases().map((d) => d.title)).toEqual([
      'Aufgaben',
      'Module',
      'Prüfungen',
      'Semester',
      'Stundenplan',
    ])
  })

  it('computes every dashboard tile', async () => {
    const { ws, entry } = await installed()
    const results: Record<string, TileResult> = Object.fromEntries(
      dashboardTiles(ws, entry).map((t) => [t.title ?? t.page, computeTile(ws, t, entry, now)]),
    )
    expect(results['Vorlesungszeit']).toMatchObject({ kind: 'week', week: 4, total: 15 })
    expect(results['Notenschnitt']).toMatchObject({ kind: 'value', value: '2,06' })
    expect(results['ECTS']).toMatchObject({ kind: 'progress', value: 15, goal: 180, percent: 8 })
    expect(results['Nächste Prüfung']).toMatchObject({
      kind: 'countdown',
      days: 40,
      label: 'Klausur Lineare Algebra',
    })
    expect(results['Offene Aufgaben']).toMatchObject({ kind: 'value', value: '3' })
    expect(results['Diese Woche fällig']).toMatchObject({ kind: 'list', total: 2 })
    expect(results['Module laufend']).toMatchObject({ value: '3' })
    for (const r of Object.values(results)) expect(r.kind).not.toBe('error')
    expect(
      Object.values(results)
        .filter((r) => r.kind === 'link')
        .every((r) => r.kind === 'link' && r.path),
    ).toBe(true)
  })

  it('rolls up ECTS per semester through relations', async () => {
    const { ws } = await installed()
    const rows = ws.resolvedRows('Studium/Semester.md', now)
    expect(Object.fromEntries(rows.map((r) => [r.row.title, r.values.ECTS]))).toEqual({
      '1. Semester': 15,
      '2. Semester': 21,
    })
    expect(rows.find((r) => r.row.title === '1. Semester')!.values.Schnitt).toBe(2)
  })

  it('updates the grade average when a grade is entered', async () => {
    const { ws, entry } = await installed()
    await ws.setProperty('Studium/Module/Lineare Algebra.md', 'Note', 1.0)
    await ws.setProperty('Studium/Module/Lineare Algebra.md', 'Status', 'Bestanden')
    const tile = dashboardTiles(ws, entry).find((t) => t.title === 'Notenschnitt')!
    expect(computeTile(ws, tile, entry, now)).toMatchObject({ value: '1,66' })
  })

  it('computes exam countdown formula', async () => {
    const { ws } = await installed()
    const exam = ws
      .resolvedRows('Studium/Prüfungen.md', now)
      .find((r) => r.row.title === 'Klausur Datenbanken')!
    expect(exam.values['In Tagen']).toBe('47 Tage')
  })

  it('links modules back to semesters (backlinks)', async () => {
    const { ws } = await installed()
    expect(
      ws
        .backlinks('Studium/Module/Datenbanken.md')
        .map((p) => p.title)
        .sort(),
    ).toEqual(['2. Semester', 'DB Vorlesung', 'ER-Modell entwerfen', 'Klausur Datenbanken'])
  })

  it('keeps working after the study folder is renamed', async () => {
    const { ws, entry } = await installed()
    const renamed = await ws.rename(entry, 'Uni')
    const tiles = dashboardTiles(ws, renamed)
    expect(tiles.every((t) => computeTile(ws, t, renamed, now).kind !== 'error')).toBe(true)
    expect(ws.get('Uni/Module.md')!.database!.properties.find((p) => p.name === 'Semester')!.database).toBe(
      'Uni/Semester.md',
    )
    const semesters = ws.resolvedRows('Uni/Semester.md', now)
    expect(semesters.find((r) => r.row.title === '2. Semester')!.values.ECTS).toBe(21)
  })

  it('ships page templates', async () => {
    const { ws } = await installed()
    expect(
      ws
        .all()
        .filter((p) => p.data.template === true)
        .map((p) => p.title)
        .sort(),
    ).toEqual(['Lernzettel', 'Vorlesungsnotiz'])
  })
})

describe('widgets parsing', () => {
  it('reports errors for invalid widgets', () => {
    expect(parseWidget('type: [').error).toBeTruthy()
    expect(parseWidget('type: nope').error).toMatch(/Unbekannt/)
    expect(parseWidget('type: view').error).toMatch(/source/)
  })

  it('drops unknown tile types and bad values', () => {
    const { widget } = parseWidget(
      'type: tiles\ncolumns: 99\ntiles:\n  - { type: hack }\n  - { type: stat, goal: "x", aggregation: evil }',
    )
    expect(widget).toEqual({ type: 'tiles', columns: 6, tiles: [{ type: 'stat' }] })
  })

  it('reports missing databases as tile errors', async () => {
    const { ws } = await installed()
    expect(computeTile(ws, { type: 'stat', source: 'Gibt es nicht' })).toMatchObject({ kind: 'error' })
  })
})
