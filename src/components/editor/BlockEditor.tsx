import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAction, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import {
  blockType,
  joinBlocks,
  moveBlock,
  newBlockId,
  splitBlocks,
  toggleTask,
  type Block as BlockModel,
} from '@/lib/blocks'
import type { Page } from '@/lib/workspace'
import { Block, type BlockActions } from './Block'
import type { Caret } from './BlockInput'

const SAVE_DELAY = 400

/**
 * Notion-like editing over Markdown: the body is split into top-level blocks; one block at a
 * time is edited as raw Markdown, all others are rendered. Saves are debounced and flushed on
 * unmount, so nothing typed is lost when navigating away.
 */
export function BlockEditor({ page }: { page: Page }) {
  const ws = useWorkspace()
  const run = useAction()
  const [blocks, setBlocks] = useState<BlockModel[]>(() => splitBlocks(page.body))
  const [editing, setEditing] = useState<{ id: string; caret?: Caret } | null>(null)
  const saved = useRef(page.body)
  const pending = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Latest blocks for event handlers; commit() updates it synchronously, the effect covers resets.
  const blocksRef = useRef(blocks)
  useLayoutEffect(() => {
    blocksRef.current = blocks
  }, [blocks])

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    const body = pending.current
    if (body === null) return
    pending.current = null
    saved.current = body
    void run(() => ws.save(page.path, { body }))
  }, [ws, page.path, run])

  useEffect(() => () => flush(), [flush])

  // Pick up changes made elsewhere (source mode, other window, sync) while not editing.
  useEffect(() => {
    if (page.body !== saved.current && pending.current === null && !editing) {
      saved.current = page.body
      setBlocks(splitBlocks(page.body))
    }
  }, [page.body, editing])

  const commit = (next: BlockModel[], immediate = false) => {
    blocksRef.current = next
    setBlocks(next)
    const body = joinBlocks(next)
    if (body === saved.current) {
      pending.current = null
      return
    }
    pending.current = body
    clearTimeout(timer.current)
    if (immediate) flush()
    else timer.current = setTimeout(flush, SAVE_DELAY)
  }

  const index = (id: string) => blocksRef.current.findIndex((b) => b.id === id)
  const insertAt = (at: number, text: string, caret: Caret = 'start') => {
    const block = { id: newBlockId(), text }
    const next = blocksRef.current.slice()
    next.splice(at, 0, block)
    commit(next)
    setEditing({ id: block.id, caret })
  }

  const actionsFor = (block: BlockModel): BlockActions => ({
    onEdit: (caret) => setEditing({ id: block.id, ...(caret !== undefined ? { caret } : {}) }),
    onChange: (text) => commit(blocksRef.current.map((b) => (b.id === block.id ? { ...b, text } : b))),
    onSplit: (before, after) => {
      const i = index(block.id)
      const next = blocksRef.current.map((b) => (b.id === block.id ? { ...b, text: before } : b))
      const created = { id: newBlockId(), text: after }
      next.splice(i + 1, 0, created)
      commit(next)
      setEditing({ id: created.id, caret: 'start' })
    },
    onInsertBlock: (text, caret) => insertAt(index(block.id) + 1, text, caret ?? 'end'),
    onMergeUp: (text) => {
      const i = index(block.id)
      const prev = blocksRef.current[i - 1]
      if (!prev) return
      const prevType = blockType(prev.text)
      if (text.trim() === '') {
        commit(blocksRef.current.filter((b) => b.id !== block.id))
        setEditing({ id: prev.id, caret: 'end' })
      } else if (
        prevType !== 'widget' &&
        prevType !== 'code' &&
        prevType !== 'math' &&
        prevType !== 'divider'
      ) {
        const joined = prev.text + text
        commit(
          blocksRef.current
            .filter((b) => b.id !== block.id)
            .map((b) => (b.id === prev.id ? { ...b, text: joined } : b)),
        )
        setEditing({ id: prev.id, caret: prev.text.length })
      }
    },
    onFocusPrev: () => {
      const prev = blocksRef.current[index(block.id) - 1]
      if (prev) setEditing({ id: prev.id, caret: 'end' })
    },
    onFocusNext: () => {
      const next = blocksRef.current[index(block.id) + 1]
      if (next) setEditing({ id: next.id, caret: 'start' })
    },
    onDone: () => {
      setEditing((current) => (current?.id === block.id ? null : current))
      const current = blocksRef.current.find((b) => b.id === block.id)
      if (current && current.text.trim() === '') commit(blocksRef.current.filter((b) => b.id !== block.id))
      flush()
    },
    onAddBelow: () => insertAt(index(block.id) + 1, ''),
    onDelete: () =>
      commit(
        blocksRef.current.filter((b) => b.id !== block.id),
        true,
      ),
    onDuplicate: () => {
      const i = index(block.id)
      const next = blocksRef.current.slice()
      next.splice(i + 1, 0, { id: newBlockId(), text: block.text })
      commit(next, true)
    },
    onMove: (delta) => {
      const i = index(block.id)
      commit(moveBlock(blocksRef.current, i, i + delta), true)
    },
    onToggleTask: (taskIndex) =>
      commit(
        blocksRef.current.map((b) => (b.id === block.id ? { ...b, text: toggleTask(b.text, taskIndex) } : b)),
        true,
      ),
    onDropBlock: (id, after) => {
      const from = index(id)
      let to = index(block.id) + (after ? 1 : 0)
      if (from < to) to -= 1
      commit(moveBlock(blocksRef.current, from, to), true)
    },
  })

  return (
    <div className="pb-8" aria-label={t('page.blocks')}>
      {blocks.map((block, i) => (
        <Block
          key={block.id}
          block={block}
          pagePath={page.path}
          first={i === 0}
          editing={editing?.id === block.id}
          {...(editing?.id === block.id && editing.caret !== undefined ? { caret: editing.caret } : {})}
          actions={actionsFor(block)}
        />
      ))}
      <button
        type="button"
        className="no-print mt-1 block min-h-24 w-full cursor-text text-left text-ink-3"
        aria-label={t('editor.addBlock')}
        onClick={() => {
          const last = blocks[blocks.length - 1]
          if (last && last.text.trim() === '') setEditing({ id: last.id, caret: 'end' })
          else insertAt(blocks.length, '')
        }}
      >
        {blocks.length === 0 ? t('editor.emptyPage') : ''}
      </button>
    </div>
  )
}
