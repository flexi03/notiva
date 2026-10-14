/**
 * Brings the study folder up to date: one page per module of the PO (status, attempts, semesters),
 * one page per semester of study, one page per Moodle course. Pages are found again by keys in their
 * frontmatter (`modul`, `fachsemester`, `moodle`), so renaming them is fine. Only Notiva's fields
 * are written – notes, the body and properties the user added stay as they are. A status the user
 * set by hand is kept until the facts change (`statusAuto` remembers what Notiva wrote last).
 */
import { parseDatabaseDef, propertyDef, type DatabaseDef, type PropertyDef, type ViewDef } from '../database'
import type { FrontmatterData, FrontmatterValue } from '../frontmatter'
import { safeFileName } from '../moodle'
import { courseInfoMarkdown, lastChange, type CourseInfo } from '../moodleInfo'
import type { Workspace } from '../workspace'
import { parse } from 'yaml'
import { planModules } from './catalog'
import { matchModuleName } from './match'
import { MODULE_STATUS, type ModuleState, type StudyState } from './state'
import { addTerms, parseTerm, termIndex, termLabel, termRange, type Term } from './terms'

/** `studium:` in the dashboard page's frontmatter. */
export interface StudySetup {
  program: string
  /** First semester, e.g. "WiSe 24/25". */
  start: string
}

export function readStudySetup(data: FrontmatterData): StudySetup | null {
  const raw = data.studium
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, FrontmatterValue>
  const program = typeof r.programm === 'string' ? r.programm : typeof r.program === 'string' ? r.program : ''
  const start = typeof r.beginn === 'string' ? r.beginn : typeof r.start === 'string' ? r.start : ''
  if (!program || !parseTerm(start)) return null
  return { program, start }
}

export function setupData(setup: StudySetup): FrontmatterData {
  return { studium: { programm: setup.program, beginn: setup.start } }
}

/** The dashboard of a study folder: "Studium.md" next to "Studium/Module.md". */
export function findStudyDashboard(
  ws: Workspace,
): { path: string; folder: string; setup: StudySetup | null } | null {
  const pages = ws.all().filter((p) => readStudySetup(p.data))
  const page =
    pages[0] ?? ws.all().find((p) => p.path.endsWith('.md') && ws.has(`${p.path.slice(0, -3)}/Module.md`))
  if (!page) return null
  return { path: page.path, folder: page.path.slice(0, -3), setup: readStudySetup(page.data) }
}

/* ---------- schemas (also used by the study template) ---------- */

const STATUS_COLORS: Record<string, string> = {
  Geplant: 'gray',
  'In Vorlesung': 'blue',
  'Prüfung angemeldet': 'purple',
  Wiederholung: 'orange',
  Fehlt: 'red',
  Bestanden: 'green',
  'Endgültig nicht bestanden': 'brown',
}

export const MODULE_PROPERTIES = `
    - { name: Nr, type: text }
    - { name: Status, type: select, options: [${MODULE_STATUS.map((s) => `{ value: ${s}, color: ${STATUS_COLORS[s]} }`).join(', ')}] }
    - { name: Belegt, type: multiSelect }
    - { name: Fachsemester, type: number }
    - { name: ECTS, type: number }
    - { name: Note, type: number, decimals: 1 }
    - { name: Versuche, type: number }
    - { name: Verlauf, type: text }
    - { name: Bestanden im, type: text }
    - { name: Praktikum, type: select, options: [{ value: Offen, color: orange }, { value: Bestanden, color: green }, { value: Nicht nötig, color: gray }] }
    - { name: Art, type: select, options: [{ value: Pflicht, color: purple }, { value: Wahlpflicht, color: orange }, { value: Wahl, color: yellow }] }
    - { name: Bereich, type: select, options: [{ value: Informatik, color: orange }, { value: Digitale Medien, color: blue }, { value: Grundlagen & Querschnitt, color: green }, { value: Übergreifend, color: yellow }] }
    - { name: Prüfungsform, type: select, options: [Klausur, Portfolio, Projektprüfung, Mündlich, Hausarbeit, Testat] }
    - { name: Voraussetzung, type: text }
    - { name: Angebot, type: select, options: [{ value: WiSe, color: blue }, { value: SoSe, color: yellow }] }
    - { name: Lehrform, type: text }
    - { name: Dozent, type: text }
    - { name: Link, type: url }`

