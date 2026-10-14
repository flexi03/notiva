import { expect, type Page } from '@playwright/test'

export const NOW = new Date('2026-10-14T10:00:00+02:00')

/** Freezes the clock, fails on page errors and dialogs, opens the demo vault. */
export async function openDemo(page: Page): Promise<void> {
  await guard(page)
  await page.goto('/')
  await page.getByRole('button', { name: /Demo ausprobieren/ }).click()
  await expect(page.getByRole('heading', { level: 1 }).getByRole('textbox')).toHaveValue('Studium')
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

export async function pageTitle(page: Page) {
  return page.getByRole('heading', { level: 1 }).getByRole('textbox')
}

/** In-app navigation (hash change without reload – the demo vault lives in memory). */
export async function go(page: Page, hash: string): Promise<void> {
  await page.evaluate(
    (h) => {
      location.hash = h
    },
    hash.replace(/^\//, ''),
  )
}
