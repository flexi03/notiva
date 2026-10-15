import { ExternalLink } from 'lucide-react'
import { useMoodle } from '@/app/moodle'
import { useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { lastChange } from '@/lib/moodleInfo'
import { moduleOfCourse } from '@/lib/study/modules'
import { findStudyDashboard } from '@/lib/study/sync'

/**
 * Moodle courses that belong to no module (orientation, faculty news, …) – straight from the last
 * Moodle fetch, no pages of their own. Module courses appear on their module page.
 */
export function MoodleCourses() {
  const ws = useWorkspace()
  const snapshot = useMoodle((s) => s.snapshot)
  const navigate = useApp((s) => s.navigate)
  if (!snapshot) return <p className="text-sm text-ink-3">{t('moodleCourses.none')}</p>
  const dash = findStudyDashboard(ws)
  const rows = dash && ws.get(`${dash.folder}/Module.md`) ? ws.rows(`${dash.folder}/Module.md`) : []
  const courses = snapshot.courses.filter((c) => !moduleOfCourse(rows, c.id))
  if (!courses.length) return <p className="text-sm text-ink-3">{t('moodleCourses.allInModules')}</p>
  return (
    <ul className="divide-y divide-line rounded-panel border border-line" data-interactive>
      {courses.map((c) => {
        const info = snapshot.info?.[c.id]
        const changed = info ? lastChange(info) : undefined
        return (
          <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
            <button
              type="button"
              className="min-w-0 flex-1 text-left font-medium hover:underline"
              onClick={() => navigate({ name: 'moodle', course: c.id })}
            >
              {c.name}
            </button>
            {changed && (
              <span className="text-[12px] text-ink-3">
                {t('moodleCourses.changed', { date: new Date(changed).toLocaleDateString('de-DE') })}
              </span>
            )}
            {c.url && (
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-[12px] text-accent hover:underline"
              >
                Moodle <ExternalLink size={11} />
              </a>
            )}
          </li>
        )
      })}
    </ul>
  )
}
