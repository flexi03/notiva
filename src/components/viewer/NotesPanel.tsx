import { MarkdownView } from '@/components/editor/MarkdownView'
import { ResizeHandle, useStoredWidth } from '@/components/layout/ResizeHandle'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Highlighter, PenLine, StickyNote, Trash2, Type } from 'lucide-react'
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
  // Notes and commented highlights in full; plain colour marks compact in a closed list.
  const isMark = (a: Annotation) =>
    a.type === 'ink' || (a.type === 'highlight' && !a.comment?.trim() && a.id !== activeId)
  const detailed = sorted.filter((a) => !isMark(a))
  const marks = sorted.filter(isMark)
  const activeRef = useRef<HTMLLIElement>(null)
  const [width, setWidth] = useStoredWidth('pdf-notes', 320, 240, 720)
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  return (
    <aside
      aria-label={t('viewer.notes')}
      style={{ width }}
      className="relative flex h-full min-h-0 shrink-0 flex-col border-l border-line bg-surface max-[899px]:hidden"
    >
      <ResizeHandle side="left" width={width} onResize={setWidth} label={t('viewer.notes')} />
      {children}
      <section
        aria-label={t('viewer.pageNote', { page })}
        className="max-h-[45%] shrink-0 overflow-y-auto border-b border-line p-3"
      >
        <h2 className="mb-1.5 text-[13px] font-semibold text-ink-2">{t('viewer.pageNote', { page })}</h2>
        <PageNoteEditor key={page} value={pageNote} onSave={onPageNote} />
      </section>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <p className="p-3 text-[13px] text-ink-3">{t('viewer.noAnnotations')}</p>
        ) : (
          <>
            {detailed.length > 0 && (
              <ul aria-label={t('viewer.annotations')} className="divide-y divide-line">
                {detailed.map((a) => (
                  <AnnotationItem
                    key={a.id}
                    a={a}
                    active={a.id === activeId}
                    itemRef={a.id === activeId ? activeRef : undefined}
                    onActivate={onActivate}
                    onJump={onJump}
                    onUpdate={onUpdate}
                    onRemove={onRemove}
                  />
                ))}
              </ul>
            )}
            {marks.length > 0 && (
              <details className="border-t border-line" open={marks.some((a) => a.id === activeId)}>
                <summary className="cursor-pointer px-3 py-2 text-[12.5px] font-semibold text-ink-2">
                  {t('viewer.marks', { count: marks.length })}
                </summary>
                <ul aria-label={t('viewer.marksList')} className="pb-1">
                  {marks.map((a) => (
                    <li
                      key={a.id}
                      className={cx(
                        'group flex items-center gap-1.5 px-3 py-0.5',
                        a.id === activeId && 'bg-hover',
                      )}
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: COLOR_VALUES[a.color] }}
                        aria-hidden
                      />
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left text-[12px] text-ink-2"
                        title={a.type === 'highlight' ? a.text : undefined}
                        onClick={() => {
                          onActivate(a.id)
                          onJump(a.page)
                        }}
                      >
                        <span className="text-ink-3">S. {a.page}</span>{' '}
                        {a.type === 'highlight' ? a.text : t('viewer.drawing')}
                      </button>
                      <IconButton
                        size="sm"
                        label={t('viewer.remove')}
                        onClick={() => onRemove(a.id)}
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      >
                        <Trash2 size={12} />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
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
  const [editing, setEditing] = useState(!value)
  if (!editing && text.trim())
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={t('viewer.pageNoteLabel')}
        title={t('viewer.clickToEdit')}
        onClick={(e) => (e.target as HTMLElement).closest('a') || setEditing(true)}
        onKeyDown={(e) => e.key === 'Enter' && setEditing(true)}
        className="cursor-text rounded-control px-1 hover:bg-hover"
      >
        <MarkdownView markdown={text} untrusted className="md text-[13px]" />
      </div>
    )
  return (
    <AutoTextArea
      autoFocus={!!value}
      onBlur={() => setEditing(false)}
      aria-label={t('viewer.pageNoteLabel')}
      placeholder={t('viewer.pageNotePlaceholder')}
      value={text}
      onChange={(e) => {
        const next = e.target.value
        setText(next)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => onSave(next), 700)
      }}
      className="max-h-[40vh] min-h-20 w-full rounded-control border border-line bg-surface px-2 py-1.5 text-[13px] focus:border-accent focus:outline-none"
    />
  )
}

/** One note / commented highlight: formatted text; edit on click (or right away when empty). */
function AnnotationItem({
  a,
  active,
  itemRef,
  onActivate,
  onJump,
  onUpdate,
  onRemove,
}: {
  a: Annotation
  active: boolean
  itemRef: React.Ref<HTMLLIElement> | undefined
  onActivate: (id: string) => void
  onJump: (page: number) => void
  onUpdate: (id: string, patch: Partial<Annotation>) => void
  onRemove: (id: string) => void
}) {
  const field = a.type === 'note' || a.type === 'text' ? 'text' : 'comment'
  const saved = (field === 'text' ? (a as { text?: string }).text : (a as { comment?: string }).comment) ?? ''
  // Shown right after leaving the field – before the file round trip is back.
  const [value, setValue] = useState(saved)
  const [editing, setEditing] = useState(false)
  const [seen, setSeen] = useState(saved)
  if (seen !== saved) {
    setSeen(saved)
    setValue(saved)
  }
  const editable = a.type === 'note' || a.type === 'highlight'
  return (
    <li ref={itemRef} className={cx('group p-3', active && 'bg-hover')}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0" style={{ color: COLOR_VALUES[a.color] }} aria-hidden>
          {a.type === 'highlight' ? (
            <Highlighter size={15} />
          ) : a.type === 'note' ? (
            <StickyNote size={15} />
          ) : a.type === 'text' ? (
            <Type size={15} />
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
          <span className="block text-[11.5px] text-ink-3">{t('viewer.onPage', { page: a.page })}</span>
          {a.type === 'highlight' && (
            <span className="line-clamp-2 block text-[12.5px] text-ink-2">„{a.text ?? ''}“</span>
          )}
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
      {editable && (editing || (active && !value)) ? (
        <AutoTextArea
          autoFocus
          aria-label={a.type === 'note' ? t('viewer.noteText') : t('viewer.comment')}
          placeholder={a.type === 'note' ? t('viewer.noteText') : t('viewer.comment')}
          defaultValue={value}
          onBlur={(e) => {
            const next = e.target.value.trim()
            setEditing(false)
            setValue(next)
            if (next !== saved) onUpdate(a.id, { [field]: next } as Partial<Annotation>)
          }}
          className="mt-2 max-h-[40vh] w-full rounded-control border border-line bg-surface px-2 py-1.5 text-[13px] focus:border-accent focus:outline-none"
        />
      ) : value && a.type === 'highlight' && !active ? (
        // The full comment is shown at the text in the PDF – here just one line.
        <p className="mt-0.5 truncate pl-6 text-[12.5px] text-ink-2">
          {value
            .replace(/[`*#>_]/g, '')
            .split('\n')
            .find(Boolean)}
        </p>
      ) : value ? (
        <div
          role={editable ? 'button' : undefined}
          tabIndex={editable ? 0 : undefined}
          title={editable ? t('viewer.clickToEdit') : undefined}
          onClick={(e) => editable && !(e.target as HTMLElement).closest('a,button') && setEditing(true)}
          onKeyDown={(e) => editable && e.key === 'Enter' && setEditing(true)}
          className={cx('mt-1 pl-6', editable && 'cursor-text rounded-control hover:bg-hover')}
        >
          <MarkdownView markdown={value} untrusted className="md text-[13px]" />
        </div>
      ) : null}
    </li>
  )
}