export const MODULE_VIEWS = `
    - { name: Dieses Semester, type: board, groupBy: Status, filter: [{ property: Belegt, op: contains, value: "@semester" }], properties: [Nr, Note, Versuche, Praktikum] }
    - { name: Nächstes Semester, type: table, filter: [{ property: Belegt, op: contains, value: "@nextSemester" }], sort: [{ property: Nr, direction: asc }], properties: [Status, Nr, Fachsemester, ECTS, Versuche, Praktikum, Angebot] }
    - { name: Studienverlauf, type: list, groupBy: Fachsemester, sort: [{ property: Nr, direction: asc }], properties: [Status, Note, Bestanden im, Versuche] }
    - { name: Offen, type: table, filter: [{ property: Status, op: neq, value: [Bestanden, Geplant] }], sort: [{ property: Fachsemester, direction: asc }], properties: [Status, Fachsemester, Versuche, Verlauf, Praktikum, Angebot] }
    - { name: Tabelle, type: table, sort: [{ property: Fachsemester, direction: asc }], properties: [Nr, Status, Fachsemester, ECTS, Note, Versuche, Verlauf, Bestanden im, Belegt, Praktikum, Art, Prüfungsform] }
    - { name: Board, type: board, groupBy: Status, properties: [Fachsemester, ECTS, Note] }`

export const MODULE_ROW_TEMPLATE = `\`\`\`notiva
type: related
\`\`\`

## Meine Notizen

-
`

export const COURSE_DB = (folder: string) => `---
icon: 🏫
database:
  properties:
    - { name: Modul, type: relation, database: "${folder}/Module.md" }
    - { name: Art, type: select, options: [{ value: Modul, color: blue }, { value: Orga, color: purple }, { value: Sonstiges, color: gray }] }
    - { name: Semester, type: text }
    - { name: Link, type: url }
    - { name: Geändert, type: date }
    - { name: Ordner, type: text }
  views:
    - { name: Alle, type: table, sort: [{ property: Art, direction: asc }], properties: [Modul, Art, Semester, Geändert, Link] }
    - { name: Nach Modul, type: list, groupBy: Modul, properties: [Semester, Geändert] }
---
Deine Moodle-Kurse. Notiva speichert Beschreibung und Abschnitte jedes Kurses hier und meldet, wenn sich etwas ändert. Eigene Notizen gehören auf die Modulseite.
`

function moduleDefPatch(def: DatabaseDef): DatabaseDef {
  const wanted = parse(`properties:${MODULE_PROPERTIES}\nviews:${MODULE_VIEWS}`) as {
    properties: unknown[]
    views: unknown[]
  }
  const target = parseDatabaseDef(wanted)!
  const properties: PropertyDef[] = def.properties.map((p) => {
    const t = target.properties.find((x) => x.name === p.name && x.type === p.type)
    if (!t?.options) return p
    const missing = t.options.filter((o) => !p.options?.some((x) => x.value === o.value))
    return missing.length ? { ...p, options: [...(p.options ?? []), ...missing] } : p
  })
  for (const p of target.properties) if (!properties.some((x) => x.name === p.name)) properties.push(p)
  const views: ViewDef[] = [...def.views]
  for (const v of target.views) if (!views.some((x) => x.name === v.name)) views.unshift(v)
  // The new semester views first.
  views.sort((a, b) => Number(b.name === 'Dieses Semester') - Number(a.name === 'Dieses Semester'))
  return {
    ...def,
    properties,
    views,
    rowTemplate: def.rowTemplate?.includes('type: related') ? def.rowTemplate : MODULE_ROW_TEMPLATE,
  }
}

/* ---------- the plan ---------- */

export interface StudyChange {
  kind: 'create' | 'update'
  what: 'module' | 'semester' | 'course' | 'schema'
  path?: string
  title: string
  /** Short description for the preview ("Status: Fehlt → Wiederholung"). */
  detail: string
}

const same = (a: FrontmatterValue | undefined, b: FrontmatterValue | undefined) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

const link = (ws: Workspace, path: string) => `[[${ws.linkText(path)}]]`

