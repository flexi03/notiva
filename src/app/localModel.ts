import { withAi } from '@/app/aiActivity'
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
  if (/^[A?U]/.test(c.status))
    return de ? `neue ${kind} „${name}“${inWhere}` : `new ${kind} “${name}”${inWhere}`
  if (/^D/.test(c.status))
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
  added?: number
  removed?: number
  /** Changed lines ("+ …" / "- …"), a few of them – what the model reads. */
  excerpt?: string[]
}

/** Commit type from the kind of change (Conventional Commits). */
export function commitType(changes: CommitChange[]): string {
  if (changes.some((c) => /^[A?U]/.test(c.status) && !c.path.endsWith('.md'))) return 'feat'
  if (changes.every((c) => c.path.endsWith('.md'))) return 'docs'
  if (changes.every((c) => /^D/.test(c.status))) return 'chore'
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
  // The biggest changes first; the rest only counted.
  const ranked = [...changes].sort(
    (a, b) => (b.added ?? 0) + (b.removed ?? 0) - ((a.added ?? 0) + (a.removed ?? 0)),
  )
  const shown = ranked.slice(0, 8)
  return withProgress(
    t('localModel.commit'),
    async (task) => {
      const bullets: string[] = []
      for (const [i, c] of shown.entries()) {
        task.update(i, shown.length, c.path.split('/').pop())
        const head = describeChange(c, de)
        const text = c.excerpt?.length
          ? await bridge.complete(id, system, `${head}:\n${c.excerpt.slice(0, 12).join('\n')}`, 40, examples)
          : head
        bullets.push(firstLine(text) || head)
      }
      task.update(shown.length, shown.length)
      const rest = ranked.length - shown.length
      if (rest > 0) bullets.push(de ? `und ${rest} weitere Dateien` : `and ${rest} more files`)
      const more =
        shown.length > 1 ? (de ? ` (+${shown.length - 1} weitere)` : ` (+${shown.length - 1} more)`) : ''
      const subject = firstLine(`${bullets[0] ?? ''}`).slice(0, 60 - more.length) + more
      const scope = commitScope(changes)
      return `${commitType(changes)}${scope ? `(${scope})` : ''}: ${subject}\n\n${bullets.map((b) => `- ${b}`).join('\n')}`
    },
    { total: shown.length },
  )
}
