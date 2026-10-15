import { announce } from '@/app/progress'
import { useApp } from '@/app/store'
import { t } from '@/i18n'
import { findSessions, planTimetable, type Session, type TimetableRow } from '@/lib/schedule'
import { findStudyDashboard } from '@/lib/study/sync'
import type { Workspace } from '@/lib/workspace'
import { courseInfoMarkdown } from '@/lib/moodleInfo'
import { electronBridge } from '@/lib/vault'
import { currentProfile } from '@/app/university'
import { courseIdsOf } from '@/lib/study/modules'
import { termIndex } from '@/lib/study/terms'
import type { FrontmatterData } from '@/lib/frontmatter'

const linkTitle = (ws: Workspace, value: unknown, from: string) => {
  const ref = Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '')
  const target = /^\[\[([^\]|#]+)/.exec(ref)?.[1]
  const path = target ? ws.resolveLink(target, from) : null
  return path ? ws.get(path)?.title : undefined
}

/** Timetable rows with their module's title (relation "Modul"). */
export function timetableRows(ws: Workspace, folder: string): TimetableRow[] {
  const db = `${folder}/Stundenplan.md`
  if (!ws.get(db)?.database) return []
  return ws.rows(db).map((r) => ({
    path: r.path,
    title: r.title,
    ...(typeof r.data.Tag === 'string' ? { day: r.data.Tag } : {}),
    ...(typeof r.data.Beginn === 'string' ? { start: r.data.Beginn } : {}),
    ...(typeof r.data.Ende === 'string' ? { end: r.data.Ende } : {}),
    ...(typeof r.data.Typ === 'string' ? { type: r.data.Typ } : {}),
    ...(typeof r.data.Raum === 'string' ? { room: r.data.Raum } : {}),
    ...(linkTitle(ws, r.data.Modul, r.path) ? { module: linkTitle(ws, r.data.Modul, r.path)! } : {}),
  }))
}

const skipKey = (module: string, s: Session) => `notiva:tt-skip:${module}|${s.type}|${s.day}|${s.start}`
const skipped = (key: string) => {
  try {
    return !!localStorage.getItem(key)
  } catch {
    return false
  }
}
const skip = (key: string) => {
  try {
    localStorage.setItem(key, '1')
  } catch {
    /* private mode */
  }
}

/** One proposal: a new session, a different time than the own entry, or one of several groups. */
interface Suggestion {
  id: string
  module: { path: string; title: string }
  session: Session
  kind: 'create' | 'conflict' | 'group'
  /** conflict: the user's row */
  row?: TimetableRow
}

const when = (s: Session) => `${s.day} ${s.start}–${s.end}${s.room ? ` (${s.room})` : ''}`

/** What Moodle's course texts say about the attended modules' times – nothing is written. */
async function timetableSuggestions(ws: Workspace): Promise<{ db: string; list: Suggestion[] } | null> {
  const dash = findStudyDashboard(ws)
  if (!dash) return null
  const db = `${dash.folder}/Stundenplan.md`
  if (!ws.get(db)?.database) return null
  const info =
    (
      await electronBridge()
        ?.moodle?.snapshot()
        .catch(() => null)
    )?.info ?? {}
  const program = currentProfile(ws).examPlans?.programCode
  // The module's courses (its page lists them in `kurse`); the ones of this term when there are
  // several (an old term's course has old times).
  const { previewStudy, studySources } = await import('@/app/study')
  const preview = previewStudy(ws, await studySources())
  const termsOf = new Map<string, number>()
  if (preview.ok)
    for (const m of preview.state.modules)
      for (const c of m.courses) if (c.term) termsOf.set(c.id, termIndex(c.term))
  const current = preview.ok ? termIndex(preview.state.current) : Infinity
  const coursesOf = (data: Record<string, unknown>) => {
    const ids = courseIdsOf(data as FrontmatterData).filter((id) => info[id])
    const now = ids.filter((id) => termsOf.get(id) === current)
    if (now.length) return now
    const latest = Math.max(...ids.map((id) => termsOf.get(id) ?? -Infinity))
    return ids.filter((id) => (termsOf.get(id) ?? -Infinity) === latest)
  }
  const list: Suggestion[] = []
  for (const row of ws.rows(`${dash.folder}/Module.md`)) {
    if (!Array.isArray(row.data.Belegung) || !row.data.Belegung.length) continue
    // Only what the user attends: "nur Prüfung" adds nothing, "Praktikum" only the lab.
    const belegt = new Set(row.data.Belegung.map(String))
    const wanted = (type: string) =>
      type === 'Tutorium' ? belegt.has('Vorlesung') || belegt.has('Übung') : belegt.has(type)
    const sessions = coursesOf(row.data)
      .flatMap((id) => findSessions(courseInfoMarkdown(info[id]!), 'Vorlesung', program))
      .filter((x) => wanted(x.type))
    const module = { path: row.path, title: row.title }
    for (const change of planTimetable(row.title, sessions, timetableRows(ws, dash.folder))) {
      const options = change.kind === 'groups' ? change.options! : [change.session]
      for (const session of options) {
        const id = skipKey(row.title, session)
        if (skipped(id)) continue
        list.push({
          id,
          module,
          session,
          kind: change.kind === 'groups' ? 'group' : change.kind,
          ...(change.row ? { row: change.row } : {}),
        })
      }
    }
  }
  return { db, list }
}

/**
 * Times of lectures, exercises and labs found in Moodle – as suggestions: "Vorlesung Mi 09:00–13:00
 * für BWL – übernehmen?". `interactive` (button "Vorschlagen") opens the list right away; after a
 * background check there is only a hint to look at them. Declined ones are not suggested again.
 */
export async function suggestTimetable(ws: Workspace, interactive = false): Promise<number> {
  const found = await timetableSuggestions(ws)
  if (!found) return 0
  const { db, list } = found
  if (!list.length) {
    if (interactive) announce(t('timetable.nothingNew'))
    return 0
  }
  const review = async () => {
    const picked = await useApp.getState().ask({
      title: t('timetable.reviewTitle', { count: list.length }),
      label: t('timetable.reviewNote'),
      confirmLabel: t('timetable.apply'),
      checklist: list.map((x) => ({
        value: x.id,
        label: `${x.module.title}: ${x.session.type}${x.session.group ? ` ${t('timetable.group', { group: x.session.group })}` : ''} · ${when(x.session)}`,
        detail:
          x.kind === 'conflict'
            ? t('timetable.instead', {
                own: `${x.row?.day ?? '?'} ${x.row?.start ?? ''}${x.row?.end ? `–${x.row.end}` : ''}`,
              })
            : x.kind === 'group'
              ? t('timetable.groupHint')
              : t('timetable.newHint'),
        checked: x.kind === 'create',
      })),
    })
    if (picked === null) return 0
    const chosen = new Set(JSON.parse(picked) as string[])
    await ensureLabType(ws, db)
    let done = 0
    for (const x of list) {
      if (!chosen.has(x.id)) {
        skip(x.id)
        continue
      }
      const s = x.session
      const values = {
        Tag: s.day,
        Beginn: s.start,
        Ende: s.end,
        Typ: s.type,
        ...(s.room ? { Raum: s.room } : {}),
        Modul: [`[[${ws.linkText(x.module.path)}]]`],
        stundenplan: 'moodle',
      }
      if (x.kind === 'conflict' && x.row)
        await ws.save(x.row.path, { data: { ...ws.get(x.row.path)!.data, ...values } })
      else await ws.createRow(db, `${x.module.title} – ${s.type}${s.group ? ` ${s.group}` : ''}`, values)
      skip(x.id)
      done++
    }
    if (done) announce(t('timetable.added', { count: done }))
    return done
  }
  if (interactive) return review()
  await electronBridge()?.notifications?.add([
    {
      id: 'suggest:timetable',
      kind: 'deadline',
      title: t('timetable.foundTitle', { count: list.length }),
      body: list
        .slice(0, 3)
        .map((x) => `${x.module.title}: ${x.session.type} ${when(x.session)}`)
        .join(' · '),
      time: new Date().toISOString(),
      target: { type: 'review', what: 'timetable' },
    },
  ])
  announce(t('timetable.foundTitle', { count: list.length }), {
    state: 'info',
    key: 'timetable-suggestions',
    note: t('timetable.foundNote'),
    action: { label: t('timetable.review'), run: () => void review() },
  })
  return 0
}

/** After a sync: only suggest (see suggestTimetable). */
export const syncTimetable = (ws: Workspace) => suggestTimetable(ws, false)

async function ensureLabType(ws: Workspace, db: string): Promise<void> {
  const typ = ws.get(db)?.database?.properties.find((p) => p.name === 'Typ')
  if (typ?.type === 'select' && !typ.options?.some((o) => o.value === 'Praktikum'))
    await ws.updateDatabase(db, (d) => ({
      ...d,
      properties: d.properties.map((p) =>
        p.name === 'Typ'
          ? { ...p, options: [...(p.options ?? []), { value: 'Praktikum', color: 'orange' as const }] }
          : p,
      ),
    }))
}
