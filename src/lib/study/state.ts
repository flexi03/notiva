/**
 * Where each module of the program stands: catalog (PO) + eCampus attempts + Moodle courses →
 * status, attempt history, the semesters the module belongs to. Pure; the vault update lives in
 * sync.ts.
 */
import type { ModuleResult } from '../ecampus'
import type { MoodleCourse } from '../moodle'
import { planModules, type CatalogModule, type StudyProgram } from './catalog'
import { isOrgaCourse, matchExam, matchModuleName, sharedWords } from './match'
import { addTerms, parseTerm, studySemester, termIndex, termLabel, termOf, type Term } from './terms'

export const MODULE_STATUS = [
  'Geplant',
  'In Vorlesung',
  'Prüfung angemeldet',
  'Wiederholung',
  'Fehlt',
  'Bestanden',
  'Endgültig nicht bestanden',
] as const
export type ModuleStatus = (typeof MODULE_STATUS)[number]

export interface CourseRef extends MoodleCourse {
  /** Semester in the course name ("… WiSe 2025/26"); none for courses used every semester. */
  term?: Term
}

export interface ModuleState {
  module: CatalogModule
  result?: ModuleResult
  courses: CourseRef[]
  status: ModuleStatus
  /** Semesters the module belongs to (attempts, courses, plan), oldest first. */
  terms: Term[]
  /** Semester of the study plan as a real semester (from the start of studies). */
  plannedTerm?: Term
  /** "1. WiSe 24/25: 5,0 · 2. SoSe 25: 3,3 ✓" */
  history: string
}

export interface StudyState {
  program: StudyProgram
  start: Term
  current: Term
  /** Semester of study now (1, 2, …). */
  semester: number
  modules: ModuleState[]
  /** Courses about the degree as a whole (information, student council …). */
  orga: CourseRef[]
  /** Courses that fit no module. */
  other: CourseRef[]
}

const courseRef = (c: MoodleCourse): CourseRef => {
  const term = parseTerm(c.name) ?? parseTerm(c.shortname)
  return term ? { ...c, term } : { ...c }
}

/** Next semester (from `from` on) in which a module is offered. */
function nextOffered(module: CatalogModule, from: Term): Term {
  if (!module.offered || from.season === module.offered) return from
  return addTerms(from, 1)
}

function attemptText(a: ModuleResult['attempts'][number]): string {
  const result =
    a.status === 'passed'
      ? `${a.gradeText && a.grade !== undefined ? a.gradeText : 'bestanden'} ✓`
      : a.status === 'registered'
        ? 'angemeldet'
        : a.remark && /nicht erschienen/i.test(a.remark)
          ? 'nicht erschienen'
          : a.gradeText && a.grade !== undefined
            ? a.gradeText
            : a.statusText || 'nicht bestanden'
  const term = a.semester ? (parseTerm(a.semester) ? termLabel(parseTerm(a.semester)!) : a.semester) : ''
  return `${a.attempt ? `${a.attempt}. ` : ''}${term ? `${term}: ` : ''}${result}`
}

export function studyState(
  program: StudyProgram,
  start: Term,
  input: {
    results: ModuleResult[]
    courses: MoodleCourse[]
    now: Date
    /** courses the user takes later or not at all: they don't make a module current */
    setAside?: (courseId: string) => boolean
  },
): StudyState {
  const current = termOf(input.now)
  const semester = studySemester(start, current)
  const byNr = new Map<string, { result?: ModuleResult; courses: CourseRef[] }>()
  const entry = (m: CatalogModule) => {
    const e = byNr.get(m.nr) ?? { courses: [] }
    byNr.set(m.nr, e)
    return e
  }
  for (const m of planModules(program)) entry(m)
  const extra: CatalogModule[] = []
  for (const r of input.results) {
    let module = matchExam(r, program)
    if (!module) {
      // Not in the catalog (other PO, recognized exam): keep it as its own module.
      module = { nr: r.number ?? r.key, name: r.title, ects: r.credits ?? 0, kind: 'Wahl' }
      extra.push(module)
    }
    entry(module).result = r
  }
  const orga: CourseRef[] = []
  const other: CourseRef[] = []
  const all = [...program.modules, ...extra]
  for (const course of input.courses.map(courseRef)) {
    if (isOrgaCourse(course.name)) {
      orga.push(course)
      continue
    }
    let module = matchModuleName(course.name, program)?.module
    // Project courses: compare with the (long) titles of the exams.
    if (!module) {
      const hit = input.results.find((r) => sharedWords(course.name, r.title) >= 2)
      if (hit) module = matchExam(hit, program) ?? extra.find((m) => m.name === hit.title)
    }
    if (module) entry(module).courses.push(course)
    else other.push(course)
  }

  const modules: ModuleState[] = []
  for (const [nr, { result, courses }] of byNr) {
    const module = all.find((m) => m.nr === nr)!
    const plannedTerm = module.semester ? addTerms(start, module.semester - 1) : undefined
    const passed = result?.status === 'passed'
    const failedTries = result?.failedTries ?? 0
    const nowIndex = termIndex(current)
    const currentCourse = courses.some(
      (c) => c.term && termIndex(c.term) === nowIndex && !input.setAside?.(c.id),
    )
    let status: ModuleStatus
    if (passed) status = 'Bestanden'
    else if (result?.status === 'failedFinal') status = 'Endgültig nicht bestanden'
    else if (result?.status === 'registered') status = 'Prüfung angemeldet'
    else if (failedTries > 0) status = 'Wiederholung'
    else if (currentCourse || (plannedTerm && termIndex(plannedTerm) === nowIndex)) status = 'In Vorlesung'
    else if (plannedTerm && termIndex(plannedTerm) < nowIndex) status = 'Fehlt'
    else status = 'Geplant'

    const terms = new Map<number, Term>()
    const add = (t: Term | null | undefined) => t && terms.set(termIndex(t), t)
    for (const a of result?.attempts ?? []) add(parseTerm(a.semester))
    for (const c of courses) add(c.term)
    if (!passed && status !== 'Endgültig nicht bestanden') {
      if (plannedTerm && termIndex(plannedTerm) >= nowIndex) add(plannedTerm)
      // Retakes: exams are offered every semester; missing modules: next time it is taught.
      else if (status === 'Wiederholung' || status === 'Prüfung angemeldet') add(current)
      else if (status === 'Fehlt') add(nextOffered(module, current))
    }
    if (!terms.size && plannedTerm && !result) add(plannedTerm)
    const history = (result?.attempts ?? [])
      .filter((a) => a.level !== 'module' && a.level !== 'account')
      .map(attemptText)
      .join(' · ')
    modules.push({
      module,
      ...(result ? { result } : {}),
      courses,
      status,
      terms: [...terms.values()].sort((a, b) => termIndex(a) - termIndex(b)),
      ...(plannedTerm ? { plannedTerm } : {}),
      history,
    })
  }
  modules.sort(
    (a, b) =>
      (a.module.semester ?? 99) - (b.module.semester ?? 99) ||
      a.module.nr.localeCompare(b.module.nr, 'de', { numeric: true }),
  )
  return { program, start, current, semester, modules, orga, other }
}
