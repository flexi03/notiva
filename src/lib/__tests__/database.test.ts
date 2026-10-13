import {
  aggregate,
  applyFilters,
  applySorts,
  formatValue,
  groupRows,
  NO_VALUE,
  parseDatabaseDef,
  relationTargets,
  rowValues,
  toStoredValue,
  type DatabaseDef,
  type ResolvedRow,
  type Row,
} from '../database'

const def = parseDatabaseDef({
  properties: [
    {
      name: 'Status',
      type: 'select',
      options: ['Geplant', 'Laufend', { value: 'Bestanden', color: 'green' }],
    },
    { name: 'ECTS', type: 'number' },
    { name: 'Note', type: 'number', decimals: 1 },
    { name: 'Semester', type: 'number' },
    { name: 'Tags', type: 'multiSelect' },
    { name: 'Prüfung', type: 'date' },
    { name: 'Pflicht', type: 'checkbox' },
    { name: 'Gewichtet', type: 'formula', formula: 'ECTS * Note' },
  ],
  views: [{ name: 'Alle', type: 'table', sort: [{ property: 'Semester', direction: 'desc' }] }],
})!

const row = (title: string, data: Row['data']): Row => ({
  path: `Module/${title}.md`,
  title,
  data,
  body: '',
  mtime: 0,
})
const rows: ResolvedRow[] = [
  row('Analysis', {
    Status: 'Bestanden',
    ECTS: 9,
    Note: 1.7,
    Semester: 1,
    Tags: ['mathe'],
    Prüfung: '2026-02-10',
    Pflicht: true,
  }),
  row('Programmieren', {
    Status: 'Bestanden',
    ECTS: 6,
    Note: 2.3,
    Semester: 1,
    Tags: ['info'],
    Pflicht: true,
  }),
  row('Datenbanken', {
    Status: 'Laufend',
    ECTS: 6,
    Semester: 3,
    Tags: ['info', 'pflicht'],
    Prüfung: '2026-10-20',
  }),
  row('Wahlfach', { ECTS: 3, Semester: 2 }),
].map((r) => ({ row: r, values: rowValues(r, def) }))

describe('parseDatabaseDef', () => {
  it('normalizes options and assigns colors', () => {
    expect(def.properties[0]!.options).toEqual([
      { value: 'Geplant', color: 'gray' },
      { value: 'Laufend', color: 'brown' },
      { value: 'Bestanden', color: 'green' },
    ])
  })

  it('ignores invalid input safely', () => {
    expect(parseDatabaseDef('nope')).toBeNull()
    const parsed = parseDatabaseDef({
      properties: [{ name: 'A', type: 'evil' }, { name: 'a' }, { type: 'text' }, 'x', { name: 'Name' }],
      views: [{ type: 'unknown' }, null],
    })!
    expect(parsed.properties).toEqual([{ name: 'A', type: 'text' }])
    expect(parsed.views).toEqual([{ name: 'Ansicht 1', type: 'table' }])
  })

  it('adds a default table view', () => {
    expect(parseDatabaseDef({})!.views).toEqual([{ name: 'Tabelle', type: 'table' }])
  })
})

describe('rowValues', () => {
  it('coerces values and evaluates formulas', () => {
    const v = rows[0]!.values
    expect(v).toMatchObject({ Name: 'Analysis', ECTS: 9, Pflicht: true, Tags: ['mathe'] })
    expect(v.Gewichtet).toBeCloseTo(15.3)
    expect(rows[3]!.values).toMatchObject({ Status: null, Tags: [], Pflicht: false, Prüfung: null })
  })

  it('evaluates rollups through relations', () => {
    const semesters: DatabaseDef = parseDatabaseDef({
      properties: [
        { name: 'Module', type: 'relation', database: 'Module.md' },
        { name: 'ECTS', type: 'rollup', relation: 'Module', property: 'ECTS', aggregation: 'sum' },
        { name: 'Schnitt', type: 'rollup', relation: 'Module', property: 'Note', aggregation: 'avg' },
      ],
    })!
    const semester = row('WS 25', { Module: ['[[Analysis]]', '[[Programmieren]]', '[[Fehlt]]'] })
    const byTitle = new Map(rows.map((r) => [r.row.title, r.row]))
    const values = rowValues(semester, semesters, {
      resolveRow: (link) => (byTitle.has(link) ? { row: byTitle.get(link)!, def } : null),
    })
    expect(values.ECTS).toBe(15)
    expect(values.Schnitt).toBe(2)
  })
})

