import { useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { ArrowDown, ArrowUp, Copy, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import { t } from '@/i18n'
import { blockType, type Block as BlockModel } from '@/lib/blocks'
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
const SPACING: Partial<Record<ReturnType<typeof blockType>, string>> = {
  heading: 'pt-5 pb-0.5',
  widget: 'py-2',
  divider: 'py-1',
}

export function Block({
  block,
  pagePath,
  editing,
  caret,
  actions,
  first,
}: {
  block: BlockModel
  pagePath: string
  editing: boolean
  caret?: Caret
  actions: BlockActions
  first: boolean
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
        'group/block relative -mx-2 rounded-control px-2',
        SPACING[type] ?? 'py-1',
        first && 'pt-0',
        !editing && !isWidget && 'cursor-text',
      )}
      data-block-id={block.id}
      onDragOver={onDragOver}
      onDragLeave={() => setDrop(null)}
      onDrop={(e) => {
        e.preventDefault()
        const id = e.dataTransfer.getData('application/x-notiva-block')
        if (id && id !== block.id) actions.onDropBlock(id, drop === 'after')
        setDrop(null)
      }}
    >
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
          'no-print absolute top-1 -left-14 flex items-center opacity-0 transition-opacity group-hover/block:opacity-100 focus-within:opacity-100 max-md:hidden',
          type === 'heading' && 'top-5',
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
        <p className="text-ink-3" onClick={onClick}>
          {t('editor.placeholder')}
        </p>
      ) : (
        <div onClick={onClick}>
          <MarkdownView markdown={block.text} from={pagePath} onToggleTask={actions.onToggleTask} />
        </div>
      )}
    </div>
  )
}
