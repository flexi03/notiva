/**
 * Line diff (Myers' O(ND) algorithm) for the git view: which lines are new, changed or gone,
 * grouped into hunks for display and mapped to editor blocks for the change gutter.
 */

export interface DiffLine {
  type: 'same' | 'add' | 'del'
  text: string
  /** 1-based line number in the old text (same/del). */
  oldNo?: number
  /** 1-based line number in the new text (same/add). */
  newNo?: number
}

export function splitLines(text: string): string[] {
  if (text === '') return []
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** Above this many edits the exact diff is skipped (everything counts as replaced). */
const MAX_EDITS = 4000

export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = splitLines(oldText)
  const b = splitLines(newText)
  // Common prefix/suffix first: cheap and keeps the core small for typical edits.
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const middle = myers(a.slice(start, endA), b.slice(start, endB))
  const out: DiffLine[] = []
  let oldNo = 1
  let newNo = 1
  const same = (text: string) => out.push({ type: 'same', text, oldNo: oldNo++, newNo: newNo++ })
  for (let i = 0; i < start; i++) same(a[i]!)
  for (const op of middle) {
    if (op.type === 'same') same(op.text)
    else if (op.type === 'del') out.push({ type: 'del', text: op.text, oldNo: oldNo++ })
    else out.push({ type: 'add', text: op.text, newNo: newNo++ })
  }
  for (let i = endA; i < a.length; i++) same(a[i]!)
  return out
}

function myers(a: string[], b: string[]): Array<{ type: DiffLine['type']; text: string }> {
  const n = a.length
  const m = b.length
  if (n === 0) return b.map((text) => ({ type: 'add' as const, text }))
  if (m === 0) return a.map((text) => ({ type: 'del' as const, text }))
  const max = n + m
  const offset = max
  const v = new Int32Array(2 * max + 2)
  const trace: Int32Array[] = []
  let found = false
  for (let d = 0; d <= Math.min(max, MAX_EDITS); d++) {
    trace.push(v.slice())
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)
          ? v[offset + k + 1]!
          : v[offset + k - 1]! + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) {
        x++
        y++
      }
      v[offset + k] = x
      if (x >= n && y >= m) {
        found = true
        break
      }
    }
    if (found) break
  }
  if (!found)
    return [
      ...a.map((text) => ({ type: 'del' as const, text })),
      ...b.map((text) => ({ type: 'add' as const, text })),
    ]
  // Walk the trace backwards to recover the edit script.
  const ops: Array<{ type: DiffLine['type']; text: string }> = []
  let x = n
  let y = m
  for (let d = trace.length - 1; d >= 0; d--) {
    const vd = trace[d]!
    const k = x - y
    const prevK = k === -d || (k !== d && vd[offset + k - 1]! < vd[offset + k + 1]!) ? k + 1 : k - 1
    const prevX = vd[offset + prevK]!
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) {
      ops.push({ type: 'same', text: a[x - 1]! })
      x--
      y--
    }
    if (d === 0) break
    if (x === prevX) ops.push({ type: 'add', text: b[y - 1]! })
    else ops.push({ type: 'del', text: a[x - 1]! })
    x = prevX
    y = prevY
  }
  return ops.reverse()
}

export interface DiffStats {
  added: number
  removed: number
}

export function diffStats(lines: DiffLine[]): DiffStats {
  let added = 0
  let removed = 0
  for (const l of lines) {
    if (l.type === 'add') added++
    else if (l.type === 'del') removed++
  }
  return { added, removed }
}

export type LineChange = 'added' | 'modified'

export interface LineMarkers {
  /** Per line of the new text (0-based): how it differs from the old text. */
  changed: Map<number, LineChange>
  /** 0-based new-text line indices before which old lines were removed (length = after the end). */
  deletedBefore: Set<number>
}

/**
 * Gutter markers like in VS Code: added lines, modified lines (a removal directly replaced by
 * additions) and places where lines were deleted.
 */
export function lineMarkers(oldText: string, newText: string): LineMarkers {
  const lines = diffLines(oldText, newText)
  const changed = new Map<number, LineChange>()
  const deletedBefore = new Set<number>()
  let i = 0
  let newIndex = 0
  while (i < lines.length) {
    if (lines[i]!.type === 'same') {
      i++
      newIndex++
      continue
    }
    let dels = 0
    let adds = 0
    while (i < lines.length && lines[i]!.type !== 'same') {
      if (lines[i]!.type === 'del') dels++
      else adds++
      i++
    }
    for (let j = 0; j < adds; j++) changed.set(newIndex + j, j < dels ? 'modified' : 'added')
    if (dels > adds) deletedBefore.add(newIndex + adds)
    newIndex += adds
  }
  return { changed, deletedBefore }
}

export interface Hunk {
  lines: DiffLine[]
  /** Unchanged lines hidden before this hunk. */
  skippedBefore: number
}

