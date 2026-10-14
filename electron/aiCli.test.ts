// @vitest-environment node
import { allowedTools, cliArgs, cliInput, parseCliRequest, type CliRequest } from './aiCli'

const base: CliRequest = {
  cli: 'claude',
  prompt: 'Was ist fällig?',
  system: 'Du bist der Notiva-Assistent.',
  model: 'opus',
  sessionId: null,
  allowWrites: true,
}
const mcp = {
  command: '/Apps/Notiva',
  args: ['/res/notiva-mcp.mjs', '/vault'],
  env: { ELECTRON_RUN_AS_NODE: '1' },
}

describe('Claude Code command line', () => {
  it('gives Claude only the Notiva tools via MCP', () => {
    const args = cliArgs(base, mcp)
    expect(args.slice(0, 4)).toEqual(['-p', '--output-format', 'stream-json', '--verbose'])
    expect(args[args.indexOf('--tools') + 1]).toBe('')
    expect(args).toContain('--strict-mcp-config')
    const config = JSON.parse(args[args.indexOf('--mcp-config') + 1]!) as {
      mcpServers: { notiva: typeof mcp }
    }
    expect(config.mcpServers.notiva).toEqual(mcp)
    expect(args[args.indexOf('--append-system-prompt') + 1]).toBe(base.system)
    expect(args[args.indexOf('--model') + 1]).toBe('opus')
    expect(args).not.toContain('--resume')
    expect(cliInput(base)).toBe('Was ist fällig?')
  })

  it('never pre-approves destructive tools; read-only mode allows only reading', () => {
    expect(allowedTools(true)).toContain('mcp__notiva__create_page')
    expect(allowedTools(true)).not.toContain('mcp__notiva__trash_page')
    expect(allowedTools(true)).not.toContain('mcp__notiva__replace_page_body')
    expect(allowedTools(true)).not.toContain('mcp__notiva__remove_widget')
    expect(allowedTools(true)).toContain('mcp__notiva__update_widget')
    expect(allowedTools(false).every((t) => /search|list|read|query|backlinks|format/.test(t))).toBe(true)
    expect(allowedTools(false)).not.toContain('mcp__notiva__update_widget')
    const args = cliArgs({ ...base, allowWrites: false }, mcp)
    const config = JSON.parse(args[args.indexOf('--mcp-config') + 1]!) as {
      mcpServers: { notiva: { args: string[] } }
    }
    expect(config.mcpServers.notiva.args).toContain('--read-only')
  })

  it('continues a conversation with --resume', () => {
    const args = cliArgs({ ...base, sessionId: '6011ed52-2a7d-4a02' }, mcp)
    expect(args[args.indexOf('--resume') + 1]).toBe('6011ed52-2a7d-4a02')
  })
})

describe('other CLIs', () => {
  it('pass instructions with the prompt', () => {
    expect(cliArgs({ ...base, cli: 'codex', model: '' }, null)).toEqual([
      'exec',
      '--skip-git-repo-check',
      '--sandbox',
      'read-only',
      '-',
    ])
    expect(cliInput({ ...base, cli: 'codex' })).toContain('Du bist der Notiva-Assistent.')
    expect(cliArgs({ ...base, cli: 'gemini', model: '' }, null)[1]).toContain('Was ist fällig?')
  })
})

describe('parseCliRequest', () => {
  it('accepts valid requests and rejects everything else', () => {
    expect(parseCliRequest(base)).toEqual(base)
    expect(() => parseCliRequest({ ...base, cli: 'bash' })).toThrow(/Unknown/)
    expect(() => parseCliRequest({ ...base, model: 'opus; rm -rf ~' })).toThrow(/model/)
    expect(() => parseCliRequest({ ...base, sessionId: '../../x' })).toThrow(/session/)
    expect(() => parseCliRequest({ ...base, prompt: '' })).toThrow(/prompt/)
    expect(parseCliRequest({ ...base, allowWrites: 'yes' }).allowWrites).toBe(false)
  })
})
