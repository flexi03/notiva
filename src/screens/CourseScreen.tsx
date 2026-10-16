import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AppWindow,
  ArrowLeft,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Link as LinkIcon,
  NotebookText,
  RefreshCw,
} from 'lucide-react'
import { ipcMessage, useMoodle } from '@/app/moodle'
import { withProgress } from '@/app/progress'
import { RepoButton } from '@/components/code/RepoButton'
import { courseIdsOf } from '@/lib/study/modules'
import { isPdf, loadMaterialMap, saveMaterial, type MaterialMap } from '@/app/materials'
import { useApp, useWorkspace } from '@/app/store'
import { getLanguage, t } from '@/i18n'
import type { MoodleMaterial } from '@/lib/moodle'
import { electronBridge } from '@/lib/vault'
import { Button, IconButton, Spinner } from '@/components/ui'
import { Topbar } from '@/components/layout/Topbar'

function formatSize(bytes: number | undefined): string {
  if (!bytes) return ''
  return bytes > 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1000))} kB`
}

/** One Moodle course: its materials by section – open in Notiva, download, or open in Moodle. */
export function CourseScreen({ courseId }: { courseId: string }) {
  const ws = useWorkspace()
  const { snapshot, loading, fetchNow, open } = useMoodle()
  const navigate = useApp((s) => s.navigate)
  const showToast = useApp((s) => s.showToast)
  const [map, setMap] = useState<MaterialMap>({})
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const course = snapshot?.courses.find((c) => c.id === courseId)
  const materials = useMemo(
    () => (snapshot?.materials ?? []).filter((m) => m.courseId === courseId),
    [snapshot, courseId],
  )
  const sections = useMemo(() => {
    const groups = new Map<string, MoodleMaterial[]>()
    for (const m of materials) groups.set(m.section || '–', [...(groups.get(m.section || '–') ?? []), m])
    return [...groups]
  }, [materials])

  const reloadMap = useCallback(() => void loadMaterialMap(ws).then(setMap), [ws])
  useEffect(reloadMap, [reloadMap])

  const withBusy = async (id: string, task: () => Promise<void>) => {
    setBusy((s) => new Set(s).add(id))
    try {
      await task()
    } catch (e) {
      showToast(ipcMessage(e))
    } finally {
      setBusy((s) => {
        const next = new Set(s)
        next.delete(id)
        return next
      })
    }
  }

  /** Opens the saved copy – downloading it first if needed. PDFs open in Notiva's viewer. */
  const openMaterial = (m: MoodleMaterial) =>
    withBusy(m.id, async () => {
      const path = map[m.id] ?? (await saveMaterial(ws, m, { id: m.courseId, name: course?.name ?? 'Kurs' }))
      reloadMap()
      if (isPdf(path) || /\.(png|jpe?g|gif|webp|txt|md|csv)$/i.test(path)) navigate({ name: 'file', path })
      else await electronBridge()?.openWithSystem?.(path)
    })

  // Links (e.g. ProjectBase): the system browser by default (sign-in with 2FA works there).
  const openLink = (m: MoodleMaterial) => void electronBridge()?.openExternal(m.url)
  const openInApp = (m: MoodleMaterial) =>
    void electronBridge()
      ?.openInWindow?.(m.url)
      .catch((e: unknown) => showToast(ipcMessage(e)))
  // The module of this course – Git links offer to get the repository into its lab folder.
  const modulePath = ws.all().find((p) => courseIdsOf(p.data).includes(courseId))?.path

  const downloadAll = () =>
    withBusy('all', async () => {
      const todo = materials.filter((x) => x.kind === 'file' && !map[x.id])
      await withProgress(
        t('materials.saving'),
        async (task) => {
          for (const [i, m] of todo.entries()) {
            task.update(i, todo.length, m.filename ?? m.title)
            await saveMaterial(ws, m, { id: m.courseId, name: course?.name ?? 'Kurs' })
          }
          return todo.length
        },
        { success: (count) => t('course.downloaded', { count }) },
      )
      reloadMap()
    })

  if (!snapshot) return <Spinner label={t('moodle.import.loading')} />

  return (
    <>
      <Topbar title={course?.name ?? t('moodle.screen.title')} />
      <div className="mx-auto max-w-[var(--content-width)] px-4 py-8 sm:px-10">
        <button
          type="button"
          onClick={() => navigate({ name: 'moodle' })}
          className="mb-3 flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink"
        >
          <ArrowLeft size={14} /> {t('course.back')}
        </button>
        <div className="mb-6 flex flex-wrap items-end gap-2">
          <h1 className="min-w-0 flex-1 text-[1.8rem] leading-tight font-bold">{course?.name ?? courseId}</h1>
          <Button
            icon={<RefreshCw size={15} className={loading ? 'animate-spin' : ''} />}
            disabled={loading}
            onClick={() => void fetchNow()}
          >
            {t('moodle.screen.refresh')}
          </Button>
          {materials.some((m) => m.kind === 'file' && !map[m.id]) && (
            <Button
              icon={<Download size={15} />}
              disabled={busy.has('all')}
              onClick={() => void downloadAll()}
            >
              {t('course.downloadAll')}
            </Button>
          )}
          {course?.url && (
            <IconButton
              label={t('moodle.screen.openInApp', { name: course.name })}
              onClick={() => void open(course.url!, false)}
            >
              <AppWindow size={16} />
            </IconButton>
          )}
        </div>
        {materials.length === 0 ? (
          <p role={snapshot.materialsError ? 'alert' : undefined} className="text-sm text-ink-2">
            {snapshot.materialsError ?? t('course.noMaterials')}
          </p>
        ) : (
          sections.map(([section, items]) => (
            <section key={section} aria-label={section} className="mb-6">
              <h2 className="mb-2 text-sm font-semibold text-ink-2">{section}</h2>
              <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
                {items.map((m) => {
                  const saved = map[m.id]
                  return (
                    <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                      <span className="shrink-0 text-ink-3" aria-hidden>
                        {m.kind === 'url' ? (
                          <LinkIcon size={16} />
                        ) : m.kind === 'page' ? (
                          <Globe size={16} />
                        ) : (
                          <FileText size={16} />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{m.title}</p>
                        <p className="truncate text-[12px] text-ink-3">
                          {[
                            m.filename && m.filename !== m.title ? m.filename : '',
                            formatSize(m.size),
                            m.modified
                              ? new Date(m.modified).toLocaleDateString(
                                  getLanguage() === 'de' ? 'de-DE' : 'en-US',
                                )
                              : '',
                            saved ? t('course.saved') : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      {m.kind === 'url' && (
                        <RepoButton
                          link={m.url}
                          title={m.title}
                          {...(modulePath ? { module: modulePath } : {})}
                        />
                      )}
                      {m.kind === 'url' ? (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<ExternalLink size={14} />}
                            onClick={() => openLink(m)}
                          >
                            {t('course.openBrowser')}
                          </Button>
                          {electronBridge()?.openInWindow && (
                            <IconButton label={t('course.openInApp')} onClick={() => openInApp(m)}>
                              <AppWindow size={15} />
                            </IconButton>
                          )}
                        </>
                      ) : m.kind === 'page' ? (
                        <Button size="sm" variant="ghost" onClick={() => void open(m.url, false)}>
                          {t('course.openPage')}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant={saved ? 'secondary' : 'ghost'}
                          icon={saved ? <NotebookText size={14} /> : <Download size={14} />}
                          disabled={busy.has(m.id)}
                          onClick={() => void openMaterial(m)}
                        >
                          {busy.has(m.id)
                            ? t('course.loading')
                            : saved
                              ? t('course.open')
                              : t('course.saveOpen')}
                        </Button>
                      )}
                      <IconButton
                        label={t('course.openSource', { name: m.title })}
                        onClick={() =>
                          void (m.kind === 'url' && !m.activityUrl
                            ? electronBridge()?.openExternal(m.url)
                            : open(m.activityUrl ?? m.url, false))
                        }
                      >
                        <ExternalLink size={15} />
                      </IconButton>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </>
  )
}
