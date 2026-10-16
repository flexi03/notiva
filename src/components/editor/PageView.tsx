import { useEffect, useRef, useState } from 'react'
import { Code2, FileText, Link as LinkIcon, SmilePlus } from 'lucide-react'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { usePageActions } from '@/app/hooks/usePageActions'
import { t } from '@/i18n'
import { wordCount } from '@/lib/editing'
import { cx, EmptyState, IconButton, Popover } from '@/components/ui'
import { Topbar } from '@/components/layout/Topbar'
import { PageIcon } from '@/components/layout/PageIcon'
import { DatabaseView } from '@/components/database/DatabaseView'
import { BlockEditor } from './BlockEditor'
import { EmojiPicker } from './EmojiPicker'
import { PageProperties } from './PageProperties'
import { CodeFolder } from '@/components/code/CodeFolder'
import { RepoFiles } from '@/components/code/RepoFiles'
import { ModuleSchedule } from '@/components/widgets/ModuleSchedule'
import { DayOverview, dailyDate } from '@/components/widgets/DayOverview'
import { SourceEditor } from './SourceEditor'
import { PageRail } from './PageRail'
import { ChangeMarker } from './Block'
import { usePageGitChanges } from '@/app/git'
import type { Page } from '@/lib/workspace'

const NO_BLOCKS: string[] = []
const EMPTY_PAGE = { path: '', body: '', mtime: 0 } as Page

const COVERS: Record<string, string> = {
  blue: 'var(--opt-blue)',
  green: 'var(--opt-green)',
  yellow: 'var(--marker)',
  purple: 'var(--opt-purple)',
  pink: 'var(--opt-pink)',
  orange: 'var(--opt-orange)',
  gray: 'var(--opt-gray)',
  red: 'var(--opt-red)',
}

/** A page as its own screen: top bar (breadcrumbs, source toggle, menu) + content. */
export function PageView({ path }: { path: string }) {
  const ws = useWorkspace()
  const page = ws.get(path)
  const [source, setSource] = useState(false)

  useEffect(() => {
    document.title = page ? `${page.title} – Notiva` : 'Notiva'
  }, [page])

  return (
    <>
      <Topbar
        {...(page ? {} : { title: '—' })}
        actions={page && <SourceToggle source={source} onChange={setSource} className="max-sm:hidden" />}
      />
      <PageContent path={path} source={source} />
    </>
  )
}

/** Switches between block editor and Markdown source. */
export function SourceToggle({
  source,
  onChange,
  className,
}: {
  source: boolean
  onChange: (source: boolean) => void
  className?: string
}) {
  // Icon only: the top bar has to leave room for the title, also with the side bar open.
  return (
    <IconButton
      label={source ? t('page.blocks') : t('page.source')}
      title={source ? t('page.blocks') : t('page.source')}
      onClick={() => onChange(!source)}
      active={source}
      aria-pressed={source}
      {...(className ? { className } : {})}
    >
      {source ? <FileText size={16} /> : <Code2 size={16} />}
    </IconButton>
  )
}

/**
 * Header, properties, editor, database, sub pages and backlinks of a page. Shared by the page
 * screen and the side panel (`embedded`: no top bar above it).
 */
