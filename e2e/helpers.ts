import { expect, type Page } from '@playwright/test'

export const NOW = new Date('2026-10-14T10:00:00+02:00')

/** Freezes the clock, fails on page errors and dialogs, opens the demo vault. */
export async function openDemo(page: Page): Promise<void> {
  await guard(page)
  await page.goto('/')
  await page.getByRole('button', { name: /Demo ausprobieren/ }).click()
  await expect(await pageTitle(page)).toHaveValue('Studium')
}

export async function guard(page: Page): Promise<string[]> {
  const errors: string[] = []
  await page.clock.setFixedTime(NOW)
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('dialog', (d) => {
    errors.push(`unexpected dialog: ${d.message()}`)
    void d.dismiss()
  })
  ;(page as Page & { __errors?: string[] }).__errors = errors
  return errors
}

export function pageErrors(page: Page): string[] {
  return (page as Page & { __errors?: string[] }).__errors ?? []
}

export function isMobile(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1000) < 900
}

/** Opens the sidebar on small screens (drawer) – no-op on desktop. */
export async function showSidebar(page: Page): Promise<void> {
  if (isMobile(page) && !(await page.getByRole('navigation', { name: 'Seiten' }).isVisible())) {
    await page.getByRole('button', { name: 'Seitenleiste ein-/ausblenden' }).click()
  }
}

export async function openFromSidebar(page: Page, name: string | RegExp): Promise<void> {
  await showSidebar(page)
  await page
    .getByRole('navigation', { name: 'Seiten' })
    .getByRole('button', { name, exact: typeof name === 'string' })
    .first()
    .click()
}

/** Opens the ⌘K search and picks/creates `query`. */
export async function quickOpen(page: Page, query: string): Promise<void> {
  await page.keyboard.press('ControlOrMeta+k')
  await page.getByRole('combobox', { name: 'Seiten durchsuchen …' }).fill(query)
  await page.keyboard.press('Enter')
}

/** Title field of the page in the main area. */
export async function pageTitle(page: Page) {
  return page.locator('#main').getByRole('heading', { level: 1 }).getByRole('textbox')
}

/** The side panel ("Vorschau") that database entries and cards open in. */
export function peek(page: Page) {
  return page
    .getByRole('dialog')
    .filter({ has: page.getByRole('button', { name: 'Als ganze Seite öffnen' }) })
}

export function peekTitle(page: Page) {
  return peek(page).getByRole('heading', { level: 1 }).getByRole('textbox')
}

/**
 * In-app navigation (hash change without reload – the demo vault lives in memory). Waits until the
 * app has rendered the new route (`#main[data-route]`), so the next locator can't hit the previous
 * screen.
 */
export async function go(page: Page, hash: string, { wait = true } = {}): Promise<void> {
  const target = await page.evaluate(
    (h) => {
      location.hash = h
      return location.hash
    },
    hash.replace(/^\//, ''),
  )
  if (wait) await expect(page.locator('#main')).toHaveAttribute('data-route', routeOf(target))
}

/** The app writes routes with encodeURIComponent; the browser may keep other escapes. */
function routeOf(hash: string): string {
  const match = /^#\/p\/(.*)$/.exec(hash)
  return match ? `#/p/${encodeURIComponent(decodeURIComponent(match[1]!))}` : hash || '#/'
}
