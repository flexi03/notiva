import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Highlighter, PenLine, StickyNote, Trash2 } from 'lucide-react'
import { useApp } from '@/app/store'
import { t } from '@/i18n'
import type { Annotation } from '@/lib/annotations'
import { AutoTextArea, cx, IconButton } from '@/components/ui'
import { COLOR_VALUES } from './AnnotationLayer'

/**
 * Notes next to a PDF: a free note for the current page and all highlights, sticky notes and
 * drawings by page – click one to jump there.
 */
export function NotesPanel({
  page,
  pageNote,
  onPageNote,
  annotations,
  activeId,
  onActivate,
  onUpdate,
  onRemove,
  onJump,
  notesPath,
  children,
}: {
  page: number
  pageNote: string
  onPageNote: (text: string) => void
  annotations: Annotation[]
  activeId: string | null
  onActivate: (id: string) => void
  onUpdate: (id: string, patch: Partial<Annotation>) => void
  onRemove: (id: string) => void
  onJump: (page: number) => void
  notesPath: string | null
  children?: React.ReactNode
}) {
  const openPage = useApp((s) => s.openPage)
  const sorted = [...annotations].sort((a, b) => a.page - b.page)
  const activeRef = useRef<HTMLLIElement>(null)
  useEffect(() => activeRef.current?.scrollIntoView({ block: 'nearest' }), [activeId])

  return (
    <aside
      aria-label={t('viewer.notes')}
      className="flex w-80 shrink-0 flex-col border-l border-line bg-surface max-[899px]:hidden"
    >
      {children}
      <section aria-label={t('viewer.pageNote', { page })} className="border-b border-line p-3">
        <h2 className="mb-1.5 text-[13px] font-semibold text-ink-2">{t('viewer.pageNote', { page })}</h2>
        <PageNoteEditor key={page} value={pageNote} onSave={onPageNote} />
      </section>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <p className="p-3 text-[13px] text-ink-3">{t('viewer.noAnnotations')}</p>
        ) : (
          <ul aria-label={t('viewer.annotations')} className="divide-y divide-line">
            {sorted.map((a) => (
              <li
                key={a.id}
                ref={a.id === activeId ? activeRef : undefined}
                className={cx('group p-3', a.id === activeId && 'bg-hover')}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0" style={{ color: COLOR_VALUES[a.color] }} aria-hidden>
                    {a.type === 'highlight' ? (
                      <Highlighter size={15} />
                    ) : a.type === 'note' ? (
                      <StickyNote size={15} />
                    ) : (
                      <PenLine size={15} />
                    )}
                  </span>
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      onActivate(a.id)
                      onJump(a.page)
                    }}
                  >
                    <span className="block text-[11.5px] text-ink-3">
                      {t('viewer.onPage', { page: a.page })}
                    </span>
                    <span className="line-clamp-3 block text-[13px]">
                      {a.type === 'highlight'
                        ? `„${a.text ?? ''}“`
                        : a.type === 'note'
                          ? a.text || t('viewer.emptyNote')
                          : t('viewer.drawing')}
                    </span>
                  </button>
                  <IconButton
                    size="sm"
                    label={t('viewer.remove')}
                    onClick={() => onRemove(a.id)}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </div>
                {a.id === activeId && a.type !== 'ink' && (
                  <AutoTextArea
                    autoFocus={a.type === 'note' && !a.text}
                    aria-label={a.type === 'note' ? t('viewer.noteText') : t('viewer.comment')}
                    placeholder={a.type === 'note' ? t('viewer.noteText') : t('viewer.comment')}
                    defaultValue={a.type === 'note' ? a.text : (a.comment ?? '')}
                    onBlur={(e) => {
                      const value = e.target.value.trim()
                      if (a.type === 'note' ? value !== a.text : value !== (a.comment ?? ''))
                        onUpdate(a.id, a.type === 'note' ? { text: value } : { comment: value })
                    }}
                    className="mt-2 w-full rounded-control border border-line bg-surface px-2 py-1.5 text-[13px] focus:border-accent focus:outline-none"
                  />
                )}
                {a.id !== activeId && a.type === 'highlight' && a.comment && (
                  <p className="mt-1 pl-6 text-[12.5px] text-ink-2">{a.comment}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {notesPath && (
        <button
          type="button"
          onClick={() => openPage(notesPath)}
          className="border-t border-line p-2.5 text-left text-[13px] font-semibold text-accent hover:bg-hover"
        >
          {t('viewer.openNotesPage')}
        </button>
      )}
    </aside>
  )
}

/** Page note with a short delay before saving, saved on leaving too. */
function PageNoteEditor({ value, onSave }: { value: string; onSave: (text: string) => void }) {
  const [text, setText] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef({ text, value, onSave })
  useLayoutEffect(() => {
    latest.current = { text, value, onSave }
  })
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      const l = latest.current
      if (l.text !== l.value) l.onSave(l.text)
    },
    [],
  )
  return (
    <AutoTextArea
      aria-label={t('viewer.pageNoteLabel')}
      placeholder={t('viewer.pageNotePlaceholder')}
      value={text}
      onChange={(e) => {
        const next = e.target.value
        setText(next)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => onSave(next), 700)
      }}
      className="min-h-20 w-full rounded-control border border-line bg-surface px-2 py-1.5 text-[13px] focus:border-accent focus:outline-none"
    />
  )
}
