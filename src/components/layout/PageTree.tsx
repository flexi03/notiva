import { useRef, useState, type DragEvent } from 'react'
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
          // Older terms' material: visible, but clearly not the current one.
          !node.page && !node.file && node.title === 'Archiv' && 'italic opacity-60',
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
        // Right click: the same menu as "⋯" (files and folders too: open, show, to the trash).
        onContextMenu={(e) => {
          e.preventDefault()
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
          items={node.page ? pageMenuItems(node.page.path, ws, actions) : fileMenuItems(node, ws)}
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
  const inside = node.file
    ? 1
    : ws.assets().filter((f) => f.path.startsWith(`${path}/`)).length +
      ws.all().filter((p) => p.path.startsWith(`${path}/`)).length
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
      onSelect: () =>
        void (async () => {
          const ok = await useApp.getState().ask({
            title: t('tree.trashTitle', { name: node.title }),
            label: node.file ? t('tree.trashFile') : t('tree.trashFolder', { count: inside }),
            confirmLabel: t('tree.toTrash'),
            confirm: true,
            danger: true,
          })
          if (ok === null) return
          await ws.trashPath(path)
          useApp.getState().showToast(t('tree.trashed', { name: node.title }), {
            label: t('page.undo'),
            run: () =>
              void ws.listTrash().then((list) => {
                const entry = list.find((e) => e.original === path)
                if (entry) void ws.restore(entry.id)
              }),
          })
        })(),
    },
  ]
}
