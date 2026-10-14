import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowUp,
  Check,
  Database,
  FilePlus2,
  FileText,
  BookOpen,
  FolderInput,
  GraduationCap,
  LayoutGrid,
  Paperclip,
  Link2,
  ListTree,
  Pencil,
  ScrollText,
  Search,
  Settings2,
  Sparkles,
  Square,
  SquarePen,
  Tags,
  Trash2,
} from 'lucide-react'
import { useAssistant, type SentPrompt } from '@/app/assistant'
import { PromptDialog } from './PromptEditor'
import { useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import type { AiSettings, Message, Part } from '@/lib/ai'
import { AutoTextArea, Button, cx, IconButton } from '@/components/ui'
import { MarkdownView } from '@/components/editor/MarkdownView'
import { PageIcon } from '@/components/layout/PageIcon'
import { SidePanel } from '@/components/layout/SidePanel'
import { findWidgets } from '@/lib/widgets'

const TOOL_ICONS: Record<string, ReactNode> = {
  search_pages: <Search size={13} />,
  list_pages: <ListTree size={13} />,
  read_page: <FileText size={13} />,
  list_databases: <Database size={13} />,
  query_database: <Database size={13} />,
  get_backlinks: <Link2 size={13} />,
  list_tags: <Tags size={13} />,
  create_page: <FilePlus2 size={13} />,
  create_row: <FilePlus2 size={13} />,
  set_properties: <Pencil size={13} />,
  append_to_page: <Pencil size={13} />,
  edit_page_text: <Pencil size={13} />,
  replace_page_body: <Pencil size={13} />,
  rename_page: <Pencil size={13} />,
  move_page: <FolderInput size={13} />,
  trash_page: <Trash2 size={13} />,
  notiva_format: <BookOpen size={13} />,
  list_widgets: <LayoutGrid size={13} />,
  update_widget: <LayoutGrid size={13} />,
  remove_widget: <Trash2 size={13} />,
  update_database: <Database size={13} />,
  list_files: <Paperclip size={13} />,
  read_file: <Paperclip size={13} />,
  moodle_overview: <GraduationCap size={13} />,
  import_moodle: <GraduationCap size={13} />,
  exam_results: <GraduationCap size={13} />,
}

/** "Liest Studium/Module.md" – what the call is about, from its most telling argument. */
function stepTarget(input: unknown): string {
  if (typeof input !== 'object' || input === null) return ''
  const r = input as Record<string, unknown>
  const value = r.page ?? r.database ?? r.path ?? r.query ?? r.title ?? r.folder
  return typeof value === 'string' ? value : ''
}

/** The AI chat in a side bar (left or right, overlay on small screens). */
export function AssistantPanel() {
  const { configured, settings, messages, sent, busy, error, send, stop, reset, draft, setDraft } =
    useAssistant()
  const [promptOpen, setPromptOpen] = useState(false)
  const closeView = useApp((s) => s.closeView)
  const route = useApp((s) => s.route)
  const navigate = useApp((s) => s.navigate)
  const ws = useWorkspace()
  const scroller = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const page = route.name === 'page' ? ws.get(route.path) : undefined

  useEffect(() => {
    input.current?.focus()
  }, [])
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [messages, busy])
  // On phones the panel covers the page: following a link should show the page.
  const firstRoute = useRef(route)
  useEffect(() => {
    if (route !== firstRoute.current && window.innerWidth < 900) closeView('assistant')
  }, [route, closeView])

  const results = useMemo(() => {
    const map = new Map<string, Extract<Part, { type: 'tool_result' }>>()
    for (const m of messages) for (const p of m.parts) if (p.type === 'tool_result') map.set(p.id, p)
    return map
  }, [messages])

  const submit = (text = draft) => {
    if (!text.trim() || busy) return
    void send(text)
  }
  const suggestions = [
    ...(page && findWidgets(page.body).length > 0 ? [t('ai.suggest.dashboard')] : []),
    ...(page ? [t('ai.suggest.summarize'), t('ai.suggest.tasks'), t('ai.suggest.quiz')] : []),
    t('ai.suggest.week'),
    t('ai.suggest.find'),
  ]

  return (
    <SidePanel
      view="assistant"
      title={t('ai.title')}
      icon={<Sparkles size={16} />}
      actions={
        <>
          {configured && (
            <span className="truncate text-[12.5px] text-ink-3" data-testid="ai-model">
              {modelLabel(settings)}
              {!settings.allowWrites && ` · ${t('ai.readOnly')}`}
            </span>
          )}
          <IconButton label={t('ai.prompt.show')} onClick={() => setPromptOpen(true)}>
            <ScrollText size={16} />
          </IconButton>
          <PromptDialog open={promptOpen} onClose={() => setPromptOpen(false)} />
          <IconButton label={t('nav.settings')} onClick={() => navigate({ name: 'settings', section: 'ai' })}>
            <Settings2 size={16} />
          </IconButton>
          <IconButton label={t('ai.newChat')} onClick={reset} disabled={messages.length === 0 && !error}>
            <SquarePen size={16} />
          </IconButton>
        </>
      }
    >
      <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {!configured ? (
          <SetupCard />
        ) : messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-2">{t('ai.intro')}</p>
            <ul className="space-y-1.5">
              {suggestions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => submit(s)}
                    className="w-full rounded-control border border-line px-3 py-2 text-left text-[14px] hover:border-line-strong hover:bg-hover"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          messages.map((m, i) => (
            <ChatMessage key={i} message={m} results={results} from={page?.path} sent={sent[i]} />
          ))
        )}
        {busy && (
          <p className="flex items-center gap-2 text-[13px] text-ink-3" role="status">
            <span className="size-2 animate-pulse rounded-full bg-accent" aria-hidden />
            {t('ai.thinking')}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-control bg-[var(--opt-red)] px-3 py-2 text-[13.5px] text-[var(--opt-red-ink)]"
          >
            {error}
          </p>
        )}
      </div>

      {configured && (
        <form
          className="shrink-0 border-t border-line p-2"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="flex items-end gap-1.5 rounded-panel border border-line bg-paper px-2.5 py-1.5 focus-within:border-accent">
            <AutoTextArea
              ref={input}
              plain
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder={t('ai.placeholder')}
              aria-label={t('ai.placeholder')}
              className="max-h-40 min-h-7 overflow-y-auto py-1 text-[14.5px] focus-visible:outline-none"
            />
            {busy ? (
              <IconButton label={t('ai.stop')} onClick={stop}>
                <Square size={14} className="fill-current" />
              </IconButton>
            ) : (
              <IconButton label={t('ai.send')} type="submit" disabled={!draft.trim()}>
                <ArrowUp size={16} />
              </IconButton>
            )}
          </div>
        </form>
      )}
    </SidePanel>
  )
}

