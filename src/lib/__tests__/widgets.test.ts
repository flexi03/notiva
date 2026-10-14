import { findWidgets } from '../widgets'

describe('findWidgets', () => {
  it('finds notiva blocks with their YAML and offsets', () => {
    const body =
      'Intro\n\n```notiva\ntype: tiles\ntiles: []\n```\n\nText\n\n```js\nx\n```\n\n```notiva\ntype: view\nsource: A\n```\n'
    const found = findWidgets(body)
    expect(found.map((w) => w.yaml)).toEqual(['type: tiles\ntiles: []', 'type: view\nsource: A'])
    expect(body.slice(found[0]!.start, found[0]!.end)).toBe('```notiva\ntype: tiles\ntiles: []\n```')
  })
})
