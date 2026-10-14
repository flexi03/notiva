import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PDF = fileURLToPath(new URL('./fixtures/graphen.pdf', import.meta.url))

/** 8 s of a 300 Hz tone as 48 kHz WAV – the "microphone" (never the real one). */
function toneWav(file: string) {
  const rate = 48000
  const samples = rate * 8
  const buf = Buffer.alloc(44 + samples * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + samples * 2, 4)
  buf.write('WAVEfmt ', 8)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(rate, 24)
  buf.writeUInt32LE(rate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++)
    buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 300 * i) / rate) * 9000), 44 + i * 2)
  writeFileSync(file, buf)
}

let app: ElectronApplication
let window: Page
let folder: string
let server: Server
const requests: Array<{ model: string; prompt: string; size: number }> = []

test.beforeAll(async () => {
  // A Whisper-compatible server that "hears" a sentence about breadth-first search.
  server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('latin1')
      const field = (name: string) => new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`).exec(body)?.[1] ?? ''
      requests.push({ model: field('model'), prompt: field('prompt'), size: body.length })
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          text: ' Bei der Breitensuche gehen wir Ebene für Ebene vor, mit einer Warteschlange.',
          segments: [
            {
              start: 0,
              end: 2.5,
              text: ' Bei der Breitensuche gehen wir Ebene für Ebene vor, mit einer Warteschlange.',
            },
          ],
        }),
      )
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  const port = (server.address() as { port: number }).port

  folder = mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-lecture-'))
  writeFileSync(path.join(folder, 'Skripte.md'), '# Skripte\n')
  mkdirSync(path.join(folder, 'Skripte'))
  copyFileSync(PDF, path.join(folder, 'Skripte/Graphen.pdf'))
  const wav = path.join(mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-audio-')), 'tone.wav')
  toneWav(wav)
  app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      NOTIVA_E2E_FOLDER: folder,
      NOTIVA_E2E_USERDATA: mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-user-')),
      NOTIVA_E2E_FAKE_AUDIO: wav,
    },
  })
  window = await app.firstWindow()
  await window.evaluate((url) => {
    localStorage.setItem(
      'notiva.transcribe',
      JSON.stringify({ preset: 'local-server', baseUrl: url, model: 'whisper-1', language: 'de' }),
    )
  }, `http://127.0.0.1:${port}/v1`)
  await window.getByRole('button', { name: 'Ordner wählen' }).click()
  await window.evaluate(() => (location.hash = '#/f/Skripte%2FGraphen.pdf'))
  await expect(window.getByTestId('pdf-pages')).toHaveText('/ 3')
  const toggle = window.getByRole('button', { name: 'Notizen ein-/ausblenden' })
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click()
})

test.afterAll(async () => {
  await app?.close()
  server?.close()
})

test('schreibt die Vorlesung mit und folgt den Folien', async () => {
  const panel = window.getByRole('region', { name: 'Vorlesung live' })
  await expect(panel).toContainText('Eigener Whisper-Server')
  await panel.getByRole('button', { name: 'Aufnahme starten' }).click()
  await expect(panel.getByRole('button', { name: 'Beenden' })).toBeVisible()
  await expect(panel.getByRole('meter', { name: 'Lautstärke' })).not.toHaveAttribute('aria-valuenow', '0', {
    timeout: 5000,
  })
  await window.waitForTimeout(17000)
  await panel.getByRole('button', { name: 'Beenden' }).click()

  const log = panel.getByRole('log', { name: 'Live-Transkript' })
  await expect(log).toContainText('Breitensuche')
  // Detected slide 2 (BFS) and turned there.
  await expect(log).toContainText('F2')
  await expect(window.locator('#pdf-page')).toHaveAttribute('placeholder', '2')
  expect(requests[0]).toMatchObject({ model: 'whisper-1' })
  // The slide text is sent as vocabulary hint.
  expect(requests[0]!.prompt).toContain('Vorlesung 3: Graphen')

  const transcript = readFileSync(
    path.join(folder, `Skripte/Graphen – Mitschrift ${new Date().toISOString().slice(0, 10)}.md`),
    'utf8',
  )
  expect(transcript).toContain('type: lecture')
  expect(transcript).toContain('## Zusammenfassung')
  expect(transcript).toMatch(/### Folie 2\n\n\*\*\[00:00\]\*\* Bei der Breitensuche/)
  await expect(panel.getByRole('button', { name: 'Zusammenfassen lassen' })).toBeVisible()
})
