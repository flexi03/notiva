import { installPack, studyPack } from '../packs'
import { MemoryVault } from '../vault'
import { Workspace } from '../workspace'
import { applyMoodleImport } from '../moodle'
import {
  examNews,
  extractTables,
  finalResults,
  matchModule,
  moduleResults,
  normalizeStatus,
  parseResults,
  planExamImport,
  resultSummary,
  snapshotRecords,
} from '../ecampus'
import { QIS_MODULES_HTML, QIS_RESULTS_HTML } from '@/test/fixtures/qis'

const now = new Date(2026, 9, 14, 10)

function tables() {
  const doc = new DOMParser().parseFromString(QIS_RESULTS_HTML, 'text/html')
  return extractTables(doc)
}

describe('eCampus modules and attempts', () => {
  const read = () =>
    parseResults(extractTables(new DOMParser().parseFromString(QIS_MODULES_HTML, 'text/html')))

  it('tells sum rows, module rows and attempts apart', () => {
    const records = read()
    expect(records.find((r) => r.number === '10')).toMatchObject({ level: 'account', credits: 20 })
    expect(records.find((r) => r.number === '3350')).toMatchObject({
      level: 'module',
      status: 'passed',
      credits: 5,
    })
    expect(records.find((r) => r.number === '3350')!.semester).toBeUndefined()
    expect(records.find((r) => r.number === '3230')).toMatchObject({ level: 'module', status: 'other' })
    expect(records.filter((r) => r.level === 'exam')).toHaveLength(8)
  })

  it('collects the attempts per module', () => {
    const results = moduleResults(read())
    expect(results.map((r) => r.number)).toEqual(['3010', '3070', '3120', '3230', '3350'])
    const ra = results.find((r) => r.number === '3350')!
    expect(ra).toMatchObject({ status: 'passed', grade: 2.7, credits: 5, semester: 'WiSe 25/26', tries: 2 })
    expect(ra.attempts.map((a) => a.attempt)).toEqual([1, 2])
    expect(results.find((r) => r.number === '3070')).toMatchObject({
      status: 'failed',
      tries: 2,
      failedTries: 2,
      semester: 'WiSe 25/26',
    })
    expect(results.find((r) => r.number === '3230')).toMatchObject({ status: 'failed', tries: 1 })
    expect(results.find((r) => r.number === '3010')).toMatchObject({ grade: 3.3, semester: 'SoSe 25' })
    expect(resultSummary(results)).toMatchObject({ credits: 15, passed: 3 })
    expect(resultSummary(results).average).toBeCloseTo((3.3 + 1.3 + 2.7) / 3)
  })

  it('reads stored tables again with the current parser', () => {
    const tables = extractTables(new DOMParser().parseFromString(QIS_MODULES_HTML, 'text/html'))
    const records = snapshotRecords({ site: 'x', fetchedAt: '', records: [], tables })
    expect(records.length).toBe(11)
  })

  it('aligns cells that span several columns', () => {
    const html = `<table><tr><th>Nr</th><th>Prüfungstext</th><th>Semester</th><th>Note</th><th>Status</th></tr>
      <tr><td colspan="5">Pflichtbereich</td></tr>
      <tr><td>1</td><td colspan="2">Statistik</td><td>2,0</td><td>bestanden</td></tr></table>`
    const [table] = extractTables(new DOMParser().parseFromString(html, 'text/html'))
    expect(table!.rows[1]).toEqual(['1', 'Statistik', '', '2,0', 'bestanden'])
    expect(parseResults([table!])[0]).toMatchObject({ title: 'Statistik', grade: 2, group: 'Pflichtbereich' })
  })
})