describe('filters', () => {
  const names = (list: ResolvedRow[]) => list.map((r) => r.row.title)
  it.each([
    [{ property: 'Status', op: 'eq', value: 'Bestanden' }, ['Analysis', 'Programmieren']],
    [{ property: 'Status', op: 'eq', value: ['Laufend', 'Geplant'] }, ['Datenbanken']],
    [{ property: 'Status', op: 'neq', value: 'Bestanden' }, ['Datenbanken', 'Wahlfach']],
    [{ property: 'Status', op: 'empty' }, ['Wahlfach']],
    [{ property: 'ECTS', op: 'gte', value: 6 }, ['Analysis', 'Programmieren', 'Datenbanken']],
    [{ property: 'Note', op: 'lt', value: 2 }, ['Analysis']],
    [{ property: 'Tags', op: 'contains', value: 'info' }, ['Programmieren', 'Datenbanken']],
    [{ property: 'Pflicht', op: 'checked' }, ['Analysis', 'Programmieren']],
    [{ property: 'Prüfung', op: 'after', value: '2026-06-01' }, ['Datenbanken']],
    [{ property: 'Prüfung', op: 'nextDays', value: 7 }, ['Datenbanken']],
    [{ property: 'Name', op: 'contains', value: 'bank' }, ['Datenbanken']],
  ] as const)('%j', (filter, expected) => {
    expect(names(applyFilters(rows, [filter as never], def, new Date(2026, 9, 14)))).toEqual(expected)
  })
})

describe('sorting', () => {
  it('sorts by several properties, empty values last', () => {
    const sorted = applySorts(
      rows,
      [
        { property: 'Note', direction: 'desc' },
        { property: 'Name', direction: 'asc' },
      ],
      def,
    )
    expect(sorted.map((r) => r.row.title)).toEqual(['Programmieren', 'Analysis', 'Datenbanken', 'Wahlfach'])
  })

  it('defaults to the title', () => {
    expect(applySorts(rows, undefined, def).map((r) => r.row.title)).toEqual([
      'Analysis',
      'Datenbanken',
      'Programmieren',
      'Wahlfach',
    ])
  })
})

describe('grouping', () => {
  it('keeps option order and puts empty values last', () => {
    const groups = groupRows(rows, 'Status', def)
    expect(groups.map((g) => [g.key, g.rows.length])).toEqual([
      ['Geplant', 0],
      ['Laufend', 1],
      ['Bestanden', 2],
      [NO_VALUE, 1],
    ])
  })

  it('puts multi-select rows in every group', () => {
    const groups = groupRows(rows, 'Tags', def)
    expect(groups.find((g) => g.key === 'info')!.rows).toHaveLength(2)
  })
})

describe('aggregate', () => {
  const values = rows.map((r) => r.values)
  it.each([
    ['count', 'Name', undefined, 4],
    ['countEmpty', 'Note', undefined, 2],
    ['countNotEmpty', 'Note', undefined, 2],
    ['sum', 'ECTS', undefined, 24],
    ['avg', 'Note', undefined, 2],
    ['min', 'Note', undefined, 1.7],
    ['max', 'Semester', undefined, 3],
    ['weightedAvg', 'Note', 'ECTS', 1.94],
    ['percentChecked', 'Pflicht', undefined, 50],
    ['earliest', 'Prüfung', undefined, '2026-02-10'],
    ['latest', 'Prüfung', undefined, '2026-10-20'],
  ] as const)('%s(%s) = %j', (fn, prop, weight, expected) => {
    expect(aggregate(values, fn, prop, weight)).toEqual(expected)
  })

  it('returns null for averages without data', () => {
    expect(aggregate([], 'avg', 'Note')).toBeNull()
    expect(aggregate([], 'weightedAvg', 'Note', 'ECTS')).toBeNull()
  })
})

describe('formatting and storing', () => {
  it('formats numbers, dates and lists', () => {
    expect(formatValue(def.properties[2], 1.7)).toBe('1,7')
    expect(formatValue({ name: 'x', type: 'number', format: 'euro' }, 12.5)).toMatch(/12,50\s€/)
    expect(formatValue({ name: 'x', type: 'date' }, '2026-10-14')).toBe('14.10.2026')
    expect(formatValue(undefined, ['a', 'b'])).toBe('a, b')
  })

  it('converts input back to stored values', () => {
    expect(toStoredValue({ name: 'x', type: 'number' }, '1,5')).toBe(1.5)
    expect(toStoredValue({ name: 'x', type: 'relation' }, ['Analysis'])).toEqual(['[[Analysis]]'])
    expect(relationTargets(['[[Analysis|A]]', 'Plain'])).toEqual(['Analysis', 'Plain'])
  })
})
