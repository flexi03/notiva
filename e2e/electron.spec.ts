import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { spawn } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

let app: ElectronApplication
let window: Page
let folder: string

test.beforeAll(async () => {
  folder = mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-vault-'))
  writeFileSync(path.join(folder, 'Vorhanden.md'), '# Schon da\n\nAus dem Dateisystem.')
  app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      NOTIVA_E2E_FOLDER: folder,
      NOTIVA_E2E_USERDATA: mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-user-')),
    },
  })
  window = await app.firstWindow()
})

test.afterAll(async () => {
  await app?.close()
})

test('Renderer ist abgeschottet (kein Node, nur die Notiva-Brücke)', async () => {
  const env = await window.evaluate(() => ({
    require: typeof (globalThis as { require?: unknown }).require,
    process: typeof (globalThis as { process?: unknown }).process,
    bridge: Object.keys((window as unknown as { notiva: object }).notiva).sort(),
    origin: location.origin,
  }))
  expect(env).toEqual({
    require: 'undefined',
    process: 'undefined',
    bridge: [
      'aiCli',
      'aiRequest',
      'code',
      'ecampus',
      'examPlan',
      'git',
      'lastFolder',
      'mcpInfo',
      'microphone',
      'moodle',
      'notifications',
      'onMenu',
      'onVaultChange',
      'openExternal',
      'openWithSystem',
      'pickFolder',
      'platform',
      'restart',
      'syncSchedule',
      'terminal',
      'transcribe',
      'update',
      'vault',
      'whisper',
    ],
    origin: 'app://notiva',
  })
})

test('öffnet einen Ordner und schreibt echte Markdown-Dateien', async () => {
  await window.getByRole('button', { name: 'Ordner wählen' }).click()
  await expect(
    window.getByRole('navigation', { name: 'Seiten' }).getByRole('button', { name: 'Vorhanden' }),
  ).toBeVisible()
  await window.keyboard.press('ControlOrMeta+k')
  await window.getByRole('combobox').fill('Vom Desktop')
  await window.keyboard.press('Enter')
  await expect.poll(() => existsSync(path.join(folder, 'Vom Desktop.md'))).toBe(true)
})

test('zeigt Änderungen von außen sofort an', async () => {
  writeFileSync(path.join(folder, 'Von Außen.md'), 'Per Sync hinzugefügt')
  await expect(
    window.getByRole('navigation', { name: 'Seiten' }).getByRole('button', { name: 'Von Außen' }),
  ).toBeVisible({ timeout: 10_000 })
})

test('Brücke lehnt Pfade außerhalb des Ordners ab', async () => {
  const results = await window.evaluate(async () => {
    const vault = (
      window as unknown as {
        notiva: { vault: { read(p: string): Promise<string>; write(p: string, c: string): Promise<void> } }
      }
    ).notiva.vault
    const attempt = (p: Promise<unknown>) =>
      p.then(
        () => 'ok',
        (e: Error) => e.message,
      )
    return [
      await attempt(vault.read('../../etc/passwd')),
      await attempt(vault.write('/tmp/evil.md', 'x')),
      await attempt(vault.read('a/../../x.md')),
    ]
  })
  expect(results.every((r) => /Unsafe path/.test(r))).toBe(true)
  expect(existsSync('/tmp/evil.md')).toBe(false)
})

test('Navigation weg von der App und neue Fenster sind gesperrt', async () => {
  await window.evaluate(() => {
    location.href = 'https://example.com'
  })
  await window.waitForTimeout(500)
  expect(window.url()).toMatch(/^app:\/\/notiva\//)
  expect(app.windows()).toHaveLength(1)
  expect(readFileSync(path.join(folder, 'Vorhanden.md'), 'utf8')).toContain('Schon da')
})

test('KI-Anfragen laufen nur über den Hauptprozess (Renderer hat kein Netz)', async () => {
  const server: Server = createServer((req, res) => {
    let body = ''
    req.on('data', (c: Buffer) => (body += c.toString()))
    req.on('end', () => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ echo: JSON.parse(body || '{}'), auth: req.headers.authorization ?? null }))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1/chat/completions`
  try {
    const result = await window.evaluate(async (target) => {
      const bridge = (
        window as unknown as {
          notiva: {
            aiRequest(r: object): Promise<{ status: number; body: string }>
          }
        }
      ).notiva
      const direct = await fetch(target, { method: 'POST' }).then(
        () => 'erreicht',
        () => 'blockiert',
      )
      const viaMain = await bridge.aiRequest({
        url: target,
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer k' },
        body: '{"hallo":1}',
      })
      const fileUrl = await bridge.aiRequest({ url: 'file:///etc/passwd', method: 'GET', headers: {} }).then(
        () => 'ok',
        (e: Error) => e.message,
      )
      return { direct, viaMain, fileUrl }
    }, url)
    expect(result.direct).toBe('blockiert')
    expect(result.viaMain.status).toBe(200)
    expect(JSON.parse(result.viaMain.body)).toEqual({ echo: { hallo: 1 }, auth: 'Bearer k' })
    expect(result.fileUrl).toMatch(/Only http/)
  } finally {
    server.close()
  }
})

test('startet den MCP-Server für den offenen Ordner mit der App selbst', async () => {
  const info = await window.evaluate(() =>
    (
      window as unknown as {
        notiva: { mcpInfo(): Promise<{ command: string; args: string[]; env: Record<string, string> }> }
      }
    ).notiva.mcpInfo(),
  )
  expect(info.args[1]).toBe(realpathSync(folder))
  expect(info.env).toEqual({
    ELECTRON_RUN_AS_NODE: '1',
    NOTIVA_MOODLE_SNAPSHOT: expect.stringMatching(/moodle-snapshot\.json$/),
    NOTIVA_ECAMPUS_SNAPSHOT: expect.stringMatching(/ecampus-snapshot\.json$/),
  })
  // Speak MCP with the exact command line AI apps would use.
  const child = spawn(info.command, info.args, { env: { ...process.env, ...info.env } })
  const lines: string[] = []
  child.stdout.on('data', (chunk: Buffer) => lines.push(...chunk.toString().split('\n').filter(Boolean)))
  const send = (msg: object) => child.stdin.write(`${JSON.stringify(msg)}\n`)
  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } },
  })
  send({ jsonrpc: '2.0', method: 'notifications/initialized' })
  send({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'search_pages', arguments: { query: 'Schon da' } },
  })
  try {
    await expect.poll(() => lines.some((l) => l.includes('"id":2')), { timeout: 15_000 }).toBe(true)
    const reply = JSON.parse(lines.find((l) => l.includes('"id":2'))!) as {
      result: { content: Array<{ text: string }> }
    }
    expect(reply.result.content[0]!.text).toContain('Vorhanden.md')
  } finally {
    child.kill()
  }
})