function moduleValues(state: StudyState, m: ModuleState): FrontmatterData {
  const { module, result } = m
  const v: FrontmatterData = {
    modul: module.nr,
    Nr: module.nr,
    Status: m.status,
    Belegt: m.terms.map(termLabel),
    ECTS: result?.credits ?? module.ects,
    Art: module.kind,
  }
  if (module.semester) v.Fachsemester = module.semester
  if (module.area) v.Bereich = module.area
  if (module.offered) v.Angebot = module.offered
  if (module.teaching) v.Lehrform = module.teaching
  if (module.exam) v.Prüfungsform = module.exam
  if (module.prerequisite) v.Voraussetzung = module.prerequisite
  if (result) {
    v.pruefung = `exam:${result.key}`
    v.Versuche = result.tries
    if (m.history) v.Verlauf = m.history
    if (result.status === 'passed') {
      if (result.grade !== undefined) v.Note = result.grade
      const term = parseTerm(result.semester)
      if (term) v['Bestanden im'] = termLabel(term)
    }
  }
  if (m.courses.length) v.kurse = m.courses.map((c) => c.id)
  // The course of this (or the latest) semester as link.
  const course =
    m.courses.find((c) => c.term && termIndex(c.term) === termIndex(state.current)) ??
    [...m.courses].sort((a, b) => (b.term ? termIndex(b.term) : 0) - (a.term ? termIndex(a.term) : 0))[0]
  if (course?.url) v.Link = course.url
  return v
}

/** Values to write into an existing module page (user's values win where they should). */
function moduleChanges(current: FrontmatterData, wanted: FrontmatterData): FrontmatterData {
  const changes: FrontmatterData = {}
  for (const [key, value] of Object.entries(wanted)) {
    if (key === 'Status') continue
    // Link and ECTS only fill gaps; the user may point to another course.
    if ((key === 'Link' || key === 'Dozent') && current[key]) continue
    if (!same(current[key], value)) changes[key] = value
  }
  // Status: set by Notiva unless the user chose another one since the last sync.
  const auto = current.statusAuto
  const userSet = current.Status && auto !== undefined && current.Status !== auto
  const legacy = current.Status === 'Laufend' || current.Status === 'Nicht bestanden'
  if (!userSet || legacy || wanted.Status === 'Bestanden') {
    if (!same(current.Status, wanted.Status)) changes.Status = wanted.Status!
    if (!same(auto, wanted.Status)) changes.statusAuto = wanted.Status!
  }
  // Practical/lab prerequisite: Notiva only suggests; once passed it is done.
  const prereq = typeof wanted.Voraussetzung === 'string' && wanted.Voraussetzung
  if (!current.Praktikum)
    changes.Praktikum = prereq ? (wanted.Status === 'Bestanden' ? 'Bestanden' : 'Offen') : 'Nicht nötig'
  else if (current.Praktikum === 'Offen' && wanted.Status === 'Bestanden') changes.Praktikum = 'Bestanden'
  return changes
}

export interface StudyPlan {
  changes: StudyChange[]
  apply: () => Promise<string[]>
}

/**
 * Compares the vault with the study state. `apply` writes it (pages first, so links resolve).
 * `folder` is the study folder ("Studium"), its databases are Module, Semester and Kurse.
 */
