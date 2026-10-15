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
      return await bridge.complete(id, system, prompt, maxTokens, examples)
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

/** A commit message for these changes ("Mitschrift zu Graphen ergänzt, Praktikum 3 begonnen"). */
export function commitSummary(
  changes: Array<{ path: string; status: string; added?: number; removed?: number }>,
): Promise<string> {
  const de = getLanguage() === 'de'
  const system = de
    ? 'Du schreibst kurze Git-Commit-Nachrichten auf Deutsch: eine Zeile, höchstens 60 Zeichen, sagt inhaltlich, was sich geändert hat.'
    : 'You write short Git commit messages in English: one line, at most 60 characters, saying what changed in content.'
  const examples: Array<[string, string]> = de
    ? [
        [
          '- Seite „Analysis – Folgen“ in „Mitschriften“ bearbeitet (+30 −0 Zeilen)\n- neue Datei „blatt2.py“ in „Mathe / Praktikum“',
          'Mitschrift zu Folgen ergänzt, Mathe-Blatt 2 begonnen',
        ],
        ['- Seite „Klausurplan“ in „Studium“ bearbeitet (+5 −1 Zeilen)', 'Klausurplan aktualisiert'],
      ]
    : [
        [
          '- page “Analysis – sequences” in “Notes” edited (+30 −0 lines)\n- new file “sheet2.py” in “Maths / Lab”',
          'Notes on sequences, started maths sheet 2',
        ],
        ['- page “Exam plan” in “Studies” edited (+5 −1 lines)', 'Update exam plan'],
      ]
  const list = changes
    .slice(0, 40)
    .map((c) => `- ${describeChange(c, de)}`)
    .join('\n')
  return localSummary(t('localModel.commit'), system, list, 50, examples).then(firstLine)
}