export function PageContent({
  path,
  source = false,
  embedded = false,
}: {
  path: string
  source?: boolean
  embedded?: boolean
}) {
  const ws = useWorkspace()
  const page = ws.get(path)
  const { openPage } = useApp()
  const run = useAction()
  const actions = usePageActions(ws)
  const [iconOpen, setIconOpen] = useState(false)
  const iconRef = useRef<HTMLButtonElement>(null)
  const articleRef = useRef<HTMLElement>(null)
  const railMode = useApp((s) => s.settings.pageRail)
  const git = usePageGitChanges(page ?? EMPTY_PAGE, NO_BLOCKS)

  if (!page) return <EmptyState title={t('page.notFound')} />

  const backlinks = ws.backlinks(page.path)
  const modulesDb = ws.findDatabase('Module', page.path)
  const isModuleRow = !!modulesDb && page.path.startsWith(`${ws.rowFolder(modulesDb)}/`)
  const daily = dailyDate(page)
  const children = page.database ? [] : ws.children(page.path)
  const isRow = page.parentDatabase !== null
  const hasProperties =
    isRow ||
    Object.keys(page.data).some(
      (k) => !['title', 'icon', 'database', 'cover', 'order', 'template', 'width'].includes(k),
    )
  const cover = typeof page.data.cover === 'string' ? COVERS[page.data.cover] : undefined
  const setIcon = (icon: string | undefined) => {
    setIconOpen(false)
    void run(() => ws.setProperty(page.path, 'icon', icon))
  }

  const wide = Boolean(page.database) || page.data.width === 'full' || page.data.width === 'wide'
  return (
    <div className="relative">
      {cover && (
        <div
          aria-hidden
          className={cx('no-print h-28', !embedded && '-mt-12')}
          style={{
            background: `linear-gradient(180deg, ${cover}, color-mix(in srgb, ${cover} 35%, var(--paper)))`,
          }}
        />
      )}
      {/* Wide pages leave room on the right for the minimap on large screens. */}
      <div className={cx(wide && railMode === 'minimap' && 'min-[1280px]:pr-32')}>
        <article
          ref={articleRef}
          className={cx(
            'mx-auto w-full px-4 pb-24 sm:px-10',
            page.database || page.data.width === 'full'
              ? 'max-w-[min(100%,90rem)]'
              : page.data.width === 'wide'
                ? 'max-w-[max(var(--content-width),68rem)]'
                : 'max-w-[var(--content-width)]',
          )}
        >
          <header className={cx('group/header', cover ? '-mt-8' : 'pt-10 sm:pt-14')}>
            <div className="mb-2 flex min-h-10 items-end">
              <button
                ref={iconRef}
                type="button"
                onClick={() => setIconOpen(true)}
                aria-label={page.icon ? t('page.changeIcon') : t('page.addIcon')}
                className={cx(
                  'rounded-panel transition-colors hover:bg-hover',
                  page.icon
                    ? 'text-[2.75rem] leading-none'
                    : 'flex items-center gap-1.5 px-1.5 py-1 text-[13px] text-ink-3 opacity-0 group-hover/header:opacity-100 focus:opacity-100 max-md:opacity-100',
                )}
              >
                {page.icon ?? (
                  <>
                    <SmilePlus size={15} /> {t('page.addIcon')}
                  </>
                )}
              </button>
              <Popover
                anchor={iconRef}
                open={iconOpen}
                onClose={() => setIconOpen(false)}
                label={t('page.addIcon')}
              >
                <EmojiPicker
                  onPick={setIcon}
                  {...(page.icon ? { onRemove: () => setIcon(undefined) } : {})}
                />
              </Popover>
            </div>
            <TitleInput
              key={`${page.path}|${page.title}`}
              title={page.title}
              onRename={(title) => void actions.rename(page.path, title)}
            />
            {page.error && (
              <p
                role="alert"
                className="mt-2 rounded-control bg-[var(--opt-red)] px-3 py-1.5 text-sm text-[var(--opt-red-ink)]"
              >
                {t('page.yamlError', { message: page.error })}
              </p>
            )}
          </header>

          {hasProperties && !source && (
            <div
              className="relative mt-4 border-y border-line py-2"
              {...(git?.properties ? { 'data-change': 'modified' } : {})}
            >
              {git?.properties && <ChangeMarker change="modified" pagePath={page.path} />}
              <PageProperties page={page} />
            </div>
          )}

          {page.data.code === true && <CodeFolder page={page} />}
          {typeof page.data.repo === 'string' && <RepoFiles page={page} />}
          {/* Daily notes ("Heute"): the day's sessions, exams, labs, tasks and deadlines. */}
          {daily && <DayOverview date={daily} />}
          {/* Module pages without the "related" block still show their sessions and lab dates. */}
          {isModuleRow && !/type:\s*related/.test(page.body) && (
            <div className="no-print mt-4 space-y-4 rounded-panel border border-line p-3">
              <ModuleSchedule module={page} />
            </div>
          )}

          <div className="mt-6">
            {source ? (
              <SourceEditor key={page.path} page={page} />
            ) : (
              <BlockEditor key={page.path} page={page} />
            )}
            {git?.deletedAtEnd && !source && (
              <div className="relative h-0" data-change="deleted">
                <ChangeMarker change="deleted" pagePath={page.path} />
              </div>
            )}
          </div>

          {page.database && !source && (
            <div className="mt-2" data-rail="box">
              <DatabaseView dbPath={page.path} />
            </div>
          )}

          {children.length > 0 && (
            <section aria-label={t('page.subpages')} className="no-print mt-10">
              <h2 className="mb-2 text-[13px] font-semibold text-ink-3">{t('page.subpages')}</h2>
              <ul className="grid gap-1 sm:grid-cols-2">
                {children.map((child) => (
                  <li key={child.path}>
                    <button
                      type="button"
                      onClick={() => openPage(child.path)}
                      className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left hover:bg-hover"
                    >
                      <PageIcon page={child} />
                      <span className="truncate">{child.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-label={t('page.backlinks')} className="no-print mt-10 border-t border-line pt-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink-3">
              <LinkIcon size={13} /> {t('page.backlinks')}{' '}
              <span className="font-normal">{backlinks.length || ''}</span>
            </h2>
            {backlinks.length === 0 ? (
              <p className="text-[13px] text-ink-3">{t('page.noBacklinks')}</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {backlinks.map((b) => (
                  <li key={b.path}>
                    <button
                      type="button"
                      onClick={() => openPage(b.path)}
                      className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[13px] hover:bg-hover"
                    >
                      <PageIcon page={b} size={13} />
                      {b.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-6 text-xs text-ink-3">
              {t('page.words', { count: wordCount(page.body) })} · {page.path}
            </p>
          </section>
        </article>
      </div>
      <PageRail contentRef={articleRef} body={page.body} embedded={embedded} />
    </div>
  )
}

function TitleInput({ title, onRename }: { title: string; onRename: (title: string) => void }) {
  // Remounted (key) when the title changes elsewhere, so local state never goes stale.
  const [value, setValue] = useState(title)
  const commit = () => {
    const next = value.trim()
    if (next && next !== title) onRename(next)
    else setValue(title)
  }
  return (
    <h1 className="m-0" data-rail="heading" data-level={1} data-label={title}>
      <input
        aria-label={t('page.titlePlaceholder')}
        value={value}
        placeholder={t('page.untitled')}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          }
          if (e.key === 'Escape') {
            setValue(title)
            e.currentTarget.blur()
          }
        }}
        className="w-full bg-transparent font-[family-name:var(--font-content)] text-[2.3rem] leading-tight font-bold tracking-tight text-ink outline-none placeholder:text-ink-3 max-sm:text-[1.8rem]"
      />
    </h1>
  )
}
