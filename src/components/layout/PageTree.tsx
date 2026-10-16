import { useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { create } from 'zustand'
import { ChevronRight, FileText, FolderOpen, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { useApp, useWorkspace } from '@/app/store'
import { usePageActions } from '@/app/hooks/usePageActions'
import { t } from '@/i18n'
import type { TreeNode } from '@/lib/workspace'
import { cx, IconButton, MenuList, Popover, type MenuItem } from '@/components/ui'
import { electronBridge } from '@/lib/vault'
import { PageIcon } from './PageIcon'
import { pageMenuItems } from './pageMenu'
import { useGit } from '@/app/git'
import { StatusLetter } from '@/components/git/GitPanel'
import { canMove, moveEntries, outermost, restoreEntries, trashEntries, trashLabel } from '@/app/treeActions'
import type { Workspace } from '@/lib/workspace'

/** Several entries chosen with ⌘/Ctrl (one by one) or Shift (a range) – moved or trashed together. */
const useTreeSelection = create<{ selected: Set<string>; anchor: string | null }>(() => ({
  selected: new Set(),
  anchor: null,
}))
const ITEMS = 'application/x-notiva-items'
const PAGE = 'application/x-notiva-page'

/** The ids as they are visible (opened folders only) – for Shift ranges. */
function visibleIds(nodes: TreeNode[], expanded: Set<string>): string[] {
  return nodes.flatMap((n) => [n.id, ...(expanded.has(n.id) ? visibleIds(n.children, expanded) : [])])
}

/** Asks, moves the entries into the trash (Moodle files among them are not offered again), offers undo. */
async function askTrash(ws: Workspace, paths: string[], name: string): Promise<void> {
  const list = outermost(paths)
  const ok = await useApp.getState().ask({
    title:
      list.length === 1 ? t('tree.trashTitle', { name }) : t('tree.trashManyTitle', { count: list.length }),
    label: trashLabel(ws, list),
    confirmLabel: t('tree.toTrash'),
    confirm: true,
    danger: true,
  })
  if (ok === null) return
  const entries = await trashEntries(ws, list)
  useTreeSelection.setState({ selected: new Set(), anchor: null })
  useApp
    .getState()
    .showToast(
      list.length === 1 ? t('tree.trashed', { name }) : t('tree.trashedMany', { count: list.length }),
      {
        label: t('page.undo'),
        run: () => void restoreEntries(ws, entries),
      },
    )
}

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
  // Like VS Code: the open page or file is revealed – its folders open in the tree.
  const route = useApp((s) => s.route)
  const openPath = route.name === 'page' || route.name === 'file' ? route.path : null
  // (Adjusted while rendering, once per opened path – React's pattern for state that follows a prop.)
  const [revealed, setRevealed] = useState<string | null>(null)
  if (openPath && openPath !== revealed) {
    setRevealed(openPath)
    const ids: string[] = []
    let dir = openPath
    while (dir.includes('/')) {
      dir = dir.slice(0, dir.lastIndexOf('/'))
      ids.push(ws.get(`${dir}.md`) ? `${dir}.md` : dir)
    }
    // A notes page sits under its PDF: open that too.
    const pdf = ws.get(openPath)?.data.pdf
    if (typeof pdf === 'string') ids.push(`${openPath.slice(0, openPath.lastIndexOf('/') + 1)}${pdf}`)
    setExpanded((prev) => (ids.every((id) => prev.has(id)) ? prev : new Set([...prev, ...ids])))
  }
  const tree = ws.tree()
  if (tree.length === 0) return <p className="px-3 py-2 text-[13px] text-ink-3">{t('tree.empty')}</p>
  return (
    <ul
      role="tree"
      aria-label={t('nav.pages')}
      aria-multiselectable
      className="space-y-px"
      onKeyDown={(e) => {
        const { selected } = useTreeSelection.getState()
        if (e.key === 'Escape') useTreeSelection.setState({ selected: new Set(), anchor: null })
        if (
          (e.key === 'Delete' || e.key === 'Backspace') &&
          selected.size &&
          !(e.target as HTMLElement).closest('input')
        ) {
          e.preventDefault()
          void askTrash(ws, [...selected], [...selected][0]!.split('/').pop()!)
        }
      }}
    >
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
  const selected = useTreeSelection((s) => s.selected.has(node.id))
  const selection = useTreeSelection((s) => s.selected)
  // Several chosen and this one among them: the actions apply to all of them.
  const many = selected && selection.size > 1

  /** ⌘/Ctrl: add or remove; Shift: the range from the last one; plain click: just this one. */
  const select = (e: MouseEvent): boolean => {
    const { selected: current, anchor } = useTreeSelection.getState()
    if (e.metaKey || e.ctrlKey) {
      const next = new Set(current)
      if (next.has(node.id)) next.delete(node.id)
      else next.add(node.id)
      useTreeSelection.setState({ selected: next, anchor: node.id })
      return false
    }
    if (e.shiftKey && anchor) {
      const order = visibleIds(ws.tree(), expanded)
      const [a, b] = [order.indexOf(anchor), order.indexOf(node.id)].sort((x, y) => x - y)
      if (a! >= 0) {
        useTreeSelection.setState({ selected: new Set(order.slice(a, b! + 1)) })
        return false
      }
    }
    useTreeSelection.setState({ selected: new Set([node.id]), anchor: node.id })
    return true
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDropTarget(false)
    const items = e.dataTransfer.getData(ITEMS)
    const paths = items ? (JSON.parse(items) as string[]) : [e.dataTransfer.getData(PAGE)].filter(Boolean)
    if (!paths.length || !canMove(paths, folder)) return
    // One page: as before (the open page follows). Several, files, folders: together, notes and
    // Moodle bookkeeping included.
    if (paths.length === 1 && ws.get(paths[0]!)) return void actions.moveTo(paths[0]!, folder)
    void moveEntries(ws, paths, folder).then((count) => {
      useTreeSelection.setState({ selected: new Set(), anchor: null })
      if (count)
        useApp.getState().showToast(t('tree.moved', { count, folder: folder.split('/').pop() ?? '' }))
    })
  }

  return (
    <li role="treeitem" aria-expanded={hasChildren ? isOpen : undefined} aria-selected={active || selected}>
      <div
        className={cx(
          'group relative flex h-8 items-center gap-1 rounded-control pr-1 text-[14px] text-ink-2 hover:bg-hover',
          active && 'bg-[color-mix(in_srgb,var(--accent)_13%,transparent)] font-semibold text-ink',
          selected && !active && 'bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] text-ink',
          // Older terms' material: visible, but clearly not the current one.
          !node.page && !node.file && node.title === 'Archiv' && 'italic opacity-60',
          dropTarget && 'ring-2 ring-accent',
        )}
        style={{ paddingLeft: 4 + depth * 14 }}
        draggable
        onDragStart={(e) => {
          const paths = many ? [...selection] : [node.id]
          e.dataTransfer.setData(ITEMS, JSON.stringify(paths))
          if (paths.length === 1 && node.page) e.dataTransfer.setData(PAGE, node.page.path)
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={(e) => {
          // Into pages and folders – files are no place to drop into.
          if (!node.file && (e.dataTransfer.types.includes(ITEMS) || e.dataTransfer.types.includes(PAGE))) {
            e.preventDefault()
            setDropTarget(true)
          }
        }}
        onDragLeave={() => setDropTarget(false)}
        onDrop={onDrop}
        // Right click: the same menu as "⋯" (files and folders too: open, show, to the trash).
        onContextMenu={(e) => {
          e.preventDefault()
          // A right click outside the chosen ones chooses just this one.
          if (!selected) useTreeSelection.setState({ selected: new Set([node.id]), anchor: node.id })
          setMenu(true)
        }}
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
          onClick={(e) => {
            if (!select(e)) return
            if (node.page) openPage(node.page.path)
            else if (node.file) navigate({ name: 'file', path: node.file })
            else toggle(node.id)
          }}
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
          {!node.page && (
            <IconButton ref={moreRef} size="sm" label={t('tree.more')} onClick={() => setMenu((m) => !m)}>
              <MoreHorizontal size={14} />
            </IconButton>
          )}
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
      <Popover anchor={moreRef} open={menu} onClose={() => setMenu(false)} label={t('tree.more')}>
        <MenuList
          items={
            many
              ? manyMenuItems([...selection], ws)
              : node.page
                ? pageMenuItems(node.page.path, ws, actions)
                : fileMenuItems(node, ws)
          }
          onDone={() => setMenu(false)}
        />
      </Popover>
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

/** "⋯" / right click on a file or folder: open, show in the Finder, into the trash (asked first). */
function fileMenuItems(node: TreeNode, ws: ReturnType<typeof useWorkspace>): Array<MenuItem | 'divider'> {
  const path = node.file ?? node.id
  const code = electronBridge()?.code
  return [
    ...(node.file
      ? [
          {
            label: t('tree.open'),
            icon: <FileText size={14} />,
            onSelect: () => useApp.getState().navigate({ name: 'file' as const, path }),
          },
        ]
      : []),
    ...(code
      ? [
          {
            label: t('tree.showInFolder'),
            icon: <FolderOpen size={14} />,
            onSelect: () => void code.open(node.file ? path.slice(0, path.lastIndexOf('/')) : path, 'finder'),
          },
        ]
      : []),
    'divider' as const,
    {
      label: t('tree.toTrash'),
      icon: <Trash2 size={14} />,
      danger: true,
      onSelect: () => void askTrash(ws, [path], node.title),
    },
  ]
}

/** Right click with several chosen: all of them into the trash (moving: drag them onto a folder). */
function manyMenuItems(paths: string[], ws: Workspace): Array<MenuItem | 'divider'> {
  return [
    { label: t('tree.selected', { count: paths.length }), disabled: true, onSelect: () => undefined },
    'divider',
    {
      label: t('tree.toTrash'),
      icon: <Trash2 size={14} />,
      danger: true,
      onSelect: () => void askTrash(ws, paths, ''),
    },
  ]
}