export function planStudySync(
  ws: Workspace,
  folder: string,
  state: StudyState,
  courseInfo: Record<string, CourseInfo> = {},
): StudyPlan {
  const changes: StudyChange[] = []
  const steps: Array<() => Promise<string | void>> = []
  const modulesDb = `${folder}/Module.md`
  const semesterDb = `${folder}/Semester.md`
  const coursesDb = `${folder}/Kurse.md`

  // Schemas
  const mdb = ws.get(modulesDb)?.database
  if (!mdb) return { changes: [], apply: () => Promise.resolve([]) }
  const patched = moduleDefPatch(mdb)
  if (JSON.stringify(patched) !== JSON.stringify(mdb)) {
    changes.push({
      kind: 'update',
      what: 'schema',
      path: modulesDb,
      title: 'Module',
      detail: 'Neue Eigenschaften und Ansichten',
    })
    steps.push(() => ws.updateDatabase(modulesDb, () => patched))
  }
  if (!ws.get(coursesDb)) {
    changes.push({ kind: 'create', what: 'schema', title: 'Kurse', detail: 'Datenbank für Moodle-Kurse' })
    steps.push(() => ws.writeFile(coursesDb, COURSE_DB(folder)).then(() => ws.reload()))
  }

  // Modules
  const rows = ws.rows(modulesDb)
  const used = new Set<string>()
  const pathOf = new Map<string, string>()
  const moduleRow = (m: ModuleState) => {
    const byKey = rows.find((r) => r.data.modul === m.module.nr)
    if (byKey) return byKey
    // Adopt a page made earlier by hand or by the Moodle import (same name).
    return rows.find(
      (r) =>
        !r.data.modul &&
        !used.has(r.path) &&
        (matchModuleName(r.title, state.program)?.module.nr === m.module.nr ||
          r.title.trim().toLowerCase() === m.module.name.toLowerCase()),
    )
  }
  for (const m of state.modules) {
    const wanted = moduleValues(state, m)
    const row = moduleRow(m)
    if (row) {
      used.add(row.path)
      pathOf.set(m.module.nr, row.path)
      const diff = moduleChanges(row.data, wanted)
      if (!Object.keys(diff).length) continue
      changes.push({
        kind: 'update',
        what: 'module',
        path: row.path,
        title: row.title,
        detail: Object.entries(diff)
          .filter(([k]) => /^[A-ZÄÖÜ]/.test(k) && k !== 'Belegt' && k !== 'Verlauf')
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
          .join(' · '),
      })
      steps.push(() => ws.save(row.path, { data: { ...ws.get(row.path)!.data, ...diff } }))
    } else {
      changes.push({
        kind: 'create',
        what: 'module',
        title: m.module.name,
        detail: `${m.module.nr} · ${m.status}`,
      })
      const values: FrontmatterData = { ...wanted, statusAuto: wanted.Status! }
      const prereq = wanted.Voraussetzung
      values.Praktikum = prereq ? (m.status === 'Bestanden' ? 'Bestanden' : 'Offen') : 'Nicht nötig'
      steps.push(async () => {
        const path = await ws.createRow(modulesDb, m.module.name, values)
        pathOf.set(m.module.nr, path)
        return path
      })
    }
  }

  // Semesters of study
  const sdb = ws.get(semesterDb)?.database
  if (sdb) {
    const srows = ws.rows(semesterDb)
    for (let n = 1; n <= state.program.semesters; n++) {
      const term = addTerms(state.start, n - 1)
      const label = termLabel(term)
      const range = termRange(term)
      const offset = termIndex(term) - termIndex(state.current)
      const planned = planModules(state.program)
        .filter((m) => m.semester === n)
        .reduce((s, m) => s + m.ects, 0)
      const earned = state.modules
        .filter(
          (m) =>
            m.status === 'Bestanden' &&
            m.result &&
            parseTerm(m.result.semester) &&
            termIndex(parseTerm(m.result.semester)!) === termIndex(term),
        )
        .reduce((s, m) => s + (m.result?.credits ?? m.module.ects), 0)
      const values: FrontmatterData = {
        fachsemester: n,
        Zeitraum: label,
        Status: offset < 0 ? 'Abgeschlossen' : offset === 0 ? 'Aktiv' : 'Geplant',
        Beginn: range.start,
        Ende: range.end,
        'ECTS Plan': planned,
        'ECTS erreicht': earned,
      }
      const title = `${n}. Semester`
      const row = srows.find((r) => r.data.fachsemester === n) ?? srows.find((r) => r.title === title)
      if (row) {
        const diff: FrontmatterData = {}
        for (const [k, v] of Object.entries(values)) if (!same(row.data[k], v)) diff[k] = v
        if (!Object.keys(diff).length) continue
        changes.push({
          kind: 'update',
          what: 'semester',
          path: row.path,
          title: row.title,
          detail: `${label}`,
        })
        steps.push(() => ws.save(row.path, { data: { ...ws.get(row.path)!.data, ...diff } }))
      } else {
        changes.push({ kind: 'create', what: 'semester', title, detail: label })
        steps.push(() =>
          ws.createPage({
            folder: ws.rowFolder(ws.get(semesterDb)!),
            title,
            data: values,
            body: semesterBody(folder, term),
          }),
        )
      }
    }
    const props = ['Zeitraum', 'ECTS Plan', 'ECTS erreicht'].filter((p) => !propertyDef(sdb, p))
    if (props.length)
      steps.unshift(() =>
        ws.updateDatabase(semesterDb, (def) => ({
          ...def,
          properties: [
            ...def.properties,
            ...props.map((name): PropertyDef => ({ name, type: name === 'Zeitraum' ? 'text' : 'number' })),
          ],
          views: def.views.map((v) =>
            v.properties
              ? {
                  ...v,
                  properties: [...new Set(['Zeitraum', ...v.properties, 'ECTS Plan', 'ECTS erreicht'])],
                }
              : v,
          ),
        })),
      )
  }

  // Moodle courses
  const courseRows = () => (ws.get(coursesDb) ? ws.rows(coursesDb) : [])
  const allCourses = [
    ...state.modules.flatMap((m) => m.courses.map((c) => ({ c, m, art: 'Modul' }))),
    ...state.orga.map((c) => ({ c, m: undefined, art: 'Orga' })),
    ...state.other.map((c) => ({ c, m: undefined, art: 'Sonstiges' })),
  ]
  const existing = new Map(courseRows().map((r) => [String(r.data.moodle), r]))
  const bodyFor = (id: string, previous: string) =>
    courseInfo[id] ? courseInfoMarkdown(courseInfo[id], previous) : null
  for (const { c, m } of allCourses) {
    const row = existing.get(c.id)
    if (!row)
      changes.push({ kind: 'create', what: 'course', title: c.name, detail: m ? m.module.name : 'Orga' })
    else {
      const body = bodyFor(c.id, row.body)
      if (body !== null && body !== row.body)
        changes.push({
          kind: 'update',
          what: 'course',
          path: row.path,
          title: row.title,
          detail: 'Infos aus Moodle',
        })
    }
  }
  steps.push(async () => {
    const known = new Map(courseRows().map((r) => [String(r.data.moodle), r]))
    for (const { c, m, art } of allCourses) {
      const modulePath = m ? pathOf.get(m.module.nr) : undefined
      const values: FrontmatterData = {
        moodle: c.id,
        Art: art,
        ...(c.term ? { Semester: termLabel(c.term) } : {}),
        ...(c.url ? { Link: c.url } : {}),
        ...(modulePath ? { Modul: [link(ws, modulePath)] } : {}),
        Ordner: `${folder}/Unterlagen/${safeFileName(c.name)}`,
      }
      const changed = courseInfo[c.id] ? lastChange(courseInfo[c.id]!) : undefined
      if (changed) values.Geändert = changed.slice(0, 10)
      const row = known.get(c.id)
      if (row) {
        const diff: FrontmatterData = {}
        for (const [k, v] of Object.entries(values)) if (!same(row.data[k], v)) diff[k] = v
        const body = bodyFor(c.id, row.body)
        if (Object.keys(diff).length || (body !== null && body !== row.body))
          await ws.save(row.path, {
            data: { ...row.data, ...diff },
            ...(body !== null ? { body } : {}),
          })
      } else {
        const path = await ws.createRow(coursesDb, c.name, values)
        const body = bodyFor(c.id, '')
        if (body !== null) await ws.save(path, { body })
      }
    }
  })

  return {
    changes,
    apply: async () => {
      const touched: string[] = []
      for (const step of steps) {
        const path = await step()
        if (typeof path === 'string') touched.push(path)
      }
      return touched
    },
  }
}

/** Overview page of one semester: its modules, exams and tasks. */
export function semesterBody(folder: string, term: Term): string {
  const label = termLabel(term)
  const range = termRange(term)
  return `Alles aus dem **${label}**. Module erscheinen hier, wenn sie in diesem Semester belegt, geplant oder wiederholt werden.

\`\`\`notiva
type: view
source: "${folder}/Module"
view: Tabelle
filter: [{ property: Belegt, op: contains, value: "${label}" }]
\`\`\`

## Prüfungen

\`\`\`notiva
type: view
source: "${folder}/Prüfungen"
view: Alle
filter: [{ property: Datum, op: after, value: "${range.start}" }, { property: Datum, op: before, value: "${range.end}" }]
\`\`\`

## Aufgaben

\`\`\`notiva
type: view
source: "${folder}/Aufgaben"
filter: [{ property: Fällig, op: after, value: "${range.start}" }, { property: Fällig, op: before, value: "${range.end}" }]
\`\`\`

## Notizen zum Semester

-
`
}

/** The term of a page's "Zeitraum" or title, if any (for headers). */
export const termOfLabel = (label: unknown): Term | null =>
  typeof label === 'string' ? parseTerm(label) : null
