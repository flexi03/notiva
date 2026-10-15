import { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { parseWidget, widgetSource } from '@/lib/widgets'
import { DatabaseView } from '@/components/database/DatabaseView'
import { Annotated } from './Annotated'
import { Related } from './Related'
import { Tiles } from './Tiles'

/** Renders a ```notiva block: tiles or an embedded database view. */
export function Widget({ source, from }: { source: string; from: string }) {
  const ws = useWorkspace()
  const { widget, error } = useMemo(() => parseWidget(widgetSource(source)), [source])
  if (!widget) return <WidgetError message={error ?? ''} />
  if (widget.type === 'tiles') return <Tiles spec={widget} from={from} />
  if (widget.type === 'related') return <Related from={from} />
  if (widget.type === 'annotated') return <Annotated />
  const db = ws.findDatabase(widget.source, from)
  if (!db) return <WidgetError message={t('db.notFound', { name: widget.source })} />
  return (
    <DatabaseView
      dbPath={db.path}
      embedded
      {...(widget.view ? { viewName: widget.view } : {})}
      {...(widget.filter ? { extraFilter: widget.filter } : {})}
      {...(widget.limit ? { limit: widget.limit } : {})}
    />
  )
}

function WidgetError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-panel border border-dashed border-line-strong px-3 py-2 text-sm text-ink-2"
    >
      <AlertTriangle size={15} className="mt-0.5 shrink-0 text-danger" />
      <span>{message}</span>
    </div>
  )
}
