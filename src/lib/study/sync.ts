/**
 * Brings the study folder up to date: one page per module of the PO (status, attempts, semesters),
 * one page per semester of study, one page per Moodle course. Pages are found again by keys in their
 * frontmatter (`modul`, `fachsemester`, `moodle`), so renaming them is fine. Only Notiva's fields
 * are written – notes, the body and properties the user added stay as they are. A status the user
 * set by hand is kept until the facts change (`statusAuto` remembers what Notiva wrote last).
 */
import { parseDatabaseDef, propertyDef, type DatabaseDef, type PropertyDef, type ViewDef } from '../database'
import type { FrontmatterData, FrontmatterValue } from '../frontmatter'
import { materialFolderFor } from './modules'
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
  'Note ausstehend': 'yellow',
  Wiederholung: 'orange',
  Fehlt: 'red',
  Bestanden: 'green',
  'Endgültig nicht bestanden': 'brown',
}

export const MODULE_PROPERTIES = `
    - { name: Nr, type: text }
    - { name: Status, type: select, options: [${MODULE_STATUS.map((s) => `{ value: ${s}, color: ${STATUS_COLORS[s]} }`).join(', ')}] }
    - { name: Belegung, type: multiSelect, options: [{ value: Vorlesung, color: blue }, { value: Praktikum, color: orange }, { value: Übung, color: green }, { value: Prüfung, color: purple }] }
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
    - { name: Link, type: url }
    - { name: Farbe, type: select, options: [{ value: blue, color: blue }, { value: green, color: green }, { value: purple, color: purple }, { value: orange, color: orange }, { value: pink, color: pink }, { value: yellow, color: yellow }, { value: red, color: red }, { value: gray, color: gray }] }`

