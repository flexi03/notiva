import { useState, type ClipboardEvent, type DragEvent } from 'react'
import { Copy, File, FileText, Inbox, Trash2 } from 'lucide-react'
import { useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { SHELF_FOLDER } from '@/lib/shelf'
import { addShelfFile, addShelfText } from '@/app/shelf'
import { AutoTextArea, Button, cx, EmptyState, IconButton } from '@/components/ui'
import { SidePanel } from './SidePanel'

interface Item {
  path: string
  name: string
  mtime: number
  page: boolean
  preview?: string
}

/**
 * The shelf ("Ablage"): drop files or paste text to put them aside quickly. Everything lands in
 * the folder "Ablage" of the vault; drag an item into a page to link it there.
 */
export function ShelfPanel() {
  const ws = useWorkspace()
  const { openEntry, navigate, showToast } = useApp()
  const [text, setText] = useState('')
  const [over, setOver] = useState(false)
  const inShelf = (path: string) => path.startsWith(`${SHELF_FOLDER}/`)

  const items: Item[] = [
    ...ws
      .all()
      .filter((p) => inShelf(p.path))
      .map((p) => ({
        path: p.path,
        name: p.title,
        mtime: p.mtime,
        page: true,
        preview: p.body.trim().slice(0, 140),
      })),
    ...ws
      .assets()
      .filter((f) => inShelf(f.path))
      .map((f) => ({
        path: f.path,
        name: f.path.slice(SHELF_FOLDER.length + 1),
        mtime: f.mtime,
        page: false,
      })),
  ].sort((a, b) => b.mtime - a.mtime)

  const addText = async (value: string) => {
    if (!(await addShelfText(ws, value))) return
    setText('')
  }
  const addFiles = async (files: File[]) => {
    for (const file of files) await addShelfFile(ws, file.name, new Uint8Array(await file.arrayBuffer()))
    if (files.length) showToast(t('shelf.added', { count: files.length }))
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    const files = [...e.dataTransfer.files]
    if (files.length) void addFiles(files)
    else void addText(e.dataTransfer.getData('text/plain'))
  }
  const onPaste = (e: ClipboardEvent) => {
    const files = [...e.clipboardData.files]
    if (!files.length) return
    e.preventDefault()
    void addFiles(files)
  }
  const open = (item: Item) =>
    item.page ? openEntry(item.path) : navigate({ name: 'file', path: item.path })
  const remove = async (item: Item) => {
    if (item.page) await ws.trash(item.path)
    else await ws.removeFile(item.path)
  }
  const copy = async (item: Item) => {
    const value = item.page ? (ws.get(item.path)?.body.trim() ?? '') : `[[${item.path}]]`
    await navigator.clipboard.writeText(value).catch(() => undefined)
    showToast(t('shelf.copied'))
  }

  return (
    <SidePanel view="shelf" title={t('shelf.title')} icon={<Inbox size={16} />}>
      <div
        className={cx('flex min-h-0 flex-1 flex-col', over && 'bg-accent-soft')}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('application/x-notiva-shelf')) return
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        onPaste={onPaste}
      >
        <div className="border-b border-line p-3">
          <AutoTextArea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void addText(text)
              }
            }}
            placeholder={t('shelf.placeholder')}
            aria-label={t('shelf.placeholder')}
            className="min-h-16 text-sm"
          />
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" variant="primary" disabled={!text.trim()} onClick={() => void addText(text)}>
              {t('shelf.add')}
            </Button>
            <span className="text-[12px] text-ink-3">{t('shelf.hint')}</span>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <EmptyState icon={<Inbox size={26} />} title={t('shelf.empty')}>
              {t('shelf.emptyHint')}
            </EmptyState>
          ) : (
            <ul aria-label={t('shelf.title')} className="divide-y divide-line">
              {items.map((item) => (
                <li
                  key={item.path}
                  draggable
                  onDragStart={(e) => {
                    // Into a page: a link to the item.
                    e.dataTransfer.setData('application/x-notiva-shelf', item.path)
                    e.dataTransfer.setData('text/plain', `[[${ws.linkText(item.path)}]]`)
                  }}
                  className="group flex items-start gap-2 px-3 py-2 hover:bg-hover"
                >
                  <span className="mt-0.5 shrink-0 text-ink-3">
                    {item.page ? <FileText size={15} aria-hidden /> : <File size={15} aria-hidden />}
                  </span>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => open(item)}>
                    <span className="block truncate text-sm">{item.name}</span>
                    {item.preview && (
                      <span className="line-clamp-2 block text-[12.5px] whitespace-pre-line text-ink-3">
                        {item.preview}
                      </span>
                    )}
                  </button>
                  <span className="flex shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                    <IconButton size="sm" label={t('shelf.copy')} onClick={() => void copy(item)}>
                      <Copy size={14} />
                    </IconButton>
                    <IconButton size="sm" label={t('shelf.remove')} onClick={() => void remove(item)}>
                      <Trash2 size={14} />
                    </IconButton>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SidePanel>
  )
}
