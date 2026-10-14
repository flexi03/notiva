import { parseClaudeLine } from '../ai/claudeStream'

// Lines as printed by `claude -p --output-format stream-json --verbose` (shortened).
const LINES = [
  '{"type":"system","subtype":"hook_started","session_id":"s-1"}',
  '{"type":"system","subtype":"init","session_id":"6011ed52-2a7d","model":"claude-opus-5-5","tools":["mcp__notiva__read_page"]}',
  '{"type":"assistant","message":{"model":"claude-opus-5-5","content":[{"type":"text","text":"Ich lege sie an."},{"type":"tool_use","id":"toolu_1","name":"mcp__notiva__create_page","input":{"title":"Lernplan"}}]},"session_id":"6011ed52-2a7d"}',
  '{"type":"user","message":{"role":"user","content":[{"tool_use_id":"toolu_1","type":"tool_result","content":[{"type":"text","text":"{\\n \\"path\\": \\"Lernplan.md\\"\\n}"}]}]},"session_id":"6011ed52-2a7d"}',
  '{"type":"rate_limit_event","rate_limit_info":{"status":"allowed"}}',
  '{"type":"assistant","message":{"model":"claude-opus-5-5","content":[{"type":"text","text":"Fertig: [[Lernplan]]"}]},"session_id":"6011ed52-2a7d"}',
  '{"type":"result","is_error":false,"result":"Fertig: [[Lernplan]]","session_id":"6011ed52-2a7d","total_cost_usd":0.06}',
]

describe('parseClaudeLine', () => {
  it('turns a Claude Code run into chat messages with tool steps', () => {
    const names = new Map<string, string>()
    const updates = LINES.map((l) => parseClaudeLine(l, names))
    expect(updates[0]).toEqual({})
    expect(updates[1]).toEqual({ session: { id: '6011ed52-2a7d', model: 'claude-opus-5-5' } })
    expect(updates[2]!.message).toEqual({
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Ich lege sie an.' },
        { type: 'tool_call', id: 'toolu_1', name: 'create_page', input: { title: 'Lernplan' } },
      ],
    })
    expect(updates[3]!.message!.parts[0]).toMatchObject({
      type: 'tool_result',
      id: 'toolu_1',
      name: 'create_page',
      touched: ['Lernplan.md'],
    })
    expect(updates[4]).toEqual({})
    expect(updates[6]).toMatchObject({
      result: { isError: false, costUsd: 0.06 },
      session: { id: '6011ed52-2a7d' },
    })
  })

  it('ignores garbage and marks failed tools', () => {
    const names = new Map([['t', 'read_page']])
    expect(parseClaudeLine('not json', names)).toEqual({})
    expect(parseClaudeLine('null', names)).toEqual({})
    const failed = parseClaudeLine(
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t","is_error":true,"content":"nicht gefunden"}]}}',
      names,
    )
    expect(failed.message!.parts[0]).toEqual({
      type: 'tool_result',
      id: 't',
      name: 'read_page',
      output: 'nicht gefunden',
      isError: true,
    })
  })
})