describe('eCampus results', () => {
  it('finds only the results table', () => {
    const found = tables()
    expect(found).toHaveLength(1)
    expect(found[0]!.headers).toContain('Prüfungstext')
  })

  it('reads records, groups and statuses', () => {
    const records = parseResults(tables())
    expect(records.map((r) => [r.title, r.status, r.grade, r.attempt])).toEqual([
      ['Mathematik 1', 'passed', 2.3, 1],
      ['Programmierung 1', 'failed', 5, 1],
      ['Programmierung 1', 'passed', 1.7, 2],
      ['Datenbanken', 'registered', undefined, 1],
      ['Lineare Algebra', 'passed', 1.3, 1],
    ])
    expect(records[0]).toMatchObject({
      number: '1010',
      credits: 5,
      date: '2025-02-03',
      group: 'Grundlagen der Informatik',
    })
    expect(records[3]!.group).toBe('Vertiefung')
    expect(normalizeStatus('endgültig nicht bestanden')).toBe('failedFinal')
    expect(normalizeStatus('', 2.0)).toBe('passed')
  })

  it('takes the passed attempt as final result', () => {
    const final = finalResults(parseResults(tables()))
    expect(final.find((r) => r.number === '1020')).toMatchObject({ grade: 1.7, attempt: 2 })
    expect(final.some((r) => r.status === 'registered')).toBe(false)
  })

  it('matches module names loosely', () => {
    const modules = [
      { path: 'a', title: 'Lineare Algebra' },
      { path: 'b', title: 'Datenbanken WS 25/26' },
    ]
    expect(matchModule('Lineare Algebra', modules)).toBe('a')
    expect(matchModule('Datenbanken', modules)).toBe('b')
    expect(matchModule('Analysis', modules)).toBeUndefined()
  })

  it('plans grades and status into the module database', async () => {
    const ws = await Workspace.open(new MemoryVault())
    await installPack(ws, studyPack, {}, '', now)
    const plan = planExamImport(ws, parseResults(tables()), 'Studium/Module.md')
    const la = plan.find((p) => p.title === 'Lineare Algebra')!
    expect(la).toMatchObject({ kind: 'update', changes: { Status: 'Bestanden', Note: 1.3 } })
    expect(plan.find((p) => p.title === 'Mathematik 1')).toMatchObject({
      kind: 'create',
      values: { Status: 'Bestanden', Note: 2.3, ECTS: 5 },
    })
    await applyMoodleImport(ws, plan)
    expect(planExamImport(ws, parseResults(tables()), 'Studium/Module.md')).toEqual([])
  })

  it('reports new and changed results', () => {
    const records = parseResults(tables())
    const before = { site: 'x', fetchedAt: '', records }
    const after = {
      ...before,
      records: records.map((r) =>
        r.title === 'Datenbanken'
          ? { ...r, status: 'passed' as const, statusText: 'bestanden', grade: 2, gradeText: '2,0' }
          : r,
      ),
    }
    expect(examNews(null, before, now)).toEqual([])
    const news = examNews(before, after, now)
    expect(news).toHaveLength(1)
    expect(news[0]).toMatchObject({ kind: 'grade', title: 'Datenbanken', course: 'Prüfungsergebnis' })
    expect(news[0]!.body).toContain('angemeldet')
    expect(news[0]!.body).toContain('Note 2,0')
  })
})

describe('finding the way to the results', () => {
  it('reads the login state and links of a page', async () => {
    const { pageState, extractTables } = await import('../ecampus')
    const doc = new DOMParser().parseFromString(
      '<a href="https://e.example/rds?state=user&type=4">Abmelden</a><a href="https://e.example/rds?state=notenspiegelStudent&asi=X">Notenspiegel</a>',
      'text/html',
    )
    const state = pageState(doc, extractTables)
    expect(state).toMatchObject({ loggedIn: true, loginPage: false, tables: [] })
    expect(state.links).toHaveLength(2)
    const login = new DOMParser().parseFromString(
      '<form><input name="asdf"><input type="password" name="fdsa"></form>',
      'text/html',
    )
    expect(pageState(login, extractTables)).toMatchObject({ loggedIn: false, loginPage: true })
  })

  it('walks QIS: Notenspiegel, then the degree', async () => {
    const { pickResultsLink } = await import('../ecampus')
    const menu = [
      { text: 'Info über angemeldete Prüfungen', title: '', href: 'https://e/rds?state=a' },
      { text: 'Notenspiegel', title: '', href: 'https://e/rds?state=notenspiegelStudent&next=tree.vm&asi=1' },
      { text: 'Abmelden', title: '', href: 'https://e/rds?state=user&type=4' },
    ]
    expect(pickResultsLink(menu, new Set())?.text).toBe('Notenspiegel')
    const tree = [
      {
        text: 'Abschluss 84 Bachelor',
        title: '',
        href: 'https://e/rds?state=notenspiegelStudent&next=tree.vm&expand=1',
      },
      {
        text: '',
        title: 'Leistungen für Abschluss 84 Bachelor anzeigen',
        href: 'https://e/rds?state=notenspiegelStudent&next=list.vm&asi=1',
      },
    ]
    expect(pickResultsLink(tree, new Set())?.title).toContain('anzeigen')
    expect(pickResultsLink([{ text: 'Startseite', title: '', href: 'https://e/' }], new Set())).toBeNull()
  })

  it('moves a remembered results URL into the current session', async () => {
    const { withSessionAsi } = await import('../ecampus')
    expect(
      withSessionAsi(
        'https://e/qisserver/rds?state=notenspiegelStudent&next=list.vm&nodeID=x&asi=OLD',
        'https://e/qisserver/rds?state=change&asi=NEW',
      ),
    ).toBe('https://e/qisserver/rds?state=notenspiegelStudent&next=list.vm&nodeID=x&asi=NEW')
    expect(withSessionAsi('https://e/a?asi=1', 'https://e/b')).toBeNull()
  })
})
