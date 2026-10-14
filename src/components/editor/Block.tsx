import { useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { ArrowDown, ArrowUp, Copy, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import { t } from '@/i18n'
import { blockType, type Block as BlockModel } from '@/lib/blocks'
import type { BlockChange } from '@/lib/diff'
import { useGit } from '@/app/git'
import { cx, IconButton, MenuList, Popover } from '@/components/ui'
import { Widget } from '@/components/widgets/Widget'
import { MarkdownView } from './MarkdownView'
import { BlockInput, type BlockInputCallbacks, type Caret } from './BlockInput'

export interface BlockActions extends BlockInputCallbacks {
  onEdit(caret?: Caret): void
  onAddBelow(): void
  onDelete(): void
  onDuplicate(): void
  onMove(delta: number): void
  onToggleTask(index: number): void
  onDropBlock(id: string, after: boolean): void
}

const INTERACTIVE = 'a, button, input, summary, select, textarea, label, [data-interactive]'
/** How the block is drawn in the page rail's minimap (see PageRail). */
const RAIL_KIND: Partial<Record<ReturnType<typeof blockType>, string>> = {
  heading: 'heading',
  list: 'list',
  tasks: 'list',
  widget: 'box',
  code: 'box',
  math: 'box',
  table: 'box',
  callout: 'box',
  divider: 'divider',
}
/** Extra space inside a block; the 8 px between blocks come from {@link InsertGap}. */
const SPACING: Partial<Record<ReturnType<typeof blockType>, string>> = {
  heading: 'pt-4',
  widget: 'py-1',
}

export function Block({
  block,
  pagePath,
  editing,
  caret,
  actions,
  first,
  change,
}: {
  block: BlockModel
  pagePath: string
  editing: boolean
  caret?: Caret
  actions: BlockActions
  first: boolean
  /** Git: how this block differs from the last commit. */
  change?: BlockChange | undefined
}) {
  const [menu, setMenu] = useState(false)
  const [drop, setDrop] = useState<'before' | 'after' | null>(null)
  const grip = useRef<HTMLButtonElement>(null)
  const type = blockType(block.text)
  const isWidget = type === 'widget'

  const onClick = (e: MouseEvent) => {
    if (editing || isWidget) return
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return
    if (window.getSelection()?.toString()) return // user is selecting text to copy
    actions.onEdit('end')
  }

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('application/x-notiva-block')) return
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setDrop(e.clientY > rect.top + rect.height / 2 ? 'after' : 'before')
  }

  return (
    <div
      className={cx(
        'group/block relative -mx-2 rounded-control px-2 transition-colors',
        SPACING[type],
        first && 'pt-0',
        // The whole block area is a click target – and shows itself on hover.
        !editing && !isWidget && 'cursor-text hover:bg-hover',
        editing && !isWidget && 'bg-surface ring-1 ring-line-strong',
      )}
      onClick={onClick}
      data-block-id={block.id}
      {...(change ? { 'data-change': change } : {})}
      data-rail={RAIL_KIND[type] ?? 'text'}
      {...(type === 'heading' ? { 'data-level': /^#+/.exec(block.text.trimStart())![0].length } : {})}
      onDragOver={onDragOver}
      onDragLeave={() => setDrop(null)}
      onDrop={(e) => {
        e.preventDefault()
        const id = e.dataTransfer.getData('application/x-notiva-block')
        if (id && id !== block.id) actions.onDropBlock(id, drop === 'after')
        setDrop(null)
      }}
    >
      {change && <ChangeMarker change={change} pagePath={pagePath} />}
      {drop && (
        <div
          className={cx(
            'pointer-events-none absolute inset-x-2 h-0.5 rounded bg-accent',
            drop === 'before' ? 'top-0' : 'bottom-0',
          )}
        />
      )}
      <div
        className={cx(
          'no-print absolute top-0 -left-14 flex items-center opacity-0 transition-opacity group-hover/block:opacity-100 focus-within:opacity-100 max-md:hidden',
          type === 'heading' && 'top-4',
        )}
      >
        <IconButton size="sm" label={t('editor.addBlock')} onClick={actions.onAddBelow}>
          <Plus size={15} />
        </IconButton>
        <IconButton
          ref={grip}
          size="sm"
          label={t('editor.dragBlock')}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('application/x-notiva-block', block.id)
            e.dataTransfer.effectAllowed = 'move'
          }}
          onClick={() => setMenu(true)}
          className="cursor-grab"
        >
          <GripVertical size={15} />
        </IconButton>
      </div>
      <Popover anchor={grip} open={menu} onClose={() => setMenu(false)} label={t('editor.dragBlock')}>
        <MenuList
          onDone={() => setMenu(false)}
          items={[
            ...(isWidget
              ? [
                  {
                    label: t('editor.editWidget'),
                    icon: <Pencil size={14} />,
                    onSelect: () => actions.onEdit('end'),
                  },
                ]
              : []),
            { label: t('editor.moveUp'), icon: <ArrowUp size={14} />, onSelect: () => actions.onMove(-1) },
            { label: t('editor.moveDown'), icon: <ArrowDown size={14} />, onSelect: () => actions.onMove(1) },
            { label: t('editor.duplicateBlock'), icon: <Copy size={14} />, onSelect: actions.onDuplicate },
            'divider',
            {
              label: t('editor.deleteBlock'),
              icon: <Trash2 size={14} />,
              danger: true,
              onSelect: actions.onDelete,
            },
          ]}
        />
      </Popover>

      {editing ? (
        <div className={cx(isWidget && 'rounded-panel border border-line bg-sunken p-3')}>
          <BlockInput text={block.text} caret={caret} pagePath={pagePath} callbacks={actions} />
          {isWidget && <p className="mt-2 text-xs text-ink-3">Esc / ⌘↵ – {t('editor.done')}</p>}
        </div>
      ) : isWidget ? (
        <div className="relative">
          <Widget source={block.text} from={pagePath} />
          <IconButton
            size="sm"
            label={t('editor.editWidget')}
            onClick={() => actions.onEdit('end')}
            className="no-print absolute -top-1 right-0 bg-surface opacity-0 shadow-sm group-hover/block:opacity-100 focus:opacity-100 max-md:opacity-60"
          >
            <Pencil size={13} />
          </IconButton>
        </div>
      ) : block.text.trim() === '' ? (
        <p className="text-ink-3">{t('editor.placeholder')}</p>
      ) : (
        <MarkdownView markdown={block.text} from={pagePath} onToggleTask={actions.onToggleTask} />
      )}
    </div>
  )
}

/** The 8 px between two blocks: shows an insert line on hover and adds a paragraph there. */
export function InsertGap({ onInsert }: { onInsert: () => void }) {
  return (
    <button
      type="button"
      aria-label={t('editor.insertBelow')}
      onClick={onInsert}
      className="no-print group/gap flex h-2 w-full items-center opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 max-md:pointer-events-none [@media(pointer:coarse)]:pointer-events-none"
    >
      <span className="h-0.5 flex-1 rounded-full bg-accent/60" />
      <span className="mx-1.5 flex size-4 items-center justify-center rounded-full bg-accent text-on-accent">
        <Plus size={11} strokeWidth={3} />
      </span>
      <span className="h-0.5 flex-1 rounded-full bg-accent/60" />
    </button>
  )
}

/** Gutter marker like in VS Code: green = new, blue = changed, red wedge = something deleted here. */
export function ChangeMarker({ change, pagePath }: { change: BlockChange; pagePath: string }) {
  const showDiff = useGit((s) => s.showDiff)
  return (
    <button
      type="button"
      data-interactive
      aria-label={t(`git.gutter.${change}`)}
      title={t(`git.gutter.${change}`)}
      onClick={(e) => {
        e.stopPropagation()
        showDiff({ path: pagePath })
      }}
      className={cx(
        'no-print absolute -left-1.5 w-[3px] rounded-full transition-[width] hover:w-[5px]',
        change === 'deleted'
          ? 'top-0 h-0 w-0 rounded-none border-y-[5px] border-l-[6px] border-y-transparent border-l-[var(--git-deleted)] -translate-y-1/2'
          : 'inset-y-0.5',
        change === 'added' && 'bg-[var(--git-added)]',
        change === 'modified' &&
          'bg-[var(--git-modified)] bg-[repeating-linear-gradient(to_bottom,var(--git-modified)_0_3px,transparent_3px_5px)]',
      )}
    />
  )
}