export const MODULE_VIEWS = `
    - { name: Aktiv, type: table, filter: [{ property: Belegung, op: notEmpty }], sort: [{ property: Nr, direction: asc }], properties: [Belegung, Status, Nr, Versuche, Praktikum, Note] }
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
  const first = (v: ViewDef) => (v.name === 'Aktiv' ? 2 : v.name === 'Dieses Semester' ? 1 : 0)
  views.sort((a, b) => first(b) - first(a))
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
  what: 'module' | 'semester' | 'course' | 'schema' | 'migrate'
  path?: string
  title: string
  /** Short description for the preview ("Status: Fehlt → Wiederholung"). */
  detail: string
}

const same = (a: FrontmatterValue | undefined, b: FrontmatterValue | undefined) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

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
  // What one attends now (suggestion; the user's own choice wins, see moduleChanges).
  // Missing modules taught this semester count as attended (catching up, e.g. DBS 2).
  const caughtUp = m.status === 'Fehlt' && (!module.offered || module.offered === state.current.season)
  v.Belegung =
    m.status === 'In Vorlesung' || caughtUp
      ? ['Vorlesung', ...(module.prerequisite && /praktikum/i.test(module.prerequisite) ? ['Praktikum'] : [])]
      : m.status === 'Wiederholung' || m.status === 'Prüfung angemeldet'
        ? ['Prüfung']
        : []
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
    if (key === 'Status' || key === 'Belegung') continue
    // Link and ECTS only fill gaps; the user may point to another course.
    if ((key === 'Link' || key === 'Dozent') && current[key]) continue
    if (!same(current[key], value)) changes[key] = value
  }
  // Status: set by Notiva unless the user chose another one since the last sync.
  const auto = current.statusAuto
  const userSet = current.Status && auto !== undefined && current.Status !== auto
  const legacy = current.Status === 'Laufend' || current.Status === 'Nicht bestanden'
  // Written after registering: moves on from the user's own "Prüfung angemeldet" too.
  const written = wanted.Status === 'Note ausstehend' && current.Status === 'Prüfung angemeldet'
  if (!userSet || legacy || written || wanted.Status === 'Bestanden') {
    if (!same(current.Status, wanted.Status)) changes.Status = wanted.Status!
    if (!same(auto, wanted.Status)) changes.statusAuto = wanted.Status!
  }
  // Attendance: Notiva's suggestion until the user changes it (then theirs stays).
  const belegAuto = current.belegungAuto
  const userBeleg =
    current.Belegung !== undefined && belegAuto !== undefined && !same(current.Belegung, belegAuto)
  if (!userBeleg || wanted.Status === 'Bestanden') {
    const next = wanted.Status === 'Bestanden' && userBeleg ? [] : wanted.Belegung
    if (!same(current.Belegung ?? [], next ?? [])) changes.Belegung = next ?? []
    if (!same(belegAuto, wanted.Belegung)) changes.belegungAuto = wanted.Belegung ?? []
  }
  // Practical/lab prerequisite: Notiva only suggests; once passed it is done.
  const prereq = typeof wanted.Voraussetzung === 'string' && wanted.Voraussetzung
  // Admitted to an exam = prerequisite done.
  const done = wanted.Status === 'Bestanden' || Number(wanted.Versuche ?? 0) > 0
  if (!current.Praktikum) changes.Praktikum = prereq ? (done ? 'Bestanden' : 'Offen') : 'Nicht nötig'
  else if (current.Praktikum === 'Offen' && done) changes.Praktikum = 'Bestanden'
  return changes
}

export interface StudyPlan {
  changes: StudyChange[]
  apply: () => Promise<string[]>
}

/**
 * Compares the vault with the study state. `apply` writes it (pages first, so links resolve).
 * `folder` is the study folder ("Studium"), its databases are Module and Semester.
 */
/**
 * Written, no grade yet: an exam of the module (database "Prüfungen") lies in the past, has no
 * grade and is newer than the last result from eCampus (which lists such exams only later).
 */
export function awaitingGrade(
  ws: Workspace,
  folder: string,
  modulePath: string,
  lastResult: string | undefined,
  today: string,
): boolean {
  const db = `${folder}/Prüfungen.md`
  if (!ws.get(db)) return false
  return ws.rows(db).some((r) => {
    const date = String(r.data.Datum ?? '').slice(0, 10)
    if (!date || date >= today || (lastResult && date <= lastResult)) return false
    if (r.data.Note !== undefined && r.data.Note !== null && r.data.Note !== '') return false
    const links = (Array.isArray(r.data.Modul) ? r.data.Modul : [r.data.Modul]).map(String)
    return links.some((l) => {
      const target = /\[\[([^\]|#]+)/.exec(l)?.[1]
      return !!target && ws.resolveLink(target, r.path) === modulePath
    })
  })
}

export function planStudySync(ws: Workspace, folder: string, state: StudyState, now = new Date()): StudyPlan {
  const today = now.toISOString().slice(0, 10)
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
    if (
      row &&
      wanted.Status !== 'Bestanden' &&
      wanted.Status !== 'Endgültig nicht bestanden' &&
      awaitingGrade(ws, folder, row.path, m.result?.date, today)
    )
      wanted.Status = 'Note ausstehend'
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
      const values: FrontmatterData = {
        ...wanted,
        statusAuto: wanted.Status!,
        belegungAuto: wanted.Belegung ?? [],
      }
      const prereq = wanted.Voraussetzung
      values.Praktikum = prereq
        ? m.status === 'Bestanden' || (m.result?.tries ?? 0) > 0
          ? 'Bestanden'
          : 'Offen'
        : 'Nicht nötig'
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
    // Longer studies get more semesters: always up to the next one.
    const last = Math.max(state.program.semesters, state.semester + 1)
    for (let n = 1; n <= last; n++) {
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
    // Own semester pages (e.g. a semester abroad): with "Zeitraum" they get the overview, too.
    for (const r of srows) {
      const term = r.data.fachsemester === undefined ? termOfLabel(r.data.Zeitraum) : null
      if (!term || r.body.trim()) continue
      changes.push({
        kind: 'update',
        what: 'semester',
        path: r.path,
        title: r.title,
        detail: termLabel(term),
      })
      steps.push(() => ws.save(r.path, { body: semesterBody(folder, term) }))
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

  // Former "Kurse" database (Notiva < 0.1.4): everything moves to the modules – after asking.
  // Materials go to "Unterlagen/<Modul>", own notes of a course page are appended to its module
  // page, the database goes to the trash (restorable). Moodle infos now show on the module page.
  const legacy = ws.get(coursesDb)
  if (legacy?.database) {
    const base = `${folder}/Unterlagen`
    const courseRows = ws.rows(coursesDb)
    const moduleTitle = (row: (typeof courseRows)[number]) => {
      const id = String(row.data.moodle ?? '')
      const m = state.modules.find((x) => x.courses.some((c) => c.id === id))
      const path = m ? (pathOf.get(m.module.nr) ?? moduleRow(m)?.path) : undefined
      return path ? (ws.get(path)?.title ?? m?.module.name) : m?.module.name
    }
    const moves: Array<{ from: string; to: string }> = []
    const notes: Array<{ module: string; course: string; text: string }> = []
    for (const row of courseRows) {
      const title = moduleTitle(row)
      const from = typeof row.data.Ordner === 'string' ? row.data.Ordner : ''
      const to = materialFolderFor(base, { name: row.title }, title)
      const files =
        from && from !== to
          ? [...ws.all().map((p) => p.path), ...ws.assets().map((f) => f.path)]
              .filter((f) => f.startsWith(`${from}/`))
              .map((path) => ({ path }))
          : []
      for (const f of files) moves.push({ from: f.path, to: `${to}${f.path.slice(from.length)}` })
      const own = ownNotes(row.body)
      if (own && title) notes.push({ module: title, course: row.title, text: own })
      changes.push({
        kind: 'update',
        what: 'migrate',
        path: row.path,
        title: row.title,
        detail: `→ ${to.slice(base.length + 1)}${files.length ? ` · ${files.length} Dateien` : ''}${own ? ' · Notizen' : ''}`,
      })
    }
    changes.push({
      kind: 'update',
      what: 'migrate',
      path: coursesDb,
      title: 'Kurse',
      detail: 'Datenbank in den Papierkorb – Moodle-Infos stehen jetzt auf den Modulseiten',
    })
    steps.push(async () => {
      const done = await ws.moveFiles(moves)
      const renamed = new Map(done.map((m) => [m.from, m.to]))
      const map = await ws.readMeta<Record<string, unknown>>('moodle-files.json')
      if (map) {
        const next: Record<string, unknown> = {}
        for (const [id, v] of Object.entries(map)) {
          const path = typeof v === 'string' ? v : (v as { path?: string })?.path
          const to = path ? renamed.get(path) : undefined
          next[id] = to ? (typeof v === 'string' ? to : { ...(v as object), path: to }) : v
        }
        await ws.writeMeta('moodle-files.json', next)
      }
      const rows = ws.rows(modulesDb)
      for (const n of notes) {
        const page = rows.find((r) => r.title === n.module)
        if (page)
          await ws.save(page.path, {
            body: `${page.body.trimEnd()}\n\n## Notizen aus „${n.course}“\n\n${n.text}\n`,
          })
      }
      await ws.trash(coursesDb)
    })
  }

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

/** What the user wrote on a former course page (below "## Meine Notizen"), if anything. */
function ownNotes(body: string): string {
  const i = body.indexOf('## Meine Notizen')
  const text = i >= 0 ? body.slice(i + '## Meine Notizen'.length).trim() : ''
  return /[\p{L}\p{N}]/u.test(text.replace(/^[-*]\s*$/gm, '')) ? text : ''
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
