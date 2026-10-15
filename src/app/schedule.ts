import { announce } from '@/app/progress'
import { useApp } from '@/app/store'
import { t } from '@/i18n'
import { findSessions, planTimetable, type Session, type TimetableRow } from '@/lib/schedule'
import { findStudyDashboard } from '@/lib/study/sync'
import type { Workspace } from '@/lib/workspace'
import { courseInfoMarkdown } from '@/lib/moodleInfo'
import { electronBridge } from '@/lib/vault'
import { currentProfile } from '@/app/university'

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

/**
 * Lecture/lab/exercise times from the Moodle course texts of the attended modules into the
 * timetable. Own entries that say otherwise: asked (bottom left), never overwritten silently.
 */
export async function syncTimetable(ws: Workspace): Promise<number> {
  const dash = findStudyDashboard(ws)
  if (!dash) return 0
  const db = `${dash.folder}/Stundenplan.md`
  const def = ws.get(db)?.database
  if (!def) return 0
  const typ = def.properties.find((p) => p.name === 'Typ')
  if (typ?.type === 'select' && !typ.options?.some((o) => o.value === 'Praktikum'))
    await ws.updateDatabase(db, (d) => ({
      ...d,
      properties: d.properties.map((p) =>
        p.name === 'Typ'
          ? { ...p, options: [...(p.options ?? []), { value: 'Praktikum', color: 'orange' as const }] }
          : p,
      ),
    }))
  // Course texts straight from the last Moodle check (the course pages may not have them yet).
  const info =
    (
      await electronBridge()
        ?.moodle?.snapshot()
        .catch(() => null)
    )?.info ?? {}
  const program = currentProfile(ws).examPlans?.programCode
  const courseText = (page: { body: string; data: Record<string, unknown> }) => {
    const id = String(page.data.moodle)
    return info[id] ? courseInfoMarkdown(info[id]) : page.body
  }
  let created = 0
  for (const row of ws.rows(`${dash.folder}/Module.md`)) {
    if (!Array.isArray(row.data.Belegung) || !row.data.Belegung.length) continue
    // Only the courses of this term (Aktiv) – an old term's course has old times.
    const linked = ws.backlinks(row.path).filter((p) => p.data.moodle)
    const active = linked.filter((p) => p.data.Aktiv !== false)
    const courses = active.length ? active : linked
    // Only what the user attends: "nur Prüfung" adds nothing, "Praktikum" only the lab.
    const belegt = new Set(row.data.Belegung.map(String))
    const wanted = (type: string) =>
      type === 'Tutorium' ? belegt.has('Vorlesung') || belegt.has('Übung') : belegt.has(type)
    const sessions = courses
      .flatMap((c) => findSessions(courseText(c), 'Vorlesung', program))
      .filter((x) => wanted(x.type))
    if (!sessions.length) continue
    for (const change of planTimetable(row.title, sessions, timetableRows(ws, dash.folder))) {
      const s = change.session
      if (change.kind === 'groups') {
        const key = `notiva:tt-groups:${row.title}|${s.type}`
        try {
          if (localStorage.getItem(key)) continue
          localStorage.setItem(key, '1')
        } catch {
          /* private mode */
        }
        const options = change.options!
        const pick = await useApp.getState().ask({
          title: t('timetable.groups', { module: row.title, type: s.type }),
          label: t('timetable.groupsNote'),
          confirmLabel: t('timetable.apply'),
          choices: options.map((o, i) => ({
            value: String(i),
            label: `${t('timetable.group', { group: o.group ?? '' })}: ${o.day} ${o.start}–${o.end}${o.room ? ` (${o.room})` : ''}`,
          })),
        })
        const chosen = pick === null ? undefined : options[Number(pick)]
        if (!chosen) continue
        await ws.createRow(db, `${row.title} – ${s.type}`, {
          Tag: chosen.day,
          Beginn: chosen.start,
          Ende: chosen.end,
          Typ: chosen.type,
          ...(chosen.room ? { Raum: chosen.room } : {}),
          Modul: [`[[${ws.linkText(row.path)}]]`],
          stundenplan: 'moodle',
        })
        created++
        continue
      }
      const values = {
        Tag: s.day,
        Beginn: s.start,
        Ende: s.end,
        Typ: s.type,
        ...(s.room ? { Raum: s.room } : {}),
        Modul: [`[[${ws.linkText(row.path)}]]`],
        stundenplan: 'moodle',
      }
      if (change.kind === 'create') {
        await ws.createRow(db, `${row.title} – ${s.type}`, values)
        created++
        continue
      }
      try {
        if (localStorage.getItem(skipKey(row.title, s))) continue
      } catch {
        /* private mode */
      }
      const own = change.row!
      announce(t('timetable.conflict', { module: row.title, type: s.type }), {
        state: 'info',
        sticky: true,
        key: `tt:${row.title}:${s.type}`,
        note: t('timetable.conflictNote', {
          moodle: `${s.day} ${s.start}–${s.end}${s.room ? ` (${s.room})` : ''}`,
          own: `${own.day ?? '?'} ${own.start ?? ''}${own.end ? `–${own.end}` : ''}`,
        }),
        action: {
          label: t('timetable.apply'),
          run: () =>
            void useApp.getState().ws?.save(own.path, { data: { ...ws.get(own.path)!.data, ...values } }),
        },
        onDismiss: () => {
          try {
            localStorage.setItem(skipKey(row.title, s), '1')
          } catch {
            /* private mode */
          }
        },
      })
    }
  }
  if (created) announce(t('timetable.added', { count: created }))
  return created
}
