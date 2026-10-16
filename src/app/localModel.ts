import { withAi } from '@/app/aiActivity'
import { changeKind, describeLines, groupChanges } from '@/lib/commitGroups'
import { withProgress } from '@/app/progress'
import { getLanguage, t } from '@/i18n'
import { electronBridge } from '@/lib/vault'

const KEY = 'notiva.localModel'

/** The local model chosen on this device ('' = off). */
export function localModelChoice(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function setLocalModelChoice(id: string): void {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* private mode */
  }
}

export const localModelAvailable = () => !!electronBridge()?.localModel && !!localModelChoice()

/** Downloads a model with a progress bar (size in MB). */
export function downloadLocalModel(id: string, label: string): Promise<void> {
  const bridge = electronBridge()!.localModel!
  return withProgress(
    t('localModel.downloading', { name: label }),
    async (task) => {
      const off = bridge.onProgress(
        (e) =>
          e.kind === 'download' &&
          e.total &&
          task.update(
            e.done ?? 0,
            e.total,
            `${Math.round((e.done ?? 0) / 1e6)} / ${Math.round(e.total / 1e6)} MB`,
          ),
      )
      try {
        await bridge.download(id)
      } finally {
        off()
      }
    },
    { success: () => t('localModel.downloaded', { name: label }) },
  )
}

/**
 * A quick summary by the local model – with progress (start, generation). `examples` are
 * question/answer pairs the model imitates. Throws with a reason when the model is missing.
 */
export function localSummary(
  label: string,
  system: string,
  prompt: string,
  maxTokens = 120,
  examples: Array<[string, string]> = [],
): Promise<string> {
  const bridge = electronBridge()?.localModel
  const id = localModelChoice()
  if (!bridge || !id) return Promise.reject(new Error(t('localModel.off')))
  return withProgress(label, async (task) => {
    const off = bridge.onProgress((e) => e.kind === 'start' && e.text && task.detail(e.text))
    try {
      task.detail(t('localModel.thinking'))
      return await withAi(label, () => bridge.complete(id, system, prompt, maxTokens, examples))
    } finally {
      off()
    }
  })
}

/** "Seite „Graphen“ bearbeitet (+24 Zeilen)", "neue Datei „abfragen.py“ in „Datenbanken / Praktikum 3“" */
export function describeChange(
  c: { path: string; status: string; added?: number; removed?: number },
  de = true,
): string {
  const parts = c.path.split('/')
  const file = parts.pop()!
  const name = file.replace(/\.md$/, '')
  const where = parts.slice(-2).join(' / ')
  const md = file.endsWith('.md')
  const lines =
    c.added || c.removed ? ` (+${c.added ?? 0} −${c.removed ?? 0} ${de ? 'Zeilen' : 'lines'})` : ''
  const kind = md ? (de ? 'Seite' : 'page') : de ? 'Datei' : 'file'
  const inWhere = where ? (de ? ` in „${where}“` : ` in “${where}”`) : ''
  if (changeKind(c.status) === 'new')
    return de ? `neue ${kind} „${name}“${inWhere}` : `new ${kind} “${name}”${inWhere}`
  if (changeKind(c.status) === 'deleted')
    return de ? `${kind} „${name}“${inWhere} gelöscht` : `${kind} “${name}”${inWhere} deleted`
  return de ? `${kind} „${name}“${inWhere} bearbeitet${lines}` : `${kind} “${name}”${inWhere} edited${lines}`
}

