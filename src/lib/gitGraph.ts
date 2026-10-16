/**
 * The history graph of the Git sidebar (like VS Code): for each commit its lane and the lines
 * running through the row – from the commits above (children) into it and on to its parents.
 */
export interface GraphRow {
  /** lane of the commit's dot */
  lane: number
  /** lanes with a line in the upper half of the row (incoming), and where they end */
  top: Array<{ from: number; to: number }>
  /** lanes with a line in the lower half (outgoing to the parents and passing lines) */
  bottom: Array<{ from: number; to: number }>
  /** number of lanes in use (width) */
  width: number
}

export function graphRows(commits: Array<{ hash: string; parents?: string[] }>): GraphRow[] {
  let lanes: Array<string | null> = []
  const rows: GraphRow[] = []
  for (const c of commits) {
    let lane = lanes.indexOf(c.hash)
    // No child above (newest commit of a branch): no line into its dot.
    const fresh = lane < 0
    if (lane < 0) {
      lane = lanes.indexOf(null)
      if (lane < 0) lane = lanes.length
      lanes[lane] = c.hash
    }
    // Upper half: every waiting line goes straight down; the ones waiting for this commit join it.
    const top = lanes.flatMap((h, i) =>
      h === null || (fresh && i === lane) ? [] : [{ from: i, to: h === c.hash ? lane : i }],
    )
    const next = lanes.map((h) => (h === c.hash ? null : h))
    const parents = c.parents ?? []
    const bottom: Array<{ from: number; to: number }> = []
    parents.forEach((p, k) => {
      const existing = next.indexOf(p)
      // The first parent waits further right: it moves into this lane (main line stays left).
      if (k === 0 && existing > lane && next[lane] === null) {
        next[existing] = null
        next[lane] = p
        bottom.push({ from: lane, to: lane }, { from: existing, to: lane })
        return
      }
      if (existing >= 0) {
        bottom.push({ from: lane, to: existing })
        return
      }
      // First parent keeps the commit's lane; others take a free one.
      let target = k === 0 && next[lane] === null ? lane : next.indexOf(null)
      if (target < 0) target = next.length
      next[target] = p
      bottom.push({ from: lane, to: target })
    })
    next.forEach((h, i) => {
      if (h !== null && !parents.includes(h)) bottom.push({ from: i, to: i })
    })
    while (next.length && next[next.length - 1] === null) next.pop()
    rows.push({ lane, top, bottom, width: Math.max(lanes.length, next.length, lane + 1) })
    lanes = next
  }
  return rows
}
