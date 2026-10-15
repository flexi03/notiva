import { FileText, Highlighter, Files, ScrollText } from 'lucide-react'
import { useAiContext } from '@/app/aiContext'
import { useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { cx } from '@/components/ui'

/** What goes along with the next question – click to switch a part on or off. */
export function ContextBar() {
  const ws = useWorkspace()
  const route = useApp((s) => s.route)
  const peek = useApp((s) => s.peek)
  const { file, include, toggle } = useAiContext()
  const page = ws.get(peek ?? (route.name === 'page' ? route.path : '')) ?? null
  const pdf = route.name === 'file' && file?.path === route.path && /\.pdf$/i.test(file.path) ? file : null
  const chip = (on: boolean, label: string, icon: React.ReactNode, key: Parameters<typeof toggle>[0]) => (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => toggle(key)}
      className={cx(
        'flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[12px]',
        on
          ? 'border-accent bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-ink'
          : 'border-line text-ink-3 line-through',
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  )
  if (!page && !pdf) return null
  const name = pdf?.path.split('/').pop() ?? ''
  return (
    <div className="flex flex-wrap items-center gap-1 px-1 pb-1.5" aria-label={t('ai.context')}>
      <span className="text-[11.5px] text-ink-3">{t('ai.context')}:</span>
      {page && chip(include.page, page.title, <FileText size={11} />, 'page')}
      {pdf &&
        chip(
          include.pdfPage && !include.pdfAll,
          t('ai.ctxPdfPage', { name, page: pdf.page }),
          <ScrollText size={11} />,
          'pdfPage',
        )}
      {pdf && chip(include.pdfAll, t('ai.ctxPdfAll', { name }), <Files size={11} />, 'pdfAll')}
      {pdf && chip(include.marks, t('ai.ctxMarks'), <Highlighter size={11} />, 'marks')}
    </div>
  )
}
