/**
 * AI command line tools as assistant backend (main process). Only known programs are started and
 * their arguments are built here – the renderer only sends prompt, model and options.
 *
 * Claude Code gets the Notiva tools through the bundled MCP server and nothing else: its own file,
 * shell and web tools are switched off (`--tools ""`), MCP servers from other configs are ignored
 * (`--strict-mcp-config`) and only the allowed Notiva tools may run without asking.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { execFile } from 'node:child_process'
import { TOOLS } from '../src/lib/ai/tools'
import { which } from './shellPath'

export type CliId = 'claude' | 'codex' | 'gemini'

export interface CliInfo {
  id: CliId
  path: string
  version: string
}

export interface CliRequest {
  cli: CliId
  prompt: string
  system: string
  model: string
  sessionId: string | null
  allowWrites: boolean
}

export interface McpLaunch {
  command: string
  args: string[]
  env: Record<string, string>
}

const CLIS: CliId[] = ['claude', 'codex', 'gemini']

export async function detectClis(): Promise<CliInfo[]> {
  const found: CliInfo[] = []
  for (const id of CLIS) {
    const path = await which(id)
    if (!path) continue
    const version = await new Promise<string>((resolve) =>
      execFile(path, ['--version'], { timeout: 8000 }, (_e, stdout) =>
        resolve(String(stdout).trim().split('\n')[0] ?? ''),
      ),
    )
    found.push({ id, path, version })
  }
  return found
}

export function parseCliRequest(raw: unknown): CliRequest {
  if (typeof raw !== 'object' || raw === null) throw new Error('Invalid request')
  const r = raw as Record<string, unknown>
  if (!CLIS.includes(r.cli as CliId)) throw new Error('Unknown CLI')
  if (typeof r.prompt !== 'string' || !r.prompt.trim() || r.prompt.length > 100_000)
    throw new Error('Invalid prompt')
  if (typeof r.system !== 'string' || r.system.length > 30_000) throw new Error('Invalid system prompt')
  const model = typeof r.model === 'string' ? r.model.trim() : ''
  if (!/^[\w.:@/-]{0,100}$/.test(model)) throw new Error('Invalid model')
  const sessionId = typeof r.sessionId === 'string' && r.sessionId ? r.sessionId : null
  if (sessionId && !/^[\w-]{8,100}$/.test(sessionId)) throw new Error('Invalid session')
  return {
    cli: r.cli as CliId,
    prompt: r.prompt,
    system: r.system,
    model,
    sessionId,
    allowWrites: r.allowWrites === true,
  }
}

/** Tools Claude may use without asking: read tools, plus non-destructive write tools if allowed. */
export function allowedTools(allowWrites: boolean): string[] {
  return TOOLS.filter((t) => t.readOnly || (allowWrites && !t.destructive)).map(
    (t) => `mcp__notiva__${t.name}`,
  )
}

/** Command line (without the executable) for a request – also shown to the user in the app. */
export function cliArgs(request: CliRequest, mcp: McpLaunch | null): string[] {
  switch (request.cli) {
    case 'claude': {
      const args = ['-p', '--output-format', 'stream-json', '--verbose']
      if (mcp) {
        const server = {
          command: mcp.command,
          args: request.allowWrites ? mcp.args : [...mcp.args, '--read-only'],
          env: mcp.env,
        }
        args.push('--mcp-config', JSON.stringify({ mcpServers: { notiva: server } }), '--strict-mcp-config')
      }
      args.push('--tools', '', '--allowedTools', allowedTools(request.allowWrites).join(' '))
      if (request.system) args.push('--append-system-prompt', request.system)
      if (request.model) args.push('--model', request.model)
      if (request.sessionId) args.push('--resume', request.sessionId)
      return args
    }
    case 'codex':
      // Prompt (incl. instructions) comes via stdin; read-only sandbox in the vault folder.
      return [
        'exec',
        '--skip-git-repo-check',
        '--sandbox',
        'read-only',
        ...(request.model ? ['--model', request.model] : []),
        '-',
      ]
    case 'gemini':
      return [
        ...(request.model ? ['--model', request.model] : []),
        '-p',
        `${request.system}\n\n---\n\n${request.prompt}`,
      ]
  }
}

/** What goes to stdin: Claude gets the system prompt separately, the others in front of the text. */
export function cliInput(request: CliRequest): string {
  if (request.cli === 'claude') return request.prompt
  if (request.cli === 'codex') return `${request.system}\n\n---\n\n${request.prompt}`
  return ''
}

export interface CliRun {
  process: ChildProcess
}

/**
 * Starts the CLI in the vault folder. `onLine` gets every stdout line (Claude: one JSON event per
 * line, others: plain text), `onExit` the exit code and stderr.
 */
export function startCli(
  executable: string,
  request: CliRequest,
  cwd: string,
  mcp: McpLaunch | null,
  onLine: (line: string) => void,
  onExit: (code: number | null, stderr: string) => void,
): ChildProcess {
  const child = spawn(executable, cliArgs(request, mcp), {
    cwd,
    env: { ...process.env, NO_COLOR: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let buffer = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      onLine(buffer.slice(0, newline))
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
    }
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    stderr = (stderr + chunk).slice(-4000)
  })
  child.on('error', (error) => onExit(null, error.message))
  child.on('close', (code) => {
    if (buffer) onLine(buffer)
    onExit(code, stderr)
  })
  child.stdin.end(cliInput(request))
  return child
}
