import { useEffect, useRef, useState } from 'react'
import { Maximize2, MoreHorizontal } from 'lucide-react'
import { useApp, useWorkspace } from '@/app/store'
import { usePageActions } from '@/app/hooks/usePageActions'
import { t } from '@/i18n'
import { IconButton, MenuList, Popover, Sheet } from '@/components/ui'
import { PageContent, SourceToggle } from '@/components/editor/PageView'
import { pageMenuItems } from './pageMenu'
import { ScrollRootContext } from './scrollRoot'

/** The side panel for database entries and cards (store: `peek`, `openEntry`). */
export function PeekHost() {
  const ws = useWorkspace()
  const { peek, closePeek, openPage } = useApp()
  const actions = usePageActions(ws)
  const [source, setSource] = useState(false)
  const [menu, setMenu] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const page = peek ? ws.get(peek) : undefined
  const parent = page?.parentDatabase ? ws.get(page.parentDatabase) : undefined

  // The entry was deleted or moved away elsewhere: nothing left to show.
  useEffect(() => {
    if (peek && !page) closePeek()
  }, [peek, page, closePeek])

  if (!peek || !page) return null
  return (
    <Sheet
      open
      onClose={closePeek}
      bodyRef={bodyRef}
      title={parent ? `${parent.title} / ${page.title}` : page.title}
      closeLabel={t('common.close')}
      actions={
        <>
          <SourceToggle source={source} onChange={setSource} className="max-sm:hidden" />
          <IconButton label={t('peek.openFull')} onClick={() => openPage(page.path)}>
            <Maximize2 size={15} />
          </IconButton>
          <IconButton ref={moreRef} label={t('common.more')} onClick={() => setMenu((m) => !m)}>
            <MoreHorizontal size={17} />
          </IconButton>
          <Popover
            anchor={moreRef}
            open={menu}
            onClose={() => setMenu(false)}
            align="end"
            label={t('common.more')}
          >
            <MenuList items={pageMenuItems(page.path, ws, actions)} onDone={() => setMenu(false)} />
          </Popover>
        </>
      }
    >
      <ScrollRootContext value={bodyRef}>
        <PageContent key={page.path} path={page.path} source={source} embedded />
      </ScrollRootContext>
    </Sheet>
  )
}
