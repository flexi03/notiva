import type { CSSProperties, ReactNode } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { formatDate, parseDate } from '@/lib/dates'
import { computeTile, type TileResult, type TileSpec, type WidgetSpec } from '@/lib/widgets'
import { cx, MarkerBar } from '@/components/ui'
import { MarkdownView } from '@/components/editor/MarkdownView'

export function Tiles({ spec, from }: { spec: Extract<WidgetSpec, { type: 'tiles' }>; from: string }) {
  const ws = useWorkspace()
  const columns = spec.columns ?? 4
  return (
    <div className="tiles grid gap-3" style={{ '--cols': columns } as CSSProperties} data-interactive>
      {spec.tiles.map((tile, i) => (
        <Tile key={i} tile={tile} result={computeTile(ws, tile, from)} columns={columns} />
      ))}
    </div>
  )
}

function Tile({ tile, result, columns }: { tile: TileSpec; result: TileResult; columns: number }) {
  const openEntry = useApp((s) => s.openEntry)
  const span = Math.max(1, Math.min(columns, tile.span ?? 1))
  const style = { gridColumn: `span ${span} / span ${span}` }

  if (result.kind === 'link') {
    return (
      <button
        type="button"
        style={style}
        data-span={span}
        disabled={!result.path}
        onClick={(e) => result.path && openEntry(result.path, e)}
        className="tile group flex min-h-24 flex-col justify-between rounded-panel bg-sunken p-3 text-left transition-colors hover:bg-hover disabled:opacity-60"
      >
        <span className="flex w-full items-start justify-between text-2xl" aria-hidden>
          <span>{result.icon ?? '📄'}</span>
          <ArrowUpRight
            size={15}
            className="text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          />
        </span>
        <span>
          <span className="block font-bold">{result.title}</span>
          {result.description && <span className="block text-[13px] text-ink-2">{result.description}</span>}
        </span>
      </button>
    )
  }

  return (
    <section
      style={style}
      data-span={span}
      aria-label={tile.title}
      className="tile flex min-h-24 flex-col gap-2 rounded-panel border border-line bg-surface p-3"
    >
      {tile.title && (
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-2">
          {tile.icon && <span aria-hidden>{tile.icon}</span>}
          {tile.title}
        </h3>
      )}
      <TileBody result={result} />
    </section>
  )
}

function Big({ children, small }: { children: ReactNode; small?: ReactNode }) {
  return (
    <p className="mt-auto flex items-baseline gap-1.5">
      <span className="text-[1.75rem] leading-none font-bold tracking-tight tabular-nums">{children}</span>
      {small && <span className="min-w-0 truncate text-[13px] text-ink-2">{small}</span>}
    </p>
  )
}

function TileBody({ result }: { result: TileResult }) {
  const openEntry = useApp((s) => s.openEntry)
  switch (result.kind) {
    case 'error':
      return <p className="text-[13px] text-danger">{result.message}</p>
    case 'value':
      return <Big>{result.value}</Big>
    case 'progress':
      return (
        <div className="mt-auto space-y-1.5">
          <Big small={`/ ${result.label.split(' / ')[1]} · ${result.percent} %`}>
            {result.label.split(' / ')[0]}
          </Big>
          <MarkerBar percent={result.percent} label={result.label} />
        </div>
      )
    case 'week':
      return (
        <div className="mt-auto space-y-1.5">
          {result.week >= 1 && (!result.total || result.week <= result.total) ? (
            <Big small={result.total ? t('tile.weekOf', { total: result.total }) : t('tile.week')}>
              {result.week}
            </Big>
          ) : (
            <p className="mt-auto text-sm text-ink-2">{result.label}</p>
          )}
          {result.total && result.week >= 1 && result.week <= result.total && (
            <div className="flex gap-0.5" aria-hidden>
              {Array.from({ length: result.total }, (_, i) => (
                <span
                  key={i}
                  className={cx('h-1.5 flex-1 rounded-full', i < result.week ? 'bg-marker' : 'bg-sunken')}
                />
              ))}
            </div>
          )}
        </div>
      )
    case 'countdown': {
      if (result.days === null) return <p className="mt-auto text-sm text-ink-3">{t('tile.nothing')}</p>
      const date = result.date ? parseDate(result.date) : null
      const dateText = date ? formatDate(date, 'DD.MM.') : ''
      return (
        <div className="mt-auto">
          {result.days === 0 ? (
            <Big small={dateText}>{t('tile.today')}</Big>
          ) : (
            <Big small={`${t(result.days === 1 ? 'tile.day' : 'tile.daysUnit')} · ${dateText}`}>
              {result.days}
            </Big>
          )}
          <button
            type="button"
            onClick={(e) => result.path && openEntry(result.path, e)}
            className="mt-1 block max-w-full truncate text-left text-[13.5px] font-semibold text-ink hover:underline hover:decoration-marker hover:decoration-2 hover:underline-offset-4"
          >
            {result.label}
          </button>
        </div>
      )
    }
    case 'list':
      if (result.items.length === 0) return <p className="text-sm text-ink-3">{t('tile.empty')}</p>
      return (
        <ul className="space-y-0.5">
          {result.items.map((item) => (
            <li key={item.path}>
              <button
                type="button"
                onClick={(e) => openEntry(item.path, e)}
                className="flex w-full items-baseline gap-2 rounded-[5px] px-1 py-0.5 text-left text-[14px] hover:bg-hover"
              >
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                {item.detail && (
                  <span className="shrink-0 text-[12.5px] text-ink-3 tabular-nums">{item.detail}</span>
                )}
              </button>
            </li>
          ))}
          {result.total > result.items.length && (
            <li className="px-1 text-xs text-ink-3">
              {t('tile.more', { count: result.total - result.items.length })}
            </li>
          )}
        </ul>
      )
    case 'text':
      return <MarkdownView markdown={result.text} className="flow text-[14px]" />
    default:
      return null
  }
}
