import { useEffect, useRef, useState } from 'react'
import { Code2, FileText, Link as LinkIcon, SmilePlus } from 'lucide-react'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { usePageActions } from '@/app/hooks/usePageActions'
import { t } from '@/i18n'
import { wordCount } from '@/lib/editing'
import { Button, cx, EmptyState, Popover } from '@/components/ui'
import { Topbar } from '@/components/layout/Topbar'
import { PageIcon } from '@/components/layout/PageIcon'
import { DatabaseView } from '@/components/database/DatabaseView'
import { BlockEditor } from './BlockEditor'
import { EmojiPicker } from './EmojiPicker'
import { PageProperties } from './PageProperties'
import { SourceEditor } from './SourceEditor'

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

export function PageView({ path }: { path: string }) {
  const ws = useWorkspace()
  const page = ws.get(path)
  const { openPage } = useApp()
  const run = useAction()
  const actions = usePageActions(ws)
  const [source, setSource] = useState(false)
  const [iconOpen, setIconOpen] = useState(false)
  const iconRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    document.title = page ? `${page.title} – Notiva` : 'Notiva'
  }, [page])

  if (!page) {
    return (
      <>
        <Topbar title="—" />
        <EmptyState title={t('page.notFound')} />
      </>
    )
  }

  const backlinks = ws.backlinks(page.path)
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

  return (
    <>
      <Topbar
        actions={
          <Button
            size="sm"
            variant="ghost"
            icon={source ? <FileText size={14} /> : <Code2 size={14} />}
            onClick={() => setSource((s) => !s)}
            aria-pressed={source}
            className="max-sm:hidden"
          >
            {source ? t('page.blocks') : t('page.source')}
          </Button>
        }
      />
      {cover && (
        <div
          aria-hidden
          className="no-print -mt-12 h-28"
          style={{
            background: `linear-gradient(180deg, ${cover}, color-mix(in srgb, ${cover} 35%, var(--paper)))`,
          }}
        />
      )}
      <article
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
              <EmojiPicker onPick={setIcon} {...(page.icon ? { onRemove: () => setIcon(undefined) } : {})} />
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
          <div className="mt-4 border-y border-line py-2">
            <PageProperties page={page} />
          </div>
        )}

        <div className="mt-6">
          {source ? (
            <SourceEditor key={page.path} page={page} />
          ) : (
            <BlockEditor key={page.path} page={page} />
          )}
        </div>

        {page.database && !source && (
          <div className="mt-2">
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
    </>
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
    <h1 className="m-0">
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
