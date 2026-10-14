/**
 * Optional: the full lecture mode with the real local Whisper (whisper.cpp must be installed).
 *   NOTIVA_E2E_WHISPER_MODEL=…/ggml-large-v3-turbo-q5_0.bin NOTIVA_E2E_SPEECH=…/speech.wav npx playwright test electron-whisper-real
 * The speech file stands in for the microphone (e.g. made with `say -v Anna -o x.aiff …` + afconvert).
 */
import { _electron as electron, expect, test } from '@playwright/test'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const MODEL = process.env.NOTIVA_E2E_WHISPER_MODEL
const SPEECH = process.env.NOTIVA_E2E_SPEECH

test.skip(!MODEL || !SPEECH, 'nur mit lokalem Whisper-Modell und Sprachdatei')

test('schreibt mit dem lokalen Whisper mit', async () => {
  test.setTimeout(180_000)
  const folder = mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-whisper-'))
  const user = mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-user-'))
  mkdirSync(path.join(user, 'whisper-models'))
  symlinkSync(MODEL!, path.join(user, 'whisper-models', path.basename(MODEL!)))
  writeFileSync(path.join(folder, 'Start.md'), '# Start\n')
  copyFileSync('e2e/fixtures/graphen.pdf', path.join(folder, 'Graphen.pdf'))
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      NOTIVA_E2E_FOLDER: folder,
      NOTIVA_E2E_USERDATA: user,
      NOTIVA_E2E_FAKE_AUDIO: SPEECH!,
    },
  })
  const w = await app.firstWindow()
  await w.getByRole('button', { name: 'Ordner wählen' }).click()
  await w.evaluate(() => (location.hash = '#/f/Graphen.pdf'))
  const toggle = w.getByRole('button', { name: 'Notizen ein-/ausblenden' })
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click()
  const panel = w.getByRole('region', { name: 'Vorlesung live' })
  await expect(panel).toContainText('Lokal mit Whisper')
  await panel.getByRole('button', { name: 'Aufnahme starten' }).click()
  await w.waitForTimeout(17_000)
  await panel.getByRole('button', { name: 'Beenden' }).click()
  await expect(panel.getByRole('button', { name: 'Zusammenfassen lassen' })).toBeVisible({ timeout: 120_000 })
  const file = path.join(folder, `Graphen – Mitschrift ${new Date().toISOString().slice(0, 10)}.md`)
  expect(readFileSync(file, 'utf8')).toContain('Breitensuche')
  await app.close()
})
