import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// A fake `claude` on PATH that behaves like Claude Code (see fixtures/fake-cli/claude).
const FAKE_BIN = fileURLToPath(new URL('./fixtures/fake-cli', import.meta.url))

let app: ElectronApplication
let window: Page
let folder: string
let log: string

const calls = () =>
  readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { args: string[]; prompt: string })
const arg = (args: string[], name: string) => args[args.indexOf(name) + 1]
const panel = () => window.getByRole('complementary', { name: 'Assistent' })

test.beforeAll(async () => {
  folder = mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-cli-'))
  log = path.join(mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-log-')), 'calls.jsonl')
  writeFileSync(log, '')
  writeFileSync(path.join(folder, 'Start.md'), '# Start\n')
  app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      PATH: `${FAKE_BIN}${path.delimiter}${process.env.PATH}`,
      FAKE_CLAUDE_LOG: log,
      NOTIVA_E2E_FOLDER: folder,
      NOTIVA_E2E_USERDATA: mkdtempSync(path.join(os.tmpdir(), 'notiva-e2e-user-')),
    },
  })
  window = await app.firstWindow()
  await window.getByRole('button', { name: 'Ordner wählen' }).click()
  await window.getByRole('navigation', { name: 'Seiten' }).getByRole('button', { name: 'Start' }).click()
})

test.afterAll(async () => {
  await app?.close()
})

async function send(text: string) {
  const input = panel().getByRole('textbox', { name: 'Frag etwas oder gib eine Aufgabe …' })
  await input.fill(text)
  await input.press('Enter')
}

test('erkennt Claude Code und richtet es mit einem Klick ein', async () => {
  await window.getByRole('button', { name: 'KI-Assistent (⌘J)' }).click()
  await expect(panel()).toContainText('Claude Code ist installiert (9.9.9 (Fake Claude))')
  await panel().getByRole('button', { name: 'Claude Code verwenden' }).click()
  await expect(window.getByTestId('ai-model')).toHaveText('Claude Code · opus')
})

test('arbeitet über die Notiva-Werkzeuge und zeigt den gesendeten Prompt', async () => {
  await send('Leg eine Seite an')
  await expect(panel()).toContainText('Legt an Von Claude')
  await expect(panel()).toContainText('Angelegt: Von Claude')
  await expect.poll(() => existsSync(path.join(folder, 'Von Claude.md'))).toBe(true)
  expect(readFileSync(path.join(folder, 'Von Claude.md'), 'utf8')).toContain('Auftrag: Leg eine Seite an')
  // The new page appears in the sidebar and opens from the chat.
  await panel().getByRole('button', { name: 'Von Claude' }).click()
  await expect(
    window.getByRole('dialog').getByRole('heading', { level: 1 }).getByRole('textbox'),
  ).toHaveValue('Von Claude')
  await window.keyboard.press('Escape')

  const { args, prompt } = calls().at(-1)!
  // Context of the open page first, the request last.
  expect(prompt.trim().split('\n').at(-1)).toBe('Leg eine Seite an')
  expect(arg(args, '--tools')).toBe('')
  expect(args).toContain('--strict-mcp-config')
  expect(arg(args, '--model')).toBe('opus')
  expect(arg(args, '--allowedTools')).toContain('mcp__notiva__create_page')
  expect(arg(args, '--allowedTools')).not.toContain('trash_page')
  expect(arg(args, '--append-system-prompt')).toContain('„Start“ (Start.md)')

  await panel().getByText('Gesendet').click()
  await expect(panel()).toContainText('claude-opus-5-5')
  await expect(panel()).toContainText('--strict-mcp-config')
})

test('setzt das Gespräch fort und nutzt den eigenen Prompt', async () => {
  await panel().getByRole('button', { name: 'Prompt anzeigen und bearbeiten' }).click()
  const dialog = window.getByRole('dialog', { name: 'Prompt' })
  await expect(dialog.getByLabel('Standard')).toContainText('Du bist der Assistent in Notiva')
  await dialog.getByRole('radio', { name: 'Eigener' }).click()
  await dialog.getByRole('textbox', { name: 'Eigener Prompt' }).fill('Sei sehr knapp. {{sprache}}')
  await expect(dialog.getByTestId('prompt-preview')).toHaveText('Sei sehr knapp. Antworte auf Deutsch.')
  await dialog.getByRole('button', { name: 'Prompt speichern' }).click()

  await send('Und noch eine')
  await expect(panel()).toContainText('(fortgesetzt)')
  const { args } = calls().at(-1)!
  expect(arg(args, '--resume')).toBe('fake-session-1234')
  expect(arg(args, '--append-system-prompt')).toBe('Sei sehr knapp. Antworte auf Deutsch.')

  // A new chat starts a new session; the default prompt can always be restored.
  await panel().getByRole('button', { name: 'Neuer Chat' }).click()
  await panel().getByRole('button', { name: 'Prompt anzeigen und bearbeiten' }).click()
  await dialog.getByRole('radio', { name: 'Standard' }).click()
  await dialog.getByRole('button', { name: 'Prompt speichern' }).click()
  await send('Neu')
  await expect(panel()).toContainText('Angelegt')
  const last = calls().at(-1)!.args
  expect(last).not.toContain('--resume')
  expect(arg(last, '--append-system-prompt')).toContain('Du bist der Assistent in Notiva')
})

test('/ki im Editor öffnet den Assistenten mit dem Absatz als Bezug', async () => {
  await window.getByRole('button', { name: 'KI-Assistent (⌘J)' }).click() // close
  await window.locator('#main').getByRole('button', { name: 'Block hinzufügen' }).last().click()
  await window.keyboard.type('Photosynthese erklären /ki')
  await window.keyboard.press('Enter')
  await expect(panel().getByRole('textbox', { name: 'Frag etwas oder gib eine Aufgabe …' })).toHaveValue(
    'Zu „Photosynthese erklären“: ',
  )
})
