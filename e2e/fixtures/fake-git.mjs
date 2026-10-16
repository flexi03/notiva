#!/usr/bin/env node
// A tiny git for the clone e2e test: like ProjectBase, a clone without token is sent to the
// sign-in page; with the token header (passed via GIT_CONFIG_* env, never argv) it works.
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
if (process.env.FAKE_GIT_LOG) appendFileSync(process.env.FAKE_GIT_LOG, `${JSON.stringify(args)}\n`)
// FAKE_GIT_REAL: everything but the network – a clone becomes a real repository with one commit,
// all other commands run the real git (status, diff, commit … in the user flow test).
if (process.env.FAKE_GIT_REAL) {
  const { execFileSync, spawnSync } = await import('node:child_process')
  if (args[0] === 'clone') {
    const target = args[args.length - 1]
    const url = args[args.length - 2]
    mkdirSync(target, { recursive: true })
    writeFileSync(path.join(target, 'aufgabe.sql'), '-- Aufgabe P02\nselect 1;\n')
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: 'Dozent',
      GIT_AUTHOR_EMAIL: 'd@example.org',
      GIT_COMMITTER_NAME: 'Dozent',
      GIT_COMMITTER_EMAIL: 'd@example.org',
    }
    for (const a of [
      ['init', '-q', '-b', 'main'],
      ['add', '.'],
      ['commit', '-q', '-m', 'Aufgabe'],
      ['remote', 'add', 'origin', url],
    ])
      execFileSync('git', a, { cwd: target, env })
    process.exit(0)
  }
  const r = spawnSync('git', args, { stdio: 'inherit', env: process.env })
  process.exit(r.status ?? 1)
}

// Inside a got repository: what "Aktualisieren" needs. ".git/new" marks a change on the server.
const cwd = process.cwd()
const marker = path.join(cwd, '.git', 'new')
if (args[0] !== 'clone' && existsSync(path.join(cwd, '.git', 'config'))) {
  const out = (s) => process.stdout.write(s)
  if (args[0] === 'config')
    out(/url = (\S+)/.exec(readFileSync(path.join(cwd, '.git', 'config'), 'utf8'))[1] + '\n')
  else if (args[0] === 'log' && existsSync(marker)) out('abc1234\t2026-10-16\tAufgabe 2 ergänzt\n')
  else if (args[0] === 'diff' && existsSync(marker)) out('aufgabe2.sql\n')
  else if (args[0] === 'merge') {
    writeFileSync(path.join(cwd, 'aufgabe2.sql'), 'select 2;\n')
    rmSync(marker, { force: true })
  }
  process.exit(0)
}
if (args[0] !== 'clone') {
  process.stderr.write('fatal: not a git repository (or any of the parent directories): .git\n')
  process.exit(128)
}
const target = args[args.length - 1]
const header = process.env.GIT_CONFIG_VALUE_0 ?? ''
if (!header.startsWith('Authorization: Basic ')) {
  process.stderr.write(
    `Cloning into '${path.basename(target)}'...\nfatal: unable to update url base from redirection:\n`,
  )
  process.exit(128)
}
process.stderr.write('Receiving objects:  50% (1/2)\rReceiving objects: 100% (2/2), done.\n')
mkdirSync(target, { recursive: true })
writeFileSync(path.join(target, 'aufgabe.sql'), 'select 1;\n')
mkdirSync(path.join(target, '.git'), { recursive: true })
writeFileSync(path.join(target, '.git', 'config'), `[remote "origin"]\n\turl = ${args[args.length - 2]}\n`)
