import { useRef, useState } from 'react'
import { History, Trash2 } from 'lucide-react'
import { useChats } from '@/app/chats'
import { getLanguage, t } from '@/i18n'
import { cx, IconButton, Popover } from '@/components/ui'

/** Earlier chats with the assistant: open (and continue) or delete. */
export function ChatHistory() {
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const { list, current, reload, open: openChat, remove } = useChats()
  const locale = getLanguage() === 'de' ? 'de-DE' : 'en-US'
  return (
    <>
      <IconButton
        ref={anchor}
        label={t('ai.history')}
        onClick={() => {
          reload()
          setOpen((v) => !v)
        }}
        active={open}
      >
        <History size={16} />
      </IconButton>
      <Popover
        anchor={anchor}
        open={open}
        onClose={() => setOpen(false)}
        align="end"
        label={t('ai.history')}
        className="w-80"
      >
        {list.length === 0 ? (
          <p className="p-3 text-sm text-ink-3">{t('ai.historyEmpty')}</p>
        ) : (
          <ul aria-label={t('ai.history')} className="max-h-96 overflow-y-auto py-1">
            {list.map((chat) => (
              <li
                key={chat.id}
                className={cx('group flex items-center gap-1 px-1', chat.id === current && 'bg-hover')}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 rounded-control px-2 py-1.5 text-left hover:bg-hover"
                  onClick={() => {
                    openChat(chat.id)
                    setOpen(false)
                  }}
                >
                  <span className="block truncate text-sm">{chat.title}</span>
                  <span className="block text-[11.5px] text-ink-3">
                    {new Date(chat.updated).toLocaleString(locale, {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                    {chat.sessionId && ` · ${t('ai.resumable')}`}
                  </span>
                </button>
                <IconButton
                  size="sm"
                  label={t('ai.deleteChat')}
                  onClick={() => remove(chat.id)}
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 size={13} />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </Popover>
    </>
  )
}
