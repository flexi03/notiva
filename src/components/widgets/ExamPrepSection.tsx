import { useState } from 'react'
import { CheckCircle2, FileText, GraduationCap, Info } from 'lucide-react'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { getLanguage, t } from '@/i18n'
import { examPrep, type PrepItem } from '@/lib/examPrep'
import type { Page } from '@/lib/workspace'
import { Checkbox, cx } from '@/components/ui'

const name = (path: string) => path.slice(path.lastIndexOf('/') + 1)

/**
 * On a module page: old and practice exams and exercise sheets from its materials, each with its
 * solution, ticked off when done ("vorbereitet" in the module page – it travels with the folder),
 * the exam hints and the next exam date.
 */
export function ExamPrepSection({ module, files }: { module: Page; files: string[] }) {
  const ws = useWorkspace()
  const run = useAction()
  const navigate = useApp((s) => s.navigate)
  const [override, setOverride] = useState<string[] | null>(null)
  const prep = examPrep(files)
  const items = [...prep.exams, ...prep.sheets]
  if (!items.length && !prep.hints.length) return null
  const done = new Set(
    override ?? (Array.isArray(module.data.vorbereitet) ? module.data.vorbereitet.map(String) : []),
  )
  const count = items.filter((i) => done.has(name(i.path))).length
  // The next exam of this module (database "Prüfungen").
  const today = new Date().toISOString().slice(0, 10)
  const exams = ws.findDatabase('Prüfungen', module.path)
  const next = exams
    ? ws
        .backlinks(module.path)
        .filter((p) => p.path.startsWith(`${ws.rowFolder(exams)}/`))
        .map((p) => String(p.data.Datum ?? '').slice(0, 10))
        .filter((d) => /^\d{4}-\d\d-\d\d$/.test(d) && d >= today)
        .sort()[0]
    : undefined
  const days = next ? Math.round((Date.parse(next) - Date.parse(today)) / 86_400_000) : null
  const toggle = (item: PrepItem) => {
    const key = name(item.path)
    const next = done.has(key) ? [...done].filter((k) => k !== key) : [...done, key]
    // Ticks at once; the module page follows.
    setOverride(next)
    void run(() => ws.setProperty(module.path, 'vorbereitet', next)).finally(() => setOverride(null))
  }
  const open = (path: string) => navigate({ name: 'file', path })
  const locale = getLanguage() === 'de' ? 'de-DE' : 'en-US'

  const list = (title: string, list: PrepItem[]) =>
    list.length > 0 && (
      <div>
        <h4 className="mb-0.5 text-[12px] text-ink-3">{title}</h4>
        <ul className="space-y-0.5">
          {list.map((item) => (
            <li key={item.path} className="flex items-center gap-2 text-[13px]">
              <Checkbox
                label={t('prep.doneFor', { name: name(item.path) })}
                checked={done.has(name(item.path))}
                onChange={() => toggle(item)}
              />
              <button
                type="button"
                className={cx(
                  'min-w-0 flex-1 truncate text-left hover:underline',
                  done.has(name(item.path)) && 'text-ink-3 line-through',
                )}
                onClick={() => open(item.path)}
              >
                {name(item.path)}
              </button>
              {item.solution && (
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-1.5 text-[11.5px] hover:bg-hover"
                  title={name(item.solution)}
                  onClick={() => open(item.solution!)}
                >
                  <CheckCircle2 size={11} /> {t('prep.solution')}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    )

  return (
    <section aria-label={t('prep.title')} data-testid="exam-prep">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="flex flex-1 items-center gap-1.5 text-[12.5px] font-semibold text-ink-2">
          <GraduationCap size={13} /> {t('prep.title')}
        </h3>
        {days !== null && (
          <span className="text-[12px] text-ink-3">
            {t('prep.exam', { days, date: new Date(`${next}T12:00:00`).toLocaleDateString(locale) })}
          </span>
        )}
        {items.length > 0 && (
          <span className="text-[12px] font-semibold text-accent" data-testid="exam-prep-count">
            {t('prep.count', { done: count, total: items.length })}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {prep.hints.map((h) => (
          <button
            key={h}
            type="button"
            className="flex items-center gap-1.5 text-[13px] hover:underline"
            onClick={() => open(h)}
          >
            <Info size={13} className="text-accent" /> {name(h)}
          </button>
        ))}
        {list(t('prep.exams'), prep.exams)}
        {list(t('prep.sheets'), prep.sheets)}
      </div>
      {!items.length && (
        <p className="flex items-center gap-1.5 text-[13px] text-ink-3">
          <FileText size={13} /> {t('prep.none')}
        </p>
      )}
    </section>
  )
}
