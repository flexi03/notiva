#!/usr/bin/env node
// A tiny git for the clone e2e test: like ProjectBase, a clone without token is sent to the
// sign-in page; with the token header (passed via GIT_CONFIG_* env, never argv) it works.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
if (process.env.FAKE_GIT_LOG) appendFileSync(process.env.FAKE_GIT_LOG, `${JSON.stringify(args)}\n`)
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
