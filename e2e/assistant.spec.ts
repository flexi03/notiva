import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'
import { go, isMobile, openDemo, pageErrors, peek, peekTitle } from './helpers'

const ENDPOINT = 'http://localhost:11434/v1/chat/completions'

interface ChatBody {
  model: string
  messages: Array<{ role: string; content: string | null; tool_call_id?: string }>
  tools?: Array<{ function: { name: string } }>
}

/** A scripted OpenAI-compatible model: `reply` gets every request body and returns the message. */
async function fakeModel(page: Page, reply: (body: ChatBody, turn: number) => unknown) {
  const bodies: ChatBody[] = []
  await page.route(ENDPOINT, async (route: Route) => {
    const body = route.request().postDataJSON() as ChatBody
    bodies.push(body)
    const message = reply(body, bodies.length)
    await route.fulfill({
      status: typeof message === 'number' ? message : 200,
      contentType: 'application/json',
      body: JSON.stringify(
        typeof message === 'number'
          ? { error: { message: 'model "qwen2.5" not found' } }
          : { choices: [{ message }] },
      ),
    })
  })
  return bodies
}

const toolCall = (name: string, args: unknown) => ({
  content: null,
  tool_calls: [{ id: `call_${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
})

/** Opens the demo with the assistant already configured (Ollama preset) on this device. */
async function openWithAi(page: Page, settings: object = {}) {
  await page.addInitScript((s) => {
    localStorage.setItem(
      'notiva.ai',
      JSON.stringify({ provider: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5', ...s }),
    )
  }, settings)
  await openDemo(page)
}

const panel = (page: Page) => page.getByRole('complementary', { name: 'Assistent' })

async function ask(page: Page, text: string) {
  await page.getByRole('button', { name: 'KI-Assistent (⌘J)' }).click()
  const input = panel(page).getByRole('textbox', { name: 'Frag etwas oder gib eine Aufgabe …' })
  await input.fill(text)
  await input.press('Enter')
}

test.describe('KI-Assistent', () => {
  test.afterEach(({ page }) => expect(pageErrors(page)).toEqual([]))

  test('führt ohne Einstellungen zur Einrichtung und testet die Verbindung', async ({ page }) => {
    await openDemo(page)
    await fakeModel(page, () => ({ content: 'OK' }))
    await page.getByRole('button', { name: 'KI-Assistent (⌘J)' }).click()
    await expect(panel(page)).toContainText('Assistent einrichten')
    await panel(page).getByRole('button', { name: 'Einstellungen öffnen' }).click()
    await expect(page.getByRole('combobox', { name: 'Anbieter' })).toHaveValue('ollama')
    await page.getByRole('button', { name: 'Verbindung testen' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Verbindung klappt' })).toContainText('OK')
    await page.getByRole('button', { name: 'Speichern', exact: true }).click()
    // Saved on this device only – never in the vault.
    expect(await page.evaluate(() => localStorage.getItem('notiva.ai'))).toContain('qwen2.5')
    await go(page, '/#/p/Studium.md')
    if (!(await panel(page).isVisible()))
      await page.getByRole('button', { name: 'KI-Assistent (⌘J)' }).click()
    await expect(panel(page).getByRole('button', { name: 'Fasse diese Seite zusammen' })).toBeVisible()
  })

  test('legt per Werkzeug einen Datenbank-Eintrag an und verlinkt ihn', async ({ page }) => {
    await openWithAi(page)
    const bodies = await fakeModel(page, (body) =>
      body.messages.some((m) => m.role === 'tool')
        ? { content: 'Erledigt: [[Blatt 5]] ![x](https://evil.example/leak.png)' }
        : toolCall('create_row', {
            database: 'Aufgaben',
            title: 'Blatt 5',
            values: { Modul: 'Lineare Algebra', Priorität: 'Hoch', Status: 'Offen' },
          }),
    )
    await ask(page, 'Leg „Blatt 5“ für Lineare Algebra an')
    await expect(panel(page)).toContainText('Neuer Eintrag Aufgaben')
    await expect(panel(page)).toContainText('Erledigt')
    // Model output is untrusted: remote images are never loaded.
    await expect(panel(page).locator('img')).toHaveCount(0)
    // The request carried the tools, the current page and the user's question.
    expect(bodies[0]!.tools!.map((t) => t.function.name)).toContain('create_row')
    expect(bodies[0]!.messages[0]!.content).toContain('„Studium“ (Studium.md)')
    expect(bodies[1]!.messages.find((m) => m.role === 'tool')!.content).toContain(
      'Studium/Aufgaben/Blatt 5.md',
    )
    // The created entry opens in the side panel.
    await panel(page).getByRole('button', { name: 'Blatt 5' }).click()
    await expect(peekTitle(page)).toHaveValue('Blatt 5')
    await expect(peek(page)).toContainText('Hoch')
  })

  test('passt das Studien-Dashboard über das Seitenmenü an', async ({ page }) => {
    await openWithAi(page)
    const bodies = await fakeModel(page, (body) => {
      const tools = body.messages.filter((m) => m.role === 'tool')
      if (tools.length === 0) return toolCall('list_widgets', { page: 'Studium' })
      if (tools.length === 1)
        return toolCall('update_widget', {
          page: 'Studium',
          index: -1,
          yaml: 'type: tiles\ntiles:\n  - { type: countdown, title: Nächste Abgabe, icon: 📮, source: Studium/Aufgaben, dateProperty: Fällig }',
        })
      return { content: 'Ich habe eine Kachel „Nächste Abgabe“ ergänzt: [[Studium]]' }
    })
    await page.locator('#main').getByRole('button', { name: 'Mehr' }).click()
    await page.getByRole('menuitem', { name: 'Mit KI anpassen …' }).click()
    // The prompt is only prefilled – the user sees and can change it before sending.
    const input = panel(page).getByRole('textbox', { name: 'Frag etwas oder gib eine Aufgabe …' })
    await expect(input).toHaveValue(/Passe das Dashboard „Studium“ an mein Studium an/)
    expect(bodies).toHaveLength(0)
    await input.press('Enter')
    await expect(panel(page)).toContainText('Ich habe eine Kachel „Nächste Abgabe“ ergänzt')
    await expect(panel(page)).toContainText('Passt Kacheln an auf Studium')
    await expect(page.locator('#main')).toContainText('Nächste Abgabe')
    expect(bodies[0]!.tools!.map((t) => t.function.name)).toEqual(
      expect.arrayContaining([
        'notiva_format',
        'list_widgets',
        'update_widget',
        'update_database',
        'read_file',
      ]),
    )
  })

  test('fragt vor dem Löschen und respektiert ein Nein', async ({ page }) => {
    await openWithAi(page)
    await fakeModel(page, (body) =>
      body.messages.some((m) => m.role === 'tool')
        ? { content: 'Dann lasse ich die Seite.' }
        : toolCall('trash_page', { page: 'Willkommen' }),
    )
    await ask(page, 'Lösch die Willkommensseite')
    const dialog = page.getByRole('dialog', { name: '„Willkommen“ in den Papierkorb legen?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Abbrechen' }).click()
    await expect(panel(page)).toContainText('Dann lasse ich die Seite.')
    await expect(panel(page)).toContainText('fehlgeschlagen')
    await go(page, '/#/p/Willkommen.md')
    await expect(page.locator('#main').getByRole('heading', { level: 1 }).getByRole('textbox')).toHaveValue(
      'Willkommen',
    )
  })

  test('Nur-Lesen: bietet keine Schreibwerkzeuge an', async ({ page }) => {
    await openWithAi(page, { allowWrites: false })
    const bodies = await fakeModel(page, () => ({ content: 'Ich lese nur.' }))
    await ask(page, 'Was steht an?')
    await expect(panel(page)).toContainText('Ich lese nur.')
    const tools = bodies[0]!.tools!.map((t) => t.function.name)
    expect(tools).toContain('query_database')
    expect(tools).not.toContain('create_page')
    await expect(panel(page)).toContainText('Nur lesen')
  })

  test('erklärt Fehler verständlich', async ({ page }) => {
    await openWithAi(page)
    await fakeModel(page, () => 404)
    await ask(page, 'Hallo')
    await expect(panel(page).getByRole('alert')).toContainText('Modell „qwen2.5“ nicht gefunden')
  })

  test('⌘J öffnet und schließt den Assistenten; barrierefrei', async ({ page }) => {
    test.skip(isMobile(page), 'keine Tastatur')
    await openWithAi(page)
    await page.keyboard.press('ControlOrMeta+j')
    await expect(panel(page)).toBeVisible()
    const result = await new AxeBuilder({ page }).include('aside[aria-label="Assistent"]').analyze()
    expect(result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([])
    await page.keyboard.press('ControlOrMeta+j')
    await expect(panel(page)).toBeHidden()
  })
})
