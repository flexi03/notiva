/**
 * CLI entry: `notiva-mcp <vault folder> [--read-only]` (or NOTIVA_VAULT=…).
 * Speaks MCP over stdin/stdout; logs go to stderr only.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Workspace } from '../src/lib/workspace'
import { readFile } from 'node:fs/promises'
import type { MoodleSnapshot } from '../src/lib/moodle'
import type { ExamSnapshot } from '../src/lib/ecampus'
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
  // Started by the desktop app: the last Moodle fetch (no secrets) lies in its profile folder.
  const snapshotFile = process.env.NOTIVA_MOODLE_SNAPSHOT
  const moodle = snapshotFile
    ? async () => {
        try {
          return JSON.parse(await readFile(snapshotFile, 'utf8')) as MoodleSnapshot
        } catch {
          return null
        }
      }
    : undefined
  const examsFile = process.env.NOTIVA_ECAMPUS_SNAPSHOT
  const exams = examsFile
    ? async () => {
        try {
          return JSON.parse(await readFile(examsFile, 'utf8')) as ExamSnapshot
        } catch {
          return null
        }
      }
    : undefined
  const server = createServer(ws, {
    readOnly: args.includes('--read-only'),
    ...(moodle ? { moodle } : {}),
    ...(exams ? { exams } : {}),
  })
  await server.connect(new StdioServerTransport())
  process.stderr.write(`notiva-mcp: ${ws.all().length} Seiten in ${folder}\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(`notiva-mcp: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
