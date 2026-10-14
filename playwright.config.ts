import { defineConfig, devices } from '@playwright/test'

/**
 * E2E tests run against the production build (vite preview) in three form factors.
 * Dates are frozen in every test (see e2e/helpers.ts) so tiles and snapshots are stable.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: /electron/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'tablet',
      testIgnore: /electron/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 }, hasTouch: true },
    },
    { name: 'mobile', testIgnore: /electron/, use: { ...devices['iPhone 13'] } },
    // Launches the real desktop app (needs `npm run electron:build`, done by webServer).
    { name: 'electron', testMatch: /electron\.spec\.ts/, fullyParallel: false },
  ],
  webServer: {
    command:
      'npm run build && npm run electron:build && npm run mcp:build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