function ChatMessage({
  message,
  results,
  from,
  sent,
}: {
  message: Message
  results: Map<string, Extract<Part, { type: 'tool_result' }>>
  from: string | undefined
  sent: SentPrompt | undefined
}) {
  if (message.role === 'user') {
    const text = message.parts
      .filter((p): p is Extract<Part, { type: 'text' }> => p.type === 'text')
      .map((p) => p.text)
      .join('\n')
    if (!text) return null // tool results are shown with their call
    return (
      <div className="ml-8 space-y-1">
        <p className="rounded-panel bg-sunken px-3 py-2 text-[14.5px] whitespace-pre-wrap">{text}</p>
        {sent && <SentDetails sent={sent} />}
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {message.parts.map((part, i) =>
        part.type === 'text' ? (
          <MarkdownView
            key={i}
            markdown={part.text}
            untrusted
            className="flow text-[14.5px]"
            {...(from ? { from } : {})}
          />
        ) : part.type === 'tool_call' ? (
          <ToolStep key={i} call={part} result={results.get(part.id)} />
        ) : null,
      )}
    </div>
  )
}

function ToolStep({
  call,
  result,
}: {
  call: Extract<Part, { type: 'tool_call' }>
  result: Extract<Part, { type: 'tool_result' }> | undefined
}) {
  const ws = useWorkspace()
  const openEntry = useApp((s) => s.openEntry)
  const label = t(`ai.tool.${call.name}` as 'ai.tool.read_page')
  const target = stepTarget(call.input)
  return (
    <div className="text-[13px] text-ink-2">
      <p className="flex items-center gap-1.5">
        <span className="text-ink-3" aria-hidden>
          {TOOL_ICONS[call.name] ?? <Sparkles size={13} />}
        </span>
        <span className="min-w-0 truncate">
          {label}
          {target && <span className="text-ink"> {target}</span>}
        </span>
        {result &&
          (result.isError ? (
            <span className="shrink-0 text-danger" title={result.output}>
              · {t('ai.toolFailed')}
            </span>
          ) : (
            <Check size={13} className="shrink-0 text-accent" aria-label="✓" />
          ))}
      </p>
      {result?.touched?.map((path) => {
        const page = ws.get(path)
        return (
          <button
            key={path}
            type="button"
            onClick={(e) => openEntry(path, e)}
            className={cx(
              'mt-1 ml-5 flex max-w-full items-center gap-1.5 rounded-control border border-line px-2 py-1 text-ink hover:bg-hover',
              !page && 'opacity-60',
            )}
          >
            {page && <PageIcon page={page} size={13} />}
            <span className="truncate">{page?.title ?? path}</span>
          </button>
        )
      })}
    </div>
  )
}

function modelLabel(settings: AiSettings): string {
  if (settings.backend === 'cli') {
    const name = settings.cli === 'claude' ? 'Claude Code' : settings.cli === 'codex' ? 'Codex' : 'Gemini CLI'
    return settings.cliModel ? `${name} · ${settings.cliModel}` : name
  }
  return settings.model
}

/** "Gesendet": the exact system prompt, message, command line and answering model. */
function SentDetails({ sent }: { sent: SentPrompt }) {
  return (
    <details className="text-right text-[12px] text-ink-3">
      <summary className="cursor-pointer select-none hover:text-ink-2">
        {t('ai.prompt.sent')}
        {sent.model && ` · ${sent.model}`}
      </summary>
      <div className="mt-1 space-y-2 text-left">
        {sent.command && (
          <Labeled label={t('ai.prompt.command')}>
            {sent.command.map((a) => (/^[\w./:@=-]+$/.test(a) ? a : JSON.stringify(a))).join(' ')}
          </Labeled>
        )}
        <Labeled label={t('ai.prompt.system')}>{sent.system}</Labeled>
        <Labeled label={t('ai.prompt.user')}>{sent.user}</Labeled>
      </div>
    </details>
  )
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="font-semibold text-ink-2">{label}</p>
      <pre className="max-h-48 overflow-auto rounded-control border border-line bg-sunken p-2 font-code text-[11.5px] leading-relaxed whitespace-pre-wrap text-ink-2">
        {children}
      </pre>
    </div>
  )
}

/** First use: offers an installed Claude Code with one click, otherwise points to the settings. */
function SetupCard() {
  const { clis, loadClis, saveSettings, settings } = useAssistant()
  const navigate = useApp((s) => s.navigate)
  useEffect(() => {
    void loadClis()
  }, [loadClis])
  const claude = clis?.find((c) => c.id === 'claude')
  return (
    <div className="space-y-3 rounded-panel border border-line bg-paper p-4">
      <h3 className="font-bold">{t('ai.setup.title')}</h3>
      {claude ? (
        <>
          <p className="text-sm text-ink-2">{t('ai.setup.claudeFound', { version: claude.version })}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => saveSettings({ ...settings, backend: 'cli', cli: 'claude', cliModel: 'opus' })}
            >
              {t('ai.setup.useClaude')}
            </Button>
            <Button variant="ghost" onClick={() => navigate({ name: 'settings', section: 'ai' })}>
              {t('ai.setup.other')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-ink-2">{t('ai.setup.text')}</p>
          <Button variant="primary" onClick={() => navigate({ name: 'settings', section: 'ai' })}>
            {t('ai.setup.open')}
          </Button>
        </>
      )}
    </div>
  )
}
