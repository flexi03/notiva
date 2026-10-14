import { Fragment, useEffect, useMemo, useState } from 'react'
import { useGit } from '@/app/git'
import { useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { diffLines, diffStats, inlineDiff, pairChanges, toHunks, type DiffLine } from '@/lib/diff'
import { electronBridge } from '@/lib/vault'
import { Button, cx, Segmented, Sheet } from '@/components/ui'

const ROW: Record<DiffLine['type'], string> = {
  same: '',
  add: 'bg-[color-mix(in_srgb,var(--git-added)_16%,transparent)]',
  del: 'bg-[color-mix(in_srgb,var(--git-deleted)_14%,transparent)]',
}
const SIGN: Record<DiffLine['type'], string> = { same: ' ', add: '+', del: '−' }
const WORD: Record<'add' | 'del', string> = {
  add: 'rounded-[2px] bg-[color-mix(in_srgb,var(--git-added)_42%,transparent)]',
  del: 'rounded-[2px] bg-[color-mix(in_srgb,var(--git-deleted)_38%,transparent)]',
}

export function DiffStatsLabel({ added, removed }: { added: number; removed: number }) {
  return (
    <span className="shrink-0 text-[12px] tabular-nums">
      {added > 0 && <span className="text-[var(--git-added)]">+{added}</span>}
      {added > 0 && removed > 0 && ' '}
      {removed > 0 && <span className="text-[var(--git-deleted)]">−{removed}</span>}
    </span>
  )
}

/** Line diff like a code editor: unified (one column) or side by side, with collapsed context. */
export function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const [mode, setMode] = useState<'unified' | 'split'>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 1100 ? 'split' : 'unified',
  )
  const lines = useMemo(() => diffLines(oldText, newText), [oldText, newText])
  const hunks = useMemo(() => toHunks(lines, 3), [lines])
  const pairs = useMemo(() => pairChanges(lines), [lines])
  const stats = diffStats(lines)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-2">{t('git.stats', { added: stats.added, removed: stats.removed })}</p>
        <Segmented
          label={t('git.diffMode')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'unified', label: t('git.unified') },
            { value: 'split', label: t('git.split') },
          ]}
        />
      </div>
      {hunks.length === 0 ? (
        <p className="text-sm text-ink-3">{t('git.noDiff')}</p>
      ) : (
        <div className="overflow-x-auto rounded-panel border border-line bg-surface font-code text-[12.5px] leading-[1.6]">
          <table className="w-full border-collapse" aria-label={t('git.diff')}>
            <tbody>
              {hunks.map((hunk, i) => (
                <Fragment key={i}>
                  {hunk.skippedBefore > 0 && (
                    <tr>
                      <td
                        colSpan={mode === 'split' ? 4 : 3}
                        className="bg-sunken px-3 py-0.5 text-[11.5px] text-ink-3"
                      >
                        {t('git.skipped', { count: hunk.skippedBefore })}
                      </td>
                    </tr>
                  )}
                  {mode === 'unified'
                    ? hunk.lines.map((line, j) => (
                        <tr key={j} className={ROW[line.type]} data-diff={line.type}>
                          <LineNo n={line.oldNo} />
                          <LineNo n={line.newNo} />
                          <Code line={line} pair={pairs.get(line)} />
                        </tr>
                      ))
                    : pairRows(hunk.lines).map(([left, right], j) => (
                        <tr key={j}>
                          <LineNo n={left?.oldNo} />
                          <Code
                            line={left}
                            pair={left && pairs.get(left)}
                            className={left ? ROW[left.type] : 'bg-sunken'}
                          />
                          <LineNo n={right?.newNo} />
                          <Code
                            line={right}
                            pair={right && pairs.get(right)}
                            className={right ? ROW[right.type] : 'bg-sunken'}
                          />
                        </tr>
                      ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Side by side: removals on the left next to the additions that replaced them. */
function pairRows(lines: DiffLine[]): Array<[DiffLine | undefined, DiffLine | undefined]> {
  const rows: Array<[DiffLine | undefined, DiffLine | undefined]> = []
  let i = 0
  while (i < lines.length) {
    if (lines[i]!.type === 'same') {
      rows.push([lines[i], lines[i]])
      i++
      continue
    }
    const dels: DiffLine[] = []
    const adds: DiffLine[] = []
    while (i < lines.length && lines[i]!.type !== 'same') {
      ;(lines[i]!.type === 'del' ? dels : adds).push(lines[i]!)
      i++
    }
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) rows.push([dels[k], adds[k]])
  }
  return rows
}

function LineNo({ n }: { n: number | undefined }) {
  return (
    <td className="w-10 border-r border-line px-2 text-right align-top text-ink-3 select-none">{n ?? ''}</td>
  )
}

function Code({
  line,
  pair,
  className,
}: {
  line: DiffLine | undefined
  /** The line this one replaced (or was replaced by): only the changed words get highlighted. */
  pair?: DiffLine | undefined
  className?: string
}) {
  const words = useMemo(() => {
    if (!line || !pair || line.type === 'same') return null
    const inline = line.type === 'del' ? inlineDiff(line.text, pair.text) : inlineDiff(pair.text, line.text)
    return inline && (line.type === 'del' ? inline.old : inline.new)
  }, [line, pair])
  return (
    <td className={cx('px-2 align-top whitespace-pre-wrap break-all', className)}>
      {line && (
        <>
          <span
            aria-hidden
            className={cx(
              'mr-2 inline-block w-2 select-none',
              line.type === 'add' && 'text-[var(--git-added)]',
              line.type === 'del' && 'text-[var(--git-deleted)]',
            )}
          >
            {SIGN[line.type]}
          </span>
          <span className="sr-only">
            {line.type === 'add' ? t('git.added') : line.type === 'del' ? t('git.removed') : ''}
          </span>
          {words
            ? words.map((w, i) =>
                w.changed ? (
                  <mark
                    key={i}
                    data-word-change
                    className={cx('text-inherit', WORD[line.type as 'add' | 'del'])}
                  >
                    {w.text}
                  </mark>
                ) : (
                  <Fragment key={i}>{w.text}</Fragment>
                ),
              )
            : line.text || ' '}
        </>
      )}
    </td>
  )
}

/** Side panel with the diff of one file (store: useGit().diff). */
export function DiffSheet() {
  const target = useGit((s) => s.diff)
  const showDiff = useGit((s) => s.showDiff)
  const ws = useWorkspace()
  const openPage = useApp((s) => s.openPage)
  const key = target ? `${target.path}|${target.commit ?? ''}|${ws.version}` : ''
  const [loaded, setLoaded] = useState<{ key: string; old?: string; next?: string; error?: string } | null>(
    null,
  )

  useEffect(() => {
    const git = electronBridge()?.git
    if (!target || !git) return
    let cancelled = false
    void (async () => {
      try {
        const change = useGit.getState().state?.changes.find((c) => c.path === target.path)
        const [old, next] = target.commit
          ? await Promise.all([
              git.show(`${target.commit}^`, target.path),
              git.show(target.commit, target.path),
            ])
          : await Promise.all([
              useGit.getState().headText(change?.from ?? target.path),
              ws.vault.read(target.path).catch(() => null),
            ])
        if (!cancelled) setLoaded({ key, old: old ?? '', next: next ?? '' })
      } catch (e) {
        if (!cancelled) setLoaded({ key, error: e instanceof Error ? e.message : String(e) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [key, target, ws])

  const texts =
    loaded?.key === key && loaded.error === undefined ? { old: loaded.old!, next: loaded.next! } : null
  const error = loaded?.key === key ? (loaded.error ?? null) : null

  if (!target) return null
  const page = ws.get(target.path)
  return (
    <Sheet
      open
      onClose={() => showDiff(null)}
      title={`${t('git.diffOf')} ${target.path}${target.commit ? ` @ ${target.commit.slice(0, 7)}` : ''}`}
      closeLabel={t('common.close')}
      actions={
        page && (
          <Button size="sm" variant="ghost" onClick={() => openPage(page.path)}>
            {t('git.openPage')}
          </Button>
        )
      }
    >
      <div className="p-4 sm:p-6">
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : texts ? (
          <DiffView oldText={texts.old} newText={texts.next} />
        ) : (
          <p className="text-sm text-ink-3">{t('common.loading')}</p>
        )}
      </div>
    </Sheet>
  )
}
