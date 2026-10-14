/**
 * CLI entry: `notiva-mcp <vault folder> [--read-only]` (or NOTIVA_VAULT=…).
 * Speaks MCP over stdin/stdout; logs go to stderr only.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Workspace } from '../src/lib/workspace'
import { createServer, folderVault } from './server'

const USAGE = `Notiva MCP-Server

  notiva-mcp <Ordner> [--read-only]

  <Ordner>      Notiva-Vault (oder Umgebungsvariable NOTIVA_VAULT)
  --read-only   nur lesende Werkzeuge anbieten
`

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    process.stderr.write(USAGE)
    return
  }
  const folder = args.find((a) => !a.startsWith('--')) ?? process.env.NOTIVA_VAULT
  if (!folder) {
    process.stderr.write(USAGE)
    process.exit(2)
  }
  const ws = await Workspace.open(await folderVault(folder))
  const server = createServer(ws, { readOnly: args.includes('--read-only') })
  await server.connect(new StdioServerTransport())
  process.stderr.write(`notiva-mcp: ${ws.all().length} Seiten in ${folder}\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(`notiva-mcp: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
