import { useState } from 'react'
import { FileText, Table2 } from 'lucide-react'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { Button, cx, Dialog, Field, Select, TextInput } from '@/components/ui'
import { createBlankDatabase, createFromTemplate, pageTemplates } from './templateActions'

type Choice = { kind: 'blank' } | { kind: 'database' } | { kind: 'template'; path: string }

/** One place to create pages: blank, database or from a page template, in any folder. */
export function NewPageDialog() {
  const ws = useWorkspace()
  const run = useAction()
  const { newPageOpen, setNewPage, openPage } = useApp()
  const [title, setTitle] = useState('')
  const [folder, setFolder] = useState(newPageOpen?.folder ?? '')
  const [choice, setChoice] = useState<Choice>({ kind: 'blank' })
  const templates = pageTemplates(ws)
  const folders = [
    '',
    ...new Set(
      ws
        .all()
        .filter((p) => !p.parentDatabase && !p.data.template)
        .map((p) => p.path.slice(0, -3)),
    ),
  ].sort()
  const close = () => setNewPage(null)

  const create = async () => {
    const name = title.trim() || t('page.untitled')
    const path = await run(async () => {
      if (choice.kind === 'database') return createBlankDatabase(ws, folder, name)
      if (choice.kind === 'template') return createFromTemplate(ws, ws.get(choice.path)!, folder, name)
      return ws.createPage({ folder, title: name })
    })
    if (path) {
      close()
      openPage(path)
    }
  }

  const option = (c: Choice, icon: React.ReactNode, label: string, key: string) => {
    const active = JSON.stringify(c) === JSON.stringify(choice)
    return (
      <button
        key={key}
        type="button"
        role="radio"
        aria-checked={active}
        onClick={() => setChoice(c)}
        className={cx(
          'flex items-center gap-2 rounded-control border px-3 py-2 text-left text-sm',
          active ? 'border-accent bg-accent-soft font-semibold' : 'border-line hover:bg-hover',
        )}
      >
        {icon}
        <span className="truncate">{label}</span>
      </button>
    )
  }

  return (
    <Dialog
      open
      onClose={close}
      title={t('nav.newPage')}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void create()}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <Field label={t('page.titlePlaceholder')}>
          <TextInput
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('page.untitled')}
          />
        </Field>
        <Field label={t('common.folder')}>
          <Select value={folder} onChange={(e) => setFolder(e.target.value)}>
            {folders.map((f) => (
              <option key={f} value={f}>
                {f || t('common.root')}
              </option>
            ))}
          </Select>
        </Field>
        <div role="radiogroup" aria-label={t('nav.templates')} className="grid grid-cols-2 gap-2">
          {option({ kind: 'blank' }, <FileText size={15} />, t('templates.blank'), 'blank')}
          {option({ kind: 'database' }, <Table2 size={15} />, t('templates.blankDatabase'), 'db')}
          {templates.map((tpl) =>
            option(
              { kind: 'template', path: tpl.path },
              <span>{tpl.icon ?? '📄'}</span>,
              tpl.title,
              tpl.path,
            ),
          )}
        </div>
      </form>
    </Dialog>
  )
}
