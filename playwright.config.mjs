// End-to-end tests: the built site, in a real browser, with the Apps Script
// backend replaced by fakes (see tests/e2e/backend.mjs) so a test run never
// writes to the live Google Sheet or uses up prize stock.
//
//   npm run build && npm run test:e2e
//
// Locally, set PW_CHANNEL=msedge (or chrome) to use an installed browser
// instead of downloading Playwright's own; CI installs Chromium itself.
import { defineConfig } from '@playwright/test'

const channel = process.env.PW_CHANNEL || undefined

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  // Each test is a full browser running the animated stall UI. Several at once
  // starved a developer laptop into random timeouts (even Playwright's own
  // teardown timed out), so locally they run one at a time; CI runners have
  // the headroom for two.
  workers: process.env.CI ? 2 : 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // The two screens this quiz is actually used on: a tablet on the stall,
  // and a visitor's own phone.
  projects: [
    { name: 'tablet', use: { browserName: 'chromium', channel, viewport: { width: 1024, height: 768 } } },
    { name: 'phone', use: { browserName: 'chromium', channel, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
