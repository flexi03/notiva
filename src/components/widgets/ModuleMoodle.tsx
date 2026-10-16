import { useState } from 'react'
import { AlarmClock, AlertTriangle, ExternalLink, Link2, Megaphone, School } from 'lucide-react'
import { useMoodle } from '@/app/moodle'
import { maybeRepo } from '@/app/repoDetect'
import { useApp } from '@/app/store'
import { getLanguage, t } from '@/i18n'
import { repoUrl } from '@/lib/gitUrl'
import { courseIdsOf } from '@/lib/study/modules'
import { electronBridge } from '@/lib/vault'
import type { Page } from '@/lib/workspace'
import { Chip, cx } from '@/components/ui'
import { RepoButton } from '@/components/code/RepoButton'

type Kind = 'deadline' | 'news' | 'link'

interface Entry {
  key: string
  kind: Kind
  date?: string
  title: string
  /** course (term) it belongs to */
  course: string
  section?: string
  text?: string
  url?: string
  important?: boolean
  repo?: boolean
}

/** "Datenbanksysteme 2 - WiSe 2025 26" → "WiSe 25/26"; else the name. */
export function termLabel(name: string): string {
  const m = /(WiSe|WS|SoSe|SS)\s*(?:20)?(\d{2})(?:\s*[/ -]\s*(?:20)?(\d{2}))?/i.exec(name)
  if (!m) return name
  const kind = /^w/i.test(m[1]!) ? 'WiSe' : 'SoSe'
  return m[3] ? `${kind} ${m[2]}/${m[3]}` : `${kind} ${m[2]}`
}

/**
 * Everything Moodle says about the module, in time order: deadlines ahead first, then
 * announcements and links newest first – each with its date, kind, course (term) and section.
 * Git links offer "Repository ins Praktikum holen" right there.
 */
export function ModuleMoodle({ module }: { module: Page }) {
  const snapshot = useMoodle((s) => s.snapshot)
  const navigate = useApp((s) => s.navigate)
  const [all, setAll] = useState(false)
  const [now] = useState(() => Date.now())
  const courses = courseIdsOf(module.data)
  if (!snapshot || !courses.length) return null
  const known = snapshot.courses.filter((c) => courses.includes(c.id))
  if (!known.length) return null
  const many = known.length > 1
  const courseLabel = (id: string) => {
    const c = snapshot.courses.find((x) => x.id === id)
    return c ? termLabel(c.name) : ''
  }
  const entries: Entry[] = []
  for (const e of snapshot.events)
    if (e.course?.id && courses.includes(e.course.id))
      entries.push({
        key: e.id,
        kind: 'deadline',
        date: e.due,
        title: e.title,
        course: courseLabel(e.course.id),
        ...(e.url ? { url: e.url } : {}),
      })
  for (const id of courses)
    for (const n of snapshot.info?.[id]?.announcements ?? [])
      entries.push({
        key: `${id}:${n.id}`,
        kind: 'news',
        ...(n.modified ? { date: n.modified } : {}),
        title: n.title,
        course: courseLabel(id),
        text: n.text,
        ...(n.url ? { url: n.url } : {}),
        ...(n.important ? { important: true } : {}),
      })
  const seen = new Set<string>()
  for (const m of snapshot.materials ?? []) {
    if (m.kind !== 'url' || !courses.includes(m.courseId) || seen.has(m.url)) continue
    seen.add(m.url)
    entries.push({
      key: m.id,
      kind: 'link',
      ...(m.modified ? { date: m.modified } : {}),
      title: m.title,
      course: courseLabel(m.courseId),
      section: m.section,
      url: m.url,
      repo: !!repoUrl(m.url) || maybeRepo(m.url, m.title),
    })
  }
  const ahead = entries
    .filter((e) => e.kind === 'deadline' && e.date && new Date(e.date).getTime() >= now)
    .sort((a, b) => a.date!.localeCompare(b.date!))
  // Newest first; without a date at the end; Git links always visible.
  const history = entries
    .filter((e) => !ahead.includes(e))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.title.localeCompare(b.title))
  const shown = all ? history : history.filter((e, i) => i < 12 || e.repo || e.important)
  const locale = getLanguage() === 'de' ? 'de-DE' : 'en-US'
  const day = (iso?: string) =>
    iso
      ? new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' })
      : '–'
  const open = (url: string) => {
    if (/\/mod\/|\/course\//.test(url) && url.startsWith(snapshot.site))
      return void useMoodle.getState().open(url, false)
    const bridge = electronBridge()
    if (bridge) void bridge.openExternal(url)
    else window.open(url, '_blank', 'noopener')
  }

  const row = (e: Entry) => {
    const Icon = e.kind === 'deadline' ? AlarmClock : e.kind === 'news' ? Megaphone : Link2
    return (
      <li key={e.key} className="py-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="w-16 shrink-0 text-[12px] text-ink-3 tabular-nums">{day(e.date)}</span>
          <Icon
            size={13}
            className={cx('shrink-0', e.important || e.kind === 'deadline' ? 'text-danger' : 'text-accent')}
            aria-label={t(`moodleInfo.kind.${e.kind}`)}
          />
          <button
            type="button"
            disabled={!e.url}
            onClick={() => e.url && open(e.url)}
            className="min-w-0 flex-1 truncate text-left text-[13.5px] font-medium enabled:hover:underline"
            title={e.url}
          >
            {e.important && <AlertTriangle size={12} className="mr-1 inline text-danger" />}
            {e.title}
          </button>
          {e.repo && e.url && <RepoButton link={e.url} title={e.title} module={module.path} />}
          {many && e.course && <Chip>{e.course}</Chip>}
        </div>
        {(e.section || e.text) && (
          <p className="ml-[4.5rem] line-clamp-2 text-[12px] text-ink-3">
            {e.section}
            {e.section && e.text ? ' · ' : ''}
            {e.text?.slice(0, 220)}
          </p>
        )}
      </li>
    )
  }

  return (
    <section aria-label={t('related.moodle')} data-testid="module-moodle">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="flex flex-1 items-center gap-1.5 text-[12.5px] font-semibold text-ink-2">
          <School size={13} /> {t('related.moodle')}
        </h3>
        {[...known].reverse().map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => navigate({ name: 'moodle', course: c.id })}
            title={c.name}
            className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[12px] hover:bg-hover"
          >
            {termLabel(c.name)} <ExternalLink size={10} />
          </button>
        ))}
      </div>
      {ahead.length > 0 && (
        <div className="mb-1">
          <h4 className="text-[12px] font-semibold text-ink-3">{t('moodleInfo.ahead')}</h4>
          <ul>{ahead.map(row)}</ul>
        </div>
      )}
      {history.length > 0 && (
        <>
          <h4 className="text-[12px] font-semibold text-ink-3">{t('moodleInfo.history')}</h4>
          <ul className="divide-y divide-line/60">{shown.map(row)}</ul>
          {history.length > shown.length && (
            <button
              type="button"
              className="mt-1 text-[12.5px] text-accent hover:underline"
              onClick={() => setAll(true)}
            >
              {t('moodleInfo.more', { count: history.length - shown.length })}
            </button>
          )}
        </>
      )}
    </section>
  )
}
