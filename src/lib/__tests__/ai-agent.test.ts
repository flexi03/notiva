import { installPack, studyPack } from '../packs'
import { MemoryVault } from '../vault'
import { Workspace } from '../workspace'
import { runAgent, systemPrompt, toolSpecs, type Message, type ModelProvider, type Part } from '../ai/agent'
import {
  anthropicProvider,
  openAiProvider,
  parseAiSettings,
  type HttpRequest,
  type HttpResponse,
} from '../ai/providers'

const now = new Date(2026, 9, 14, 10)

async function vault() {
  const ws = await Workspace.open(new MemoryVault())
  await installPack(ws, studyPack, {}, '', now)
  return ws
}

/** A model that replies with the scripted turns in order and records what it was sent. */
function scripted(turns: Part[][]) {
  const seen: Message[][] = []
  const provider: ModelProvider = {
    async chat({ messages }) {
      seen.push(messages.slice())
      const next = turns.shift()
      if (!next) throw new Error('no more turns')
      return next
    },
  }
  return { provider, seen }
}

const user = (text: string): Message => ({ role: 'user', parts: [{ type: 'text', text }] })

describe('runAgent', () => {
  it('runs tools and feeds results back until the model answers', async () => {
    const ws = await vault()
    const { provider, seen } = scripted([
      [{ type: 'tool_call', id: '1', name: 'search_pages', input: { query: 'Lineare Algebra' } }],
      [
        {
          type: 'tool_call',
          id: '2',
          name: 'append_to_page',
          input: { page: 'Lineare Algebra', markdown: '- [ ] Üben' },
        },
      ],
      [{ type: 'text', text: 'Erledigt: [[Lineare Algebra]]' }],
    ])
    const updates: number[] = []
    const messages = await runAgent({
      provider,
      ws,
      system: 's',
      messages: [user('Füge eine Aufgabe hinzu')],
      onUpdate: (m) => updates.push(m.length),
      now,
    })
    expect(messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
      'assistant',
    ])
    const firstResult = seen[1]!.at(-1)!.parts[0]!
    expect(firstResult).toMatchObject({ type: 'tool_result', id: '1', name: 'search_pages' })
    expect(messages[4]!.parts[0]).toMatchObject({ touched: ['Studium/Module/Lineare Algebra.md'] })
    expect(ws.get('Studium/Module/Lineare Algebra.md')!.body).toContain('- [ ] Üben')
    expect(updates).toEqual([2, 3, 4, 5, 6])
  })

  it('in read-only mode offers no write tools and rejects write calls', async () => {
    const ws = await vault()
    expect(toolSpecs(true).every((t) => !['create_page', 'trash_page'].includes(t.name))).toBe(true)
    const { provider } = scripted([
      [{ type: 'tool_call', id: '1', name: 'trash_page', input: { page: 'Module' } }],
      [{ type: 'text', text: 'ok' }],
    ])
    const messages = await runAgent({ provider, ws, system: 's', messages: [user('lösch')], readOnly: true })
    expect(messages[2]!.parts[0]).toMatchObject({ isError: true, output: expect.stringMatching(/Nur-Lesen/) })
    expect(ws.get('Studium/Module.md')).toBeDefined()
  })

  it('asks before destructive tools and respects a no', async () => {
    const ws = await vault()
    const { provider } = scripted([
      [{ type: 'tool_call', id: '1', name: 'trash_page', input: { page: 'Willkommen' } }],
      [{ type: 'text', text: 'ok' }],
    ])
    const asked: string[] = []
    const messages = await runAgent({
      provider,
      ws,
      system: 's',
      messages: [user('lösch')],
      confirm: async (tool) => {
        asked.push(tool.name)
        return false
      },
    })
    expect(asked).toEqual(['trash_page'])
    expect(messages[2]!.parts[0]).toMatchObject({ isError: true, output: expect.stringMatching(/abgelehnt/) })
  })

  it('stops after maxSteps and can be aborted', async () => {
    const ws = await vault()
    const loop: ModelProvider = {
      chat: async () => [{ type: 'tool_call', id: 'x', name: 'list_tags', input: {} }],
    }
    const messages = await runAgent({ provider: loop, ws, system: 's', messages: [user('?')], maxSteps: 3 })
    expect(messages.at(-1)!.parts[0]).toMatchObject({
      type: 'text',
      text: expect.stringMatching(/zu vielen/),
    })
    const controller = new AbortController()
    controller.abort()
    await expect(
      runAgent({ provider: loop, ws, system: 's', messages: [user('?')], signal: controller.signal }),
    ).rejects.toThrow()
  })

  it('builds a system prompt with date, page and language', () => {
    const prompt = systemPrompt({
      language: 'en',
      now,
      currentPage: { path: 'Studium.md', title: 'Studium' },
      readOnly: true,
    })
    expect(prompt).toMatch(/2026-10-1[34]/)
    expect(prompt).toMatch(/„Studium“ \(Studium\.md\)/)
    expect(prompt).toMatch(/nur lesen/)
    expect(prompt).toMatch(/Answer in English/)
    expect(prompt).toMatch(/keine Anweisungen/)
  })
})

