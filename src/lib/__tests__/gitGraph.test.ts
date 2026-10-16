import { graphRows } from '../gitGraph'

describe('history graph', () => {
  it('keeps a straight history in one lane', () => {
    const rows = graphRows([
      { hash: 'c', parents: ['b'] },
      { hash: 'b', parents: ['a'] },
      { hash: 'a', parents: [] },
    ])
    expect(rows.map((r) => r.lane)).toEqual([0, 0, 0])
    expect(rows[0]!.top).toEqual([])
    expect(rows[2]!.bottom).toEqual([])
  })
  it('draws a branch and its merge', () => {
    // m merges b2 (side branch) into a2; both come from a1.
    const rows = graphRows([
      { hash: 'm', parents: ['a2', 'b2'] },
      { hash: 'b2', parents: ['a1'] },
      { hash: 'a2', parents: ['a1'] },
      { hash: 'a1', parents: [] },
    ])
    expect(rows[0]).toMatchObject({
      lane: 0,
      bottom: [
        { from: 0, to: 0 },
        { from: 0, to: 1 },
      ],
    })
    expect(rows[1]!.lane).toBe(1)
    expect(rows[2]!.lane).toBe(0)
    // a2 continues to a1 in lane 0, the side branch bends back into it.
    expect(rows[2]!.bottom).toEqual([
      { from: 0, to: 0 },
      { from: 1, to: 0 },
    ])
    expect(rows[3]).toMatchObject({ lane: 0, top: [{ from: 0, to: 0 }] })
  })
})
