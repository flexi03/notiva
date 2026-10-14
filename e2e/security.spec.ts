import { expect, test } from '@playwright/test'
import { openDemo, pageErrors, pageTitle, quickOpen, go } from './helpers'

const PAYLOAD = [
  '<img src=x onerror="window.__pwned=1">',
  '<script>window.__pwned=2</script>',
  '[klick](javascript:window.__pwned=3)',
  '<a href="javascript:window.__pwned=4">x</a>',
  '<iframe src="https://example.com"></iframe>',
  '<svg onload="window.__pwned=5"></svg>',
  '<style>body{display:none}</style>',
  '[[x" onmouseover="window.__pwned=6]]',
  '```notiva',
  'type: tiles',
  'tiles:',
  '  - { type: text, text: "<img src=x onerror=window.__pwned=7>" }',
  '  - { type: link, page: "javascript:alert(1)" }',
  '```',
].join('\n\n')

test.describe('Sicherheit', () => {
  test.skip(({ isMobile }) => isMobile, 'Logik ist geräteunabhängig')
  test.afterEach(({ page }) => expect(pageErrors(page)).toEqual([]))

  test('bösartiges Markdown führt keinen Code aus', async ({ page }) => {
    await openDemo(page)
    await quickOpen(page, 'Angriff')
    await page.getByRole('button', { name: 'Markdown-Quelltext' }).click()
    await page.getByRole('textbox', { name: 'Markdown-Quelltext' }).fill(PAYLOAD)
    await page.getByRole('button', { name: 'Block-Editor' }).click()
    await expect(page.locator('.md').first()).toBeVisible()
    for (const link of await page.locator('article a').all()) await link.hover().catch(() => undefined)
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined()
    expect(
      await page
        .locator('article script, article iframe, article style, article [onerror], article [onload]')
        .count(),
    ).toBe(0)
    const hrefs = await page
      .locator('article a')
      .evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''))
    expect(hrefs.filter((h) => /^\s*javascript:/i.test(h))).toEqual([])
  })

  test('Content-Security-Policy verbietet Inline-Skripte und fremde Verbindungen', async ({ page }) => {
    await openDemo(page)
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
    expect(csp).toContain("script-src 'self'")
    // Only local AI servers and the known AI APIs – never arbitrary hosts.
    const connect = /connect-src ([^;]+)/.exec(csp ?? '')![1]!.split(' ')
    expect(connect).toEqual([
      "'self'",
      'http://localhost:*',
      'http://127.0.0.1:*',
      'https://api.anthropic.com',
      'https://openrouter.ai',
      'https://api.openai.com',
    ])
    expect(csp).toContain("object-src 'none'")
    const executed = await page.evaluate(() => {
      const script = document.createElement('script')
      script.textContent = 'window.__inline = true'
      document.body.appendChild(script)
      return (window as unknown as { __inline?: boolean }).__inline === true
    })
    expect(executed).toBe(false)
    const fetched = await page.evaluate(() =>
      fetch('https://example.com').then(
        () => true,
        () => false,
      ),
    )
    expect(fetched).toBe(false)
  })

  test('externe Links öffnen ohne Zugriff auf die App', async ({ page }) => {
    await openDemo(page)
    await quickOpen(page, 'Links')
    await page.getByRole('button', { name: 'Markdown-Quelltext' }).click()
    await page.getByRole('textbox', { name: 'Markdown-Quelltext' }).fill('[extern](https://example.com)')
    await page.getByRole('button', { name: 'Block-Editor' }).click()
    const link = page.locator('article a', { hasText: 'extern' })
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    await expect(link).toHaveAttribute('target', '_blank')
  })

  test('eigenes CSS kann nichts nachladen', async ({ page }) => {
    await openDemo(page)
    await go(page, '/#/settings')
    const css = page.getByPlaceholder('.md h1 { letter-spacing: -0.02em; }')
    await css.fill(
      "@import 'https://evil.example/x.css'; body { background: url(https://evil.example/t.png) }",
    )
    await css.blur()
    const applied = await page.locator('#notiva-custom-css').textContent()
    expect(applied).not.toMatch(/@import|url\(/)
  })

  test('manipulierte Adressen führen nicht aus dem Speicher heraus', async ({ page }) => {
    await openDemo(page)
    // Invalid routes fall back to the start page, so don't wait for the requested route.
    await go(page, '/#/p/..%2F..%2Fetc%2Fpasswd.md', { wait: false })
    await expect(page.locator('#main')).toHaveAttribute('data-route', '#/p/Studium.md')
    await expect(await pageTitle(page)).toHaveValue('Studium')
  })
})
