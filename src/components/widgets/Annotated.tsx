import { FileText } from 'lucide-react'
import { useApp, useWorkspace } from '@/app/store'
import { getLanguage, t } from '@/i18n'
import { annotatedPdfs } from '@/lib/semesterView'

/** "Bearbeitete PDFs": every PDF with own highlights or notes, newest first. */
export function Annotated() {
  const ws = useWorkspace()
  const navigate = useApp((s) => s.navigate)
  const openEntry = useApp((s) => s.openEntry)
  const list = annotatedPdfs(ws)
  const locale = getLanguage() === 'de' ? 'de-DE' : 'en-US'
  if (!list.length) return <p className="text-sm text-ink-3">{t('annotated.empty')}</p>
  return (
    <ul aria-label={t('semester.annotated')} className="space-y-0.5" data-interactive>
      {list.slice(0, 100).map((a) => (
        <li key={a.pdf} className="flex items-center gap-2 text-sm">
          <FileText size={14} className="shrink-0 text-ink-3" />
          <button
            type="button"
            className="min-w-0 truncate text-left hover:underline"
            title={a.pdf}
            onClick={() => navigate({ name: 'file', path: a.pdf })}
          >
            {a.pdf.split('/').pop()}
          </button>
          <button
            type="button"
            className="shrink-0 text-[12px] text-accent hover:underline"
            onClick={(e) => openEntry(a.notes, e)}
          >
            {t('annotated.notes')}
          </button>
          <span className="ml-auto shrink-0 text-[12px] text-ink-3">
            {new Date(a.mtime).toLocaleDateString(locale)}
          </span>
        </li>
      ))}
    </ul>
  )
}
