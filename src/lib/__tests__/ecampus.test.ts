import { installPack, studyPack } from '../packs'
import { MemoryVault } from '../vault'
import { Workspace } from '../workspace'
import { applyMoodleImport } from '../moodle'
import {
  examNews,
  extractTables,
  finalResults,
  matchModule,
  normalizeStatus,
  parseResults,
  planExamImport,
} from '../ecampus'
import { QIS_RESULTS_HTML } from '@/test/fixtures/qis'

const now = new Date(2026, 9, 14, 10)

function tables() {
  const doc = new DOMParser().parseFromString(QIS_RESULTS_HTML, 'text/html')
  return extractTables(doc)
}

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