/** One line, at most 72 characters, cut at a word. */
export function firstLine(text: string): string {
  const line = (text.split('\n').find((l) => l.trim()) ?? '')
    .replace(/^[-*•\s]+/, '')
    .replace(/^["'„“]+|["'“”]+$/g, '')
    .trim()
  if (line.length <= 72) return line
  const cut = line.slice(0, 72)
  return cut
    .slice(0, Math.max(cut.lastIndexOf(','), cut.lastIndexOf(' ')))
    .replace(/[\s,;:–-]+$/, '')
    .trim()
}

export interface CommitChange {
  path: string
  status: string
  /** renames: the previous path */
  from?: string
  added?: number
  removed?: number
  /** Changed lines ("+ …" / "- …"), a few of them – what the model reads. */
  excerpt?: string[]
}

/** Commit type from the kind of change (Conventional Commits). */
export function commitType(all: CommitChange[]): string {
  const changes = all.filter((c) => !c.path.startsWith('.notiva/'))
  if (!changes.length) return 'chore'
  if (changes.some((c) => changeKind(c.status) === 'new' && !c.path.endsWith('.md'))) return 'feat'
  if (changes.every((c) => c.path.endsWith('.md'))) return 'docs'
  if (changes.every((c) => changeKind(c.status) === 'deleted' || changeKind(c.status) === 'renamed'))
    return 'chore'
  return changes.some((c) => !c.path.endsWith('.md')) ? 'fix' : 'docs'
}

/** Scope: the module/folder most changes are in ("datenbanksysteme-2"). */
export function commitScope(changes: CommitChange[]): string {
  const count = new Map<string, number>()
  for (const c of changes) {
    const parts = c.path.split('/')
    const key = parts.length > 2 ? parts[parts.length - 2]! : (parts[0] ?? '')
    const weight = (c.added ?? 0) + (c.removed ?? 0) + 1
    count.set(key, (count.get(key) ?? 0) + weight)
  }
  const top = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  return top
    .toLowerCase()
    .replace(/\.md$/, '')
    .replace(/[^a-z0-9äöüß]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
}

/**
 * A commit message like on GitHub – "docs(datenbanksysteme-2): Normalformen erklärt" plus one bullet
 * per changed file saying what changed in content. The local model reads each file's changed lines
 * on its own (small models stay accurate that way); type, scope and subject are built here.
 */
export async function commitSummary(changes: CommitChange[]): Promise<string> {
  const bridge = electronBridge()?.localModel
  const id = localModelChoice()
  if (!bridge || !id) throw new Error(t('localModel.off'))
  const de = getLanguage() === 'de'
  const system = de
    ? 'Beschreibe in EINEM kurzen deutschen Satz (höchstens 12 Wörter), was sich inhaltlich geändert hat. Nenne das Thema, nicht den Dateinamen. Ohne Punkt am Ende.'
    : 'Describe in ONE short English sentence (at most 12 words) what changed in content. Name the topic, not the file name. No full stop.'
  const examples: Array<[string, string]> = de
    ? [
        [
          'Seite „Analysis – Folgen“ (Mitschrift) bearbeitet:\n+ ## Grenzwert\n+ Eine Folge konvergiert gegen a, wenn …',
          'Definition des Grenzwerts von Folgen ergänzt',
        ],
        [
          'Neue Datei „blatt2.py“ (Mathe / Praktikum):\n+ def fib(n):\n+     return n if n < 2 else fib(n-1) + fib(n-2)',
          'Rekursive Fibonacci-Funktion für Blatt 2 angelegt',
        ],
      ]
    : [
        [
          'Page “Analysis – sequences” (notes) edited:\n+ ## Limit\n+ A sequence converges to a if …',
          'Added the definition of the limit of a sequence',
        ],
        [
          'New file “sheet2.py” (Maths / lab):\n+ def fib(n):\n+     return n if n < 2 else fib(n-1) + fib(n-2)',
          'Started sheet 2 with a recursive Fibonacci function',
        ],
      ]
  // Moves, files per folder and Notiva's data are named here; only text changes go to the model.
  const { bullets: grouped, texts, groupedFiles } = groupChanges(changes, de)
  // Mostly moved/new files (e.g. sorting materials): that is the subject – the model would guess.
  const groupSubject = grouped.length > 0 && (texts.length === 0 || groupedFiles >= 5 * texts.length)
  const shown = texts.slice(0, 6)
  const ask = (prompt: string, max: number, ex: Array<[string, string]>, sys = system) =>
    withAi(t('localModel.commit'), () => bridge.complete(id, sys, prompt, max, ex))
  return withProgress(
    t('localModel.commit'),
    async (task) => {
      const bullets: string[] = []
      for (const [i, c] of shown.entries()) {
        task.update(i, shown.length + 1, c.path.split('/').pop())
        const head = describeChange(c, de)
        const name = c.path.split('/').pop()!.replace(/\.md$/, '')
        // Changed properties are read here exactly; the model only describes text.
        const { props, content } = describeLines(c.excerpt!)
        const summary = content.length
          ? firstLine(await ask(`${head}:\n${c.excerpt!.slice(0, 12).join('\n')}`, 40, examples)) || head
          : de
            ? `„${name}“: Eigenschaften geändert`
            : `“${name}”: properties changed`
        // Below each point: what exactly changed (properties, first changed lines).
        const details = [
          ...props,
          ...content.slice(0, 3).map((l) => `${l.slice(0, 2)}${l.slice(2).trim().slice(0, 90)}`),
        ]
        bullets.push(
          `${summary}${content.length ? ` (${name})` : ''}${details.length ? `\n${details.map((d) => `  - ${d}`).join('\n')}` : ''}`,
        )
      }
      if (texts.length > shown.length)
        bullets.push(
          de
            ? `${texts.length - shown.length} weitere Seiten bearbeitet`
            : `${texts.length - shown.length} more pages edited`,
        )
      bullets.push(...grouped)
      // One subject line over everything – by the model, else the first point.
      task.update(shown.length, shown.length + 1, t('localModel.subject'))
      const subjectSystem = de
        ? 'Fasse die Änderungen in EINER deutschen Betreffzeile zusammen (höchstens 10 Wörter, ohne Punkt): das Wichtigste konkret benennen (welches Modul, welcher Inhalt). Erfinde nichts dazu.'
        : 'Summarise the changes in ONE short English subject line (at most 8 words, no full stop). Invent nothing.'
      const subjectExamples: Array<[string, string]> = de
        ? [
            [
              '- 17 Dateien in „Unterlagen / DBS 2“ nach „Vorlesung“ einsortiert\n- Notiva-Daten aktualisiert',
              'DBS-2-Unterlagen nach Vorlesung einsortiert',
            ],
          ]
        : [
            [
              '- 17 files in “Unterlagen / DBS 2” sorted into “Vorlesung”\n- Updated Notiva data',
              'Sorted DBS 2 materials into lectures',
            ],
          ]
      const list = bullets.map((b) => `- ${b}`).join('\n')
      // The subject is built from the points only (not the detail lines).
      const points = bullets.map((b) => `- ${b.split('\n')[0]}`).join('\n')
      const subject = groupSubject
        ? firstLine(grouped[0]!)
        : bullets.length > 1
          ? firstLine(await ask(points, 30, subjectExamples, subjectSystem).catch(() => '')) ||
            firstLine(bullets[0]!)
          : firstLine(bullets[0] ?? '')
      task.update(shown.length + 1, shown.length + 1)
      const scope = commitScope(changes.filter((c) => !c.path.startsWith('.notiva/')))
      return `${commitType(changes)}${scope ? `(${scope})` : ''}: ${subject}\n\n${list}`
    },
    { total: shown.length + 1 },
  )
}
