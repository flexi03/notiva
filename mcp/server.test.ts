// @vitest-environment node
import { mkdtempSync, promises as fs, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { installPack, studyPack } from '../src/lib/packs'
import { Workspace } from '../src/lib/workspace'
import { createServer, folderVault } from './server'

const now = new Date(2026, 9, 14, 10)

async function connect(options: { readOnly?: boolean } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'notiva-mcp-'))
  const ws = await Workspace.open(await folderVault(root))
  await installPack(ws, studyPack, {}, '', now)
  const server = createServer(ws, { ...options, now: () => now })
  const client = new Client({ name: 'test', version: '1' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(a), client.connect(b)])
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = (await client.callTool({ name, arguments: args })) as {
      content: Array<{ type: string; text: string }>
      isError?: boolean
    }
    return { text: result.content[0]!.text, isError: result.isError === true }
  }
  return { root, ws, client, call }
}

describe('MCP server', () => {
  it('lists all tools with schemas and hints', async () => {
    const { client } = await connect()
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name)).toContain('query_database')
    const trash = tools.find((t) => t.name === 'trash_page')!
    expect(trash.annotations).toMatchObject({ destructiveHint: true, readOnlyHint: false })
    expect(tools.find((t) => t.name === 'read_page')!.inputSchema).toMatchObject({
      type: 'object',
      required: ['page'],
    })
  })

  it('answers questions about the study vault', async () => {
    const { call } = await connect()
    const result = await call('query_database', {
      database: 'Prüfungen',
      filter: [{ property: 'Datum', op: 'after', value: 'today' }],
      sort: [{ property: 'Datum', direction: 'asc' }],
      limit: 1,
    })
    expect(result.isError).toBe(false)
    expect(JSON.parse(result.text)).toMatchObject({ rows: [{ title: 'Klausur Lineare Algebra' }] })
  })

  it('writes real Markdown files and sees changes made by others', async () => {
    const { root, call } = await connect()
    await call('create_page', { title: 'Von Claude', folder: 'Studium', body: 'Hallo [[Datenbanken]]' })
    expect(await fs.readFile(path.join(root, 'Studium', 'Von Claude.md'), 'utf8')).toContain(
      'Hallo [[Datenbanken]]',
    )
    // Another app writes a file: the next call sees it (workspace reloads per call).
    writeFileSync(path.join(root, 'Extern.md'), '# Von außen\n\nNotiz aus einem anderen Editor')
    const hits = JSON.parse((await call('search_pages', { query: 'anderen Editor' })).text) as Array<{
      path: string
    }>
    expect(hits.map((h) => h.path)).toContain('Extern.md')
  })

  it('read-only mode hides and refuses write tools', async () => {
    const { client, call } = await connect({ readOnly: true })
    const names = (await client.listTools()).tools.map((t) => t.name)
    expect(names).not.toContain('create_page')
    expect(names).toContain('read_page')
    expect(await call('trash_page', { page: 'Module' })).toMatchObject({ isError: true })
  })

  it('cannot reach files outside the vault, also not through symlinks', async () => {
    const { root, call } = await connect()
    const outside = mkdtempSync(path.join(os.tmpdir(), 'notiva-outside-'))
    writeFileSync(path.join(outside, 'secret.md'), 'geheim')
    symlinkSync(outside, path.join(root, 'link'))
    expect((await call('read_page', { page: '../secret.md' })).isError).toBe(true)
    expect((await call('read_page', { page: 'link/secret.md' })).isError).toBe(true)
    expect((await call('create_page', { title: 'x', folder: 'link' })).isError).toBe(true)
    expect(await fs.readdir(outside)).toEqual(['secret.md'])
  })

  it('reports invalid arguments as tool errors, not crashes', async () => {
    const { call } = await connect()
    expect(await call('read_page', {})).toMatchObject({
      isError: true,
      text: expect.stringMatching(/page fehlt/),
    })
    expect(await call('does_not_exist', {})).toMatchObject({ isError: true })
  })
})
