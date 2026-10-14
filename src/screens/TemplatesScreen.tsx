import { useState } from 'react'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { installPack, TEMPLATE_PACKS } from '@/lib/packs'
import type { TemplatePack } from '@/lib/templates'
import { Button, Dialog, Field, TextInput } from '@/components/ui'
import { Topbar } from '@/components/layout/Topbar'
import { pageTemplates } from './templateActions'

export function TemplatesScreen() {
  const ws = useWorkspace()
  const { openPage, setNewPage } = useApp()
  const [pack, setPack] = useState<TemplatePack | null>(null)
  const templates = pageTemplates(ws)
  return (
    <>
      <Topbar title={t('templates.title')} />
      <div className="mx-auto max-w-[60rem] px-4 py-10 sm:px-10">
        <h1 className="mb-2 text-[2rem] font-bold">{t('templates.title')}</h1>
        <h2 className="mt-8 text-lg font-bold">{t('templates.packs')}</h2>
        <p className="mb-4 text-sm text-ink-2">{t('templates.packsHint')}</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {TEMPLATE_PACKS.map((p) => (
            <li key={p.id} className="flex gap-3 rounded-panel border border-line bg-surface p-4">
              <span aria-hidden className="text-3xl">
                {p.icon}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold">{p.name}</h3>
                <p className="mt-0.5 text-[13.5px] text-ink-2">{p.description}</p>
                <Button
                  size="sm"
                  variant={p.id === 'study' ? 'primary' : 'secondary'}
                  className="mt-3"
                  onClick={() => setPack(p)}
                >
                  {t('templates.use')}
                </Button>
              </div>
            </li>
          ))}
        </ul>

        <h2 className="mt-10 text-lg font-bold">{t('templates.pages')}</h2>
        <p className="mb-4 text-sm text-ink-2">{t('templates.pagesHint')}</p>
        {templates.length === 0 ? (
          <p className="text-sm text-ink-3">{t('templates.noPageTemplates')}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-3">
            {templates.map((tpl) => (
              <li
                key={tpl.path}
                className="flex items-center gap-2 rounded-control border border-line bg-surface px-3 py-2"
              >
                <span aria-hidden>{tpl.icon ?? '📄'}</span>
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left hover:underline"
                  onClick={() => openPage(tpl.path)}
                >
                  {tpl.title}
                </button>
                <Button size="sm" variant="ghost" onClick={() => setNewPage({ folder: '' })}>
                  {t('templates.use')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {pack && <InstallDialog pack={pack} close={() => setPack(null)} />}
    </>
  )
}

function InstallDialog({ pack, close }: { pack: TemplatePack; close: () => void }) {
  const ws = useWorkspace()
  const run = useAction()
  const { openPage, showToast } = useApp()
  const [values, setValues] = useState<Record<string, string>>({})
  const install = async () => {
    const entry = await run(async () => {
      try {
        return await installPack(
          ws,
          pack,
          Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim())),
        )
      } catch (error) {
        if ((error as Error).message.startsWith('Exists'))
          throw new Error(t('templates.exists'), { cause: error })
        throw error
      }
    })
    if (entry) {
      close()
      showToast(t('templates.installed', { name: pack.name }))
      openPage(entry)
    }
  }
  return (
    <Dialog
      open
      onClose={close}
      title={`${pack.icon} ${pack.name}`}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void install()}>
            {t('templates.install')}
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          void install()
        }}
      >
        <p className="text-sm text-ink-2">{pack.description}</p>
        {pack.variables?.map((v) => (
          <Field key={v.key} label={v.label}>
            <TextInput
              type={v.type === 'date' ? 'date' : v.type === 'number' ? 'number' : 'text'}
              placeholder={v.type === 'date' ? undefined : v.default}
              value={values[v.key] ?? ''}
              onChange={(e) => setValues((s) => ({ ...s, [v.key]: e.target.value }))}
            />
          </Field>
        ))}
      </form>
    </Dialog>
  )
}
