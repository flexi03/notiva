import { useMemo, useState } from 'react'
import { Calculator } from 'lucide-react'
import { useApp, useWorkspace } from '@/app/store'
import { getLanguage, t } from '@/i18n'
import { neededGrade, parseGrade, weightedGrade, type GradeItem } from '@/lib/gradeCalc'
import { findStudyDashboard } from '@/lib/study/sync'
import { Checkbox, TextInput } from '@/components/ui'

const KEY = 'notiva.gradeCalc'
interface Saved {
  target: string
  /** module page → expected grade as typed */
  expected: Record<string, string>
  /** module pages switched on/off against the default */
  toggled: string[]
}

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Saved>
    return {
      target: typeof raw.target === 'string' ? raw.target : '',
      expected: raw.expected && typeof raw.expected === 'object' ? raw.expected : {},
      toggled: Array.isArray(raw.toggled) ? raw.toggled.filter((x) => typeof x === 'string') : [],
    }
  } catch {
    return { target: '', expected: {}, toggled: [] }
  }
}

/**
 * "Notenrechner" (Noten & Leistungen): your average now, with the grades you expect in open modules,
 * and what you need in the rest for a target average. Reads the module database (works without
 * eCampus too); your guesses stay on this device.
 */
export function GradeCalculator() {
  const ws = useWorkspace()
  const openPage = useApp((s) => s.openPage)
  const [saved, setSaved] = useState(load)
  const save = (next: Saved) => {
    setSaved(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* per-device convenience only */
    }
  }
  const dash = findStudyDashboard(ws)
  const rows = useMemo(
    () => (dash && ws.get(`${dash.folder}/Module.md`) ? ws.rows(`${dash.folder}/Module.md`) : []),
    [ws, dash],
  )
  const ects = (v: unknown) => Number(String(v ?? '').replace(',', '.')) || 0
  const done: GradeItem[] = rows
    .filter((r) => r.data.Status === 'Bestanden')
    .map((r) => ({ ects: ects(r.data.ECTS), grade: parseGrade(r.data.Note) }))
  const open = rows.filter(
    (r) =>
      r.data.Status !== 'Bestanden' && r.data.Status !== 'Endgültig nicht bestanden' && ects(r.data.ECTS) > 0,
  )
  // Counted by default: required modules and what you take or plan; elective ones only when taken.
  const byDefault = (r: (typeof open)[number]) =>
    r.data.Art !== 'Wahlpflicht' ||
    (Array.isArray(r.data.Belegung) && r.data.Belegung.length > 0) ||
    (r.data.Status !== undefined && r.data.Status !== 'Geplant')
  const counted = (r: (typeof open)[number]) => byDefault(r) !== saved.toggled.includes(r.path)
  const included = open.filter(counted)
  const guessed = included
    .map((r) => ({ ects: ects(r.data.ECTS), grade: parseGrade(saved.expected[r.path]) }))
    .filter((i) => i.grade !== null)
  const rest = included.filter((r) => parseGrade(saved.expected[r.path]) === null)
  const restEcts = rest.reduce((s, r) => s + ects(r.data.ECTS), 0)
  const now = weightedGrade(done)
  const projected = weightedGrade([...done, ...guessed])
  const target = parseGrade(saved.target)
  const needed = target === null ? null : neededGrade([...done, ...guessed], restEcts, target)
  const locale = getLanguage() === 'de' ? 'de-DE' : 'en-US'
  const fmt = (n: number | null) =>
    n === null ? '–' : n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (!rows.length) return null

  return (
    <section aria-label={t('gradeCalc.title')} className="mt-10" data-testid="grade-calculator">
      <h2 className="mb-1 flex items-center gap-2 text-[1.25rem] font-bold">
        <Calculator size={18} className="text-accent" /> {t('gradeCalc.title')}
      </h2>
      <p className="mb-4 text-[13px] text-ink-3">{t('gradeCalc.hint')}</p>
      <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-panel border border-line p-3">
          <dt className="text-[12px] text-ink-3">{t('gradeCalc.now')}</dt>
          <dd className="text-[1.5rem] font-bold tabular-nums">{fmt(now)}</dd>
        </div>
        <div className="rounded-panel border border-line p-3">
          <dt className="text-[12px] text-ink-3">{t('gradeCalc.projected')}</dt>
          <dd className="text-[1.5rem] font-bold tabular-nums" data-testid="grade-projected">
            {fmt(projected)}
          </dd>
        </div>
        <div className="col-span-2 rounded-panel border border-line p-3 sm:col-span-1">
          <label className="block text-[12px] text-ink-3" htmlFor="grade-target">
            {t('gradeCalc.target')}
          </label>
          <TextInput
            id="grade-target"
            inputMode="decimal"
            placeholder="2,0"
            value={saved.target}
            onChange={(e) => save({ ...saved, target: e.target.value })}
            className="mt-1 w-24"
          />
          <p className="mt-1 text-[13px]" data-testid="grade-needed">
            {needed === null
              ? target === null
                ? ''
                : t('gradeCalc.nothingOpen')
              : needed.state === 'reachable'
                ? t('gradeCalc.needed', { grade: fmt(needed.grade), ects: restEcts })
                : needed.state === 'safe'
                  ? t('gradeCalc.safe')
                  : t('gradeCalc.unreachable')}
          </p>
        </div>
      </dl>
      <table className="w-full text-[13.5px]">
        <thead>
          <tr className="text-left text-[12px] text-ink-3">
            <th className="w-8 py-1 font-normal">
              <span className="sr-only">{t('gradeCalc.counts')}</span>
            </th>
            <th className="py-1 font-normal">{t('gradeCalc.module')}</th>
            <th className="w-16 py-1 text-right font-normal">ECTS</th>
            <th className="w-28 py-1 text-right font-normal">{t('gradeCalc.expected')}</th>
          </tr>
        </thead>
        <tbody>
          {open.map((r) => (
            <tr key={r.path} className="border-t border-line">
              <td className="py-1">
                <Checkbox
                  label={t('gradeCalc.countsFor', { name: r.title })}
                  checked={counted(r)}
                  onChange={() =>
                    save({
                      ...saved,
                      toggled: saved.toggled.includes(r.path)
                        ? saved.toggled.filter((p) => p !== r.path)
                        : [...saved.toggled, r.path],
                    })
                  }
                />
              </td>
              <td className="py-1">
                <button type="button" className="text-left hover:underline" onClick={() => openPage(r.path)}>
                  {r.title}
                </button>
                <span className="ml-2 text-[12px] text-ink-3">{String(r.data.Status ?? '')}</span>
              </td>
              <td className="py-1 text-right tabular-nums">{ects(r.data.ECTS)}</td>
              <td className="py-1 text-right">
                <TextInput
                  aria-label={t('gradeCalc.expectedFor', { name: r.title })}
                  inputMode="decimal"
                  placeholder="–"
                  disabled={!counted(r)}
                  value={saved.expected[r.path] ?? ''}
                  onChange={(e) =>
                    save({ ...saved, expected: { ...saved.expected, [r.path]: e.target.value } })
                  }
                  className="ml-auto h-8 w-20 text-right"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