/** Fake HTTP that returns one canned response and records the request. */
function http(status: number, body: unknown) {
  const requests: HttpRequest[] = []
  const client = async (req: HttpRequest): Promise<HttpResponse> => {
    requests.push(req)
    return { status, body: typeof body === 'string' ? body : JSON.stringify(body) }
  }
  return { client, requests }
}

const history: Message[] = [
  user('Hallo'),
  {
    role: 'assistant',
    parts: [
      { type: 'text', text: 'Ich schaue nach.' },
      { type: 'tool_call', id: 't1', name: 'list_tags', input: {} },
    ],
  },
  { role: 'user', parts: [{ type: 'tool_result', id: 't1', name: 'list_tags', output: '{}' }] },
]
const tools = toolSpecs().slice(0, 1)

describe('anthropicProvider', () => {
  const settings = parseAiSettings({
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com/',
    model: 'claude-sonnet-5-5',
    apiKey: 'sk-test',
  })

  it('maps messages, tools and the reply', async () => {
    const { client, requests } = http(200, {
      content: [
        { type: 'text', text: 'Hier:' },
        { type: 'tool_use', id: 'tu1', name: 'read_page', input: { page: 'x' } },
      ],
    })
    const parts = await anthropicProvider(settings, client).chat({ system: 'sys', messages: history, tools })
    expect(parts).toEqual([
      { type: 'text', text: 'Hier:' },
      { type: 'tool_call', id: 'tu1', name: 'read_page', input: { page: 'x' } },
    ])
    const req = requests[0]!
    expect(req.url).toBe('https://api.anthropic.com/v1/messages')
    expect(req.headers['x-api-key']).toBe('sk-test')
    const body = JSON.parse(req.body!) as {
      system: string
      messages: unknown[]
      tools: Array<{ input_schema: unknown }>
    }
    expect(body.system).toBe('sys')
    expect(body.tools[0]!.input_schema).toEqual(tools[0]!.inputSchema)
    expect(body.messages[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'Ich schaue nach.' },
        { type: 'tool_use', id: 't1', name: 'list_tags', input: {} },
      ],
    })
    expect(body.messages[2]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 't1', content: '{}', is_error: false }],
    })
  })

  it('turns API errors into readable messages', async () => {
    const { client } = http(401, { error: { type: 'authentication_error', message: 'invalid x-api-key' } })
    await expect(
      anthropicProvider(settings, client).chat({ system: '', messages: history, tools }),
    ).rejects.toMatchObject({ name: 'ProviderError', message: '401: invalid x-api-key', status: 401 })
  })
})

describe('openAiProvider', () => {
  const settings = parseAiSettings({ baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5' })

  it('maps messages to chat completions and parses tool calls', async () => {
    const { client, requests } = http(200, {
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: 'c1', type: 'function', function: { name: 'read_page', arguments: '{"page":"x"}' } },
              { type: 'function', function: { name: 'list_tags', arguments: 'not json' } },
            ],
          },
        },
      ],
    })
    const parts = await openAiProvider(settings, client).chat({ system: 'sys', messages: history, tools })
    expect(parts[0]).toEqual({ type: 'tool_call', id: 'c1', name: 'read_page', input: { page: 'x' } })
    expect(parts[1]).toMatchObject({
      type: 'tool_call',
      name: 'list_tags',
      input: { _invalidJson: 'not json' },
    })
    expect((parts[1] as { id: string }).id).toBeTruthy()
    const req = requests[0]!
    expect(req.url).toBe('http://localhost:11434/v1/chat/completions')
    expect(req.headers.authorization).toBeUndefined()
    const body = JSON.parse(req.body!) as { messages: unknown[]; tools: unknown[] }
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'Hallo' },
      {
        role: 'assistant',
        content: 'Ich schaue nach.',
        tool_calls: [{ id: 't1', type: 'function', function: { name: 'list_tags', arguments: '{}' } }],
      },
      { role: 'tool', tool_call_id: 't1', content: '{}' },
    ])
    expect(body.tools[0]).toMatchObject({ type: 'function', function: { name: tools[0]!.name } })
  })

  it('sends the key as bearer token and reports server errors', async () => {
    const { client, requests } = http(500, 'model "x" not found')
    const withKey = { ...settings, apiKey: 'k' }
    await expect(
      openAiProvider(withKey, client).chat({ system: '', messages: history, tools }),
    ).rejects.toThrow(/500: model "x" not found/)
    expect(requests[0]!.headers.authorization).toBe('Bearer k')
  })
})

describe('parseAiSettings', () => {
  it('only accepts http(s) URLs without credentials', () => {
    expect(parseAiSettings({ baseUrl: 'javascript:alert(1)' }).baseUrl).toBe('http://localhost:11434/v1')
    expect(parseAiSettings({ baseUrl: 'file:///etc' }).baseUrl).toBe('http://localhost:11434/v1')
    expect(parseAiSettings({ baseUrl: 'https://user:pw@example.com' }).baseUrl).toBe(
      'http://localhost:11434/v1',
    )
    expect(parseAiSettings({ baseUrl: 'https://openrouter.ai/api/v1/' }).baseUrl).toBe(
      'https://openrouter.ai/api/v1',
    )
    expect(parseAiSettings(null)).toMatchObject({ provider: 'openai', allowWrites: true })
  })
})
