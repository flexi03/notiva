import { courseIdsOf } from '@/lib/study/modules'
import { useEffect, useMemo } from 'react'
import { AppWindow, ExternalLink, FileDiff, FolderSync, GraduationCap, RefreshCw } from 'lucide-react'
import { pendingVersions } from '@/app/materials'
import { reindexMaterials } from '@/app/reindex'
import { usePendingVersions } from '@/app/versionsStore'
import { moodleAvailable, useMoodle } from '@/app/moodle'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { getLanguage, t } from '@/i18n'
import type { MoodleCourse, MoodleEvent } from '@/lib/moodle'
import { Button, EmptyState, IconButton, Spinner } from '@/components/ui'
import { Topbar } from '@/components/layout/Topbar'

/** "Moodle": the user's courses with their next deadlines – open them in Notiva or the browser. */
export function MoodleScreen() {
  const ws = useWorkspace()
  const { status, snapshot, loading, error, load, fetchNow, open, setImportOpen } = useMoodle()
  const navigate = useApp((s) => s.navigate)
  const openPage = useApp((s) => s.openPage)
  const connected = !!status?.connected
  const run = useAction()
  const versions = usePendingVersions((s) => s.count)
  useEffect(() => {
    void pendingVersions(ws).then((l) => usePendingVersions.setState({ count: l.length }))
  }, [ws])

  useEffect(() => {
    if (connected && !useMoodle.getState().snapshot) void load()
  }, [connected, load])

  /** Notiva pages that came from Moodle (modules), by Moodle id. */
  const pages = useMemo(() => {
    const map = new Map<string, string>()
    for (const page of ws.all())
      if (typeof page.data.moodle === 'string') map.set(page.data.moodle, page.path)
      // Study folder: a module page lists its courses of all terms.
      else for (const id of courseIdsOf(page.data)) map.set(id, page.path)
    return map
    // ws.version: re-index after imports.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, ws.version])

  const upcoming = (course: MoodleCourse): MoodleEvent[] =>
    (snapshot?.events ?? [])
      .filter((e) => e.course?.id === course.id || (!e.course?.id && e.course?.name === course.name))
      .filter((e) => new Date(e.due).getTime() >= Date.now() - 86_400_000)
      .sort((a, b) => a.due.localeCompare(b.due))

  const body = !moodleAvailable() ? (
    <EmptyState icon={<GraduationCap size={28} />} title={t('moodle.desktopOnly')} />
  ) : !connected ? (
    <EmptyState
      icon={<GraduationCap size={28} />}
      title={t('moodle.screen.notConnected')}
      action={
        <Button variant="primary" onClick={() => navigate({ name: 'settings', section: 'study' })}>
          {t('moodle.screen.connect')}
        </Button>
      }
    />
  ) : !snapshot ? (
    error ? (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    ) : (
      <Spinner label={t('moodle.import.loading')} />
    )
  ) : snapshot.courses.length === 0 ? (
    <p className="text-sm text-ink-2">
      {snapshot.source === 'calendar' ? t('moodle.screen.calendarOnly') : t('moodle.screen.noCourses')}
    </p>
  ) : (
    <ul className="grid gap-3 sm:grid-cols-2" aria-label={t('moodle.screen.courses')}>
      {snapshot.courses.map((course) => {
        const events = upcoming(course)
        const page = pages.get(course.id)
        return (
          <li key={course.id} className="flex flex-col rounded-panel border border-line bg-surface p-4">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold leading-snug">{course.name}</h2>
                {course.shortname && <p className="text-[12.5px] text-ink-3">{course.shortname}</p>}
              </div>
              {course.url && (
                <>
                  <IconButton
                    label={t('moodle.screen.openInApp', { name: course.name })}
                    onClick={() => void open(course.url!, false)}
                  >
                    <AppWindow size={16} />
                  </IconButton>
                  <IconButton
                    label={t('moodle.screen.openInBrowser', { name: course.name })}
                    onClick={() => void open(course.url!, true)}
                  >
                    <ExternalLink size={16} />
                  </IconButton>
                </>
              )}
            </div>
            <ul className="mt-3 flex-1 space-y-1 text-[13px]">
              {events.length === 0 && <li className="text-ink-3">{t('moodle.screen.noDeadlines')}</li>}
              {events.slice(0, 4).map((e) => (
                <li key={e.id} className="flex gap-2">
                  <span className="shrink-0 tabular-nums text-ink-3">{formatDue(e.due)}</span>
                  <span className="min-w-0 truncate">{e.title}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              <button
                type="button"
                onClick={() => navigate({ name: 'moodle', course: course.id })}
                className="text-[13px] font-semibold text-accent hover:underline"
              >
                {t('moodle.screen.materials', {
                  count: (snapshot.materials ?? []).filter((m) => m.courseId === course.id).length,
                })}
              </button>
              {page && (
                <button
                  type="button"
                  onClick={() => openPage(page)}
                  className="text-[13px] font-semibold text-accent hover:underline"
                >
                  {t('moodle.screen.notivaPage')}
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )

  return (
    <>
      <Topbar title={t('moodle.screen.title')} />
      <div className="mx-auto max-w-[var(--content-width)] px-4 py-10 sm:px-10">
        <div className="mb-6 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[2rem] font-bold">{t('moodle.screen.title')}</h1>
            {snapshot && (
              <p className="text-[13px] text-ink-3">
                {t('moodle.screen.fetched', {
                  site: snapshot.site,
                  time: new Date(snapshot.fetchedAt).toLocaleString(
                    getLanguage() === 'de' ? 'de-DE' : 'en-US',
                  ),
                })}
              </p>
            )}
          </div>
          {connected && (
            <>
              <Button
                icon={<RefreshCw size={15} className={loading ? 'animate-spin' : ''} />}
                disabled={loading}
                onClick={() => void fetchNow()}
              >
                {t('moodle.screen.refresh')}
              </Button>
              {versions > 0 && (
                <Button icon={<FileDiff size={15} />} onClick={() => navigate({ name: 'versions' })}>
                  {t('versions.button', { count: versions })}
                </Button>
              )}
              <Button
                icon={<FolderSync size={15} />}
                disabled={loading}
                title={t('reindex.hint')}
                onClick={() => void run(() => reindexMaterials(ws))}
              >
                {t('reindex.button')}
              </Button>
              <Button variant="primary" onClick={() => setImportOpen(true)}>
                {t('moodle.screen.import')}
              </Button>
            </>
          )}
        </div>
        {snapshot?.materialsError && (
          <p role="alert" className="mb-4 text-sm text-danger">
            {snapshot.materialsError}
          </p>
        )}
        {snapshot && error && (
          <p role="alert" className="mb-4 text-sm text-danger">
            {error}
          </p>
        )}
        {body}
      </div>
    </>
  )
}

function formatDue(iso: string): string {
  return new Date(iso).toLocaleString(getLanguage() === 'de' ? 'de-DE' : 'en-US', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
