import { useRef, useState, type DragEvent } from 'react'
import { ChevronRight, FileText, MoreHorizontal, Plus } from 'lucide-react'
import { useApp, useWorkspace } from '@/app/store'
import { usePageActions } from '@/app/hooks/usePageActions'
import { t } from '@/i18n'
import type { TreeNode } from '@/lib/workspace'
import { cx, IconButton, MenuList, Popover } from '@/components/ui'
import { PageIcon } from './PageIcon'
import { pageMenuItems } from './pageMenu'
import { useGit } from '@/app/git'
import { StatusLetter } from '@/components/git/GitPanel'

const EXPANDED_KEY = 'notiva.tree.expanded'

function loadExpanded(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

export function PageTree() {
  const ws = useWorkspace()
  const [expanded, setExpanded] = useState(loadExpanded)
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]))
      } catch {
        /* per-device convenience only */
      }
      return next
    })
  const tree = ws.tree()
  if (tree.length === 0) return <p className="px-3 py-2 text-[13px] text-ink-3">{t('tree.empty')}</p>
  return (
    <ul role="tree" aria-label={t('nav.pages')} className="space-y-px">
      {tree.map((node) => (
        <TreeItem key={node.id} node={node} depth={0} expanded={expanded} toggle={toggle} />
      ))}
    </ul>
  )
}

function TreeItem({
  node,
  depth,
  expanded,
  toggle,
}: {
  node: TreeNode
  depth: number
  expanded: Set<string>
  toggle: (id: string) => void
}) {
  const ws = useWorkspace()
  const actions = usePageActions(ws)
  const { route, openPage, navigate } = useApp()
  const [menu, setMenu] = useState(false)
  const [dropTarget, setDropTarget] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)
  const isOpen = expanded.has(node.id)
  const active =
    (route.name === 'page' && route.path === node.page?.path) ||
    (route.name === 'file' && route.path === node.file)
  const hasChildren = node.children.length > 0
  const folder = node.page ? node.page.path.slice(0, -3) : node.id
  const change = useGit((s) => {
    const path = node.page?.path ?? node.file
    return path ? s.state?.changes.find((c) => c.path === path) : undefined
  })
  const changedInside = useGit((s) => s.state?.changes.some((c) => c.path.startsWith(`${folder}/`)) ?? false)

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDropTarget(false)
    const path = e.dataTransfer.getData('application/x-notiva-page')
    if (path && path !== node.page?.path) void actions.moveTo(path, folder)
  }

  return (
    <li role="treeitem" aria-expanded={hasChildren ? isOpen : undefined} aria-selected={active}>
      <div
        className={cx(
          'group relative flex h-8 items-center gap-1 rounded-control pr-1 text-[14px] text-ink-2 hover:bg-hover',
          active && 'bg-[color-mix(in_srgb,var(--accent)_13%,transparent)] font-semibold text-ink',
          dropTarget && 'ring-2 ring-accent',
        )}
        style={{ paddingLeft: 4 + depth * 14 }}
        draggable={!!node.page}
        onDragStart={(e) => node.page && e.dataTransfer.setData('application/x-notiva-page', node.page.path)}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('application/x-notiva-page')) {
            e.preventDefault()
            setDropTarget(true)
          }
        }}
        onDragLeave={() => setDropTarget(false)}
        onDrop={onDrop}
      >
        <IconButton
          size="sm"
          label={isOpen ? t('tree.collapse') : t('tree.expand')}
          onClick={() => toggle(node.id)}
          className={cx(!hasChildren && 'invisible')}
          tabIndex={hasChildren ? 0 : -1}
        >
          <ChevronRight size={14} className={cx('transition-transform', isOpen && 'rotate-90')} />
        </IconButton>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 self-stretch text-left"
          onClick={() =>
            node.page
              ? openPage(node.page.path)
              : node.file
                ? navigate({ name: 'file', path: node.file })
                : toggle(node.id)
          }
        >
          {node.file ? (
            <FileText size={15} aria-hidden className="shrink-0 text-ink-3" />
          ) : (
            <PageIcon page={node.page} />
          )}
          <span
            className={cx(
              'truncate',
              change && (change.status === 'untracked' || change.status === 'added')
                ? 'text-[var(--git-added)]'
                : change && 'text-[var(--git-modified)]',
            )}
          >
            {node.title}
          </span>
        </button>
        {change ? (
          <StatusLetter status={change.status} />
        ) : (
          changedInside &&
          !isOpen && (
            <span aria-hidden className="mr-1 size-1.5 shrink-0 rounded-full bg-[var(--git-modified)]" />
          )
        )}
        <div className="flex opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100">
          {node.page && (
            <>
              <IconButton ref={moreRef} size="sm" label={t('tree.more')} onClick={() => setMenu((m) => !m)}>
                <MoreHorizontal size={14} />
              </IconButton>
              <IconButton
                size="sm"
                label={t('tree.addChild')}
                onClick={() => {
                  if (!isOpen) toggle(node.id)
                  void actions.createPage(folder)
                }}
              >
                <Plus size={14} />
              </IconButton>
            </>
          )}
        </div>
      </div>
      {node.page && (
        <Popover anchor={moreRef} open={menu} onClose={() => setMenu(false)} label={t('tree.more')}>
          <MenuList items={pageMenuItems(node.page.path, ws, actions)} onDone={() => setMenu(false)} />
        </Popover>
      )}
      {hasChildren && isOpen && (
        <ul role="group" className="space-y-px">
          {node.children.map((child) => (
            <TreeItem key={child.id} node={child} depth={depth + 1} expanded={expanded} toggle={toggle} />
          ))}
        </ul>
      )}
    </li>
  )
}