/** Changed regions with `context` unchanged lines around them; the rest is collapsed. */
export function toHunks(lines: DiffLine[], context = 3): Hunk[] {
  const keep = new Array<boolean>(lines.length).fill(false)
  lines.forEach((l, i) => {
    if (l.type === 'same') return
    for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++) keep[j] = true
  })
  const hunks: Hunk[] = []
  let skipped = 0
  let current: Hunk | null = null
  lines.forEach((line, i) => {
    if (!keep[i]) {
      skipped++
      current = null
      return
    }
    if (!current) {
      current = { lines: [], skippedBefore: skipped }
      hunks.push(current)
      skipped = 0
    }
    current.lines.push(line)
  })
  return hunks
}

export type BlockChange = 'added' | 'modified' | 'deleted'

/**
 * Maps line markers of a whole file onto the editor's blocks. `fileText` is the file on disk,
 * `body` its Markdown body (after the frontmatter) and `blocks` the block texts in order.
 * Returns one entry per block, plus whether the frontmatter changed and whether lines were
 * removed at the very end.
 */
export function blockChanges(
  markers: LineMarkers,
  fileText: string,
  body: string,
  blocks: string[],
): { blocks: Array<BlockChange | undefined>; properties: boolean; deletedAtEnd: boolean } {
  const normalized = fileText.replace(/\r\n?/g, '\n')
  const bodyAt = normalized.endsWith(body) ? normalized.length - body.length : normalized.indexOf(body)
  const lineOf = (index: number) => {
    let line = 0
    for (let i = 0; i < index; i++) if (normalized.charCodeAt(i) === 10) line++
    return line
  }
  const bodyLine = bodyAt >= 0 ? lineOf(bodyAt) : 0
  const properties = [...markers.changed.keys(), ...markers.deletedBefore].some((l) => l < bodyLine)

  const result: Array<BlockChange | undefined> = []
  let cursor = 0
  for (const text of blocks) {
    const at = bodyAt >= 0 ? body.indexOf(text, cursor) : -1
    if (at < 0 || !text) {
      result.push(undefined)
      continue
    }
    cursor = at + text.length
    const first = lineOf(bodyAt + at)
    const count = text.split('\n').length
    const range = Array.from({ length: count }, (_, i) => first + i)
    const kinds = range.map((l) => markers.changed.get(l))
    if (kinds.every((k) => k === 'added')) result.push('added')
    else if (kinds.some((k) => k)) result.push('modified')
    else if (markers.deletedBefore.has(first)) result.push('deleted')
    else result.push(undefined)
  }
  const deletedAtEnd = markers.deletedBefore.has(splitLines(normalized).length)
  return { blocks: result, properties, deletedAtEnd }
}

export interface InlineSegment {
  text: string
  changed: boolean
}

/**
 * Word-level diff of a changed line against the line that replaced it (VS Code's darker
 * highlight inside a changed line). Returns null if the lines have too little in common –
 * then the whole line counts as changed.
 */
export function inlineDiff(
  oldLine: string,
  newLine: string,
): { old: InlineSegment[]; new: InlineSegment[] } | null {
  const tokenize = (s: string) => s.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ?? []
  const a = tokenize(oldLine)
  const b = tokenize(newLine)
  if (a.length + b.length > 2000) return null
  const ops = myers(a, b)
  const sameChars = ops.filter((o) => o.type === 'same').reduce((n, o) => n + o.text.trim().length, 0)
  if (sameChars < Math.min(oldLine.trim().length, newLine.trim().length) * 0.3) return null
  const old: InlineSegment[] = []
  const next: InlineSegment[] = []
  const push = (list: InlineSegment[], text: string, changed: boolean) => {
    const last = list[list.length - 1]
    if (last && last.changed === changed) last.text += text
    else list.push({ text, changed })
  }
  for (const op of ops) {
    if (op.type !== 'add') push(old, op.text, op.type === 'del')
    if (op.type !== 'del') push(next, op.text, op.type === 'add')
  }
  return { old, new: next }
}

/** Pairs each removed line with the added line that replaced it (same position in a change run). */
export function pairChanges(lines: DiffLine[]): Map<DiffLine, DiffLine> {
  const pairs = new Map<DiffLine, DiffLine>()
  let i = 0
  while (i < lines.length) {
    if (lines[i]!.type === 'same') {
      i++
      continue
    }
    const dels: DiffLine[] = []
    const adds: DiffLine[] = []
    while (i < lines.length && lines[i]!.type !== 'same') {
      ;(lines[i]!.type === 'del' ? dels : adds).push(lines[i]!)
      i++
    }
    for (let k = 0; k < Math.min(dels.length, adds.length); k++) {
      pairs.set(dels[k]!, adds[k]!)
      pairs.set(adds[k]!, dels[k]!)
    }
  }
  return pairs
}
