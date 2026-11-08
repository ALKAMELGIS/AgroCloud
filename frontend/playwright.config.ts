import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from 'playwright/test'

import { API_PORT } from '../scripts/devPorts.mjs'

const E2E_DATA_DIR = process.env.E2E_DATA_DIR || mkdtempSync(join(tmpdir(), 'agrocloud-e2e-'))
process.env.E2E_DATA_DIR = E2E_DATA_DIR // workers re-evaluate this file; keep one directory

/**
 * E2E projects:
 *  - desktop / tablet / mobile run by default (Chromium engine, three viewport classes).
 *  - perf runs the timing-budget specs alone, after the others.
 *  - firefox / webkit are opt-in (`E2E_CROSS_BROWSER=1`) because they need extra browser installs.
 *
 * Run: `npm run test:e2e` (all default projects) or `npx playwright test --project=mobile`.
 */
const crossBrowser = process.env.E2E_CROSS_BROWSER === '1'
const PERF_SPECS = /home-grid\.spec\.ts/

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5177',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      // Optional: use a pre-installed browser when the bundled build is unavailable (sandboxes, CI images).
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
      args: ['--disable-gpu', '--use-angle=swiftshader', '--use-gl=swiftshader', '--disable-features=Vulkan'],
    },
  },
  // Tests run against the production build (what users get). The dev server compiles pages on
  // first visit and reloads when Vite discovers new deps, which made cold routes time out.
  // `E2E_DEV_SERVER=1` switches back to the dev server for quick local iteration.
  // The API (proxied by Vite under /api) runs on a throwaway data directory so E2E data never
  // touches a real database. Specs that need it (operations forms) use synthetic records only.
  webServer: [
    {
      command: 'node ../backend/server/index.js',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env: { PORT: String(API_PORT), HOST: '127.0.0.1', NODE_ENV: 'test', FORCE_HTTPS: 'false', AGROCLOUD_IDENTITY: 'off', AGROCLOUD_DATA_DIR: E2E_DATA_DIR },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: process.env.E2E_DEV_SERVER === '1'
        ? 'npx vite --host 127.0.0.1 --port 5177 --strictPort'
        : 'npx vite build && npx vite preview --host 127.0.0.1 --port 5177 --strictPort',
      url: 'http://127.0.0.1:5177/AgroCloud/',
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
  projects: [
    { name: 'desktop', testIgnore: PERF_SPECS, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', testIgnore: PERF_SPECS, use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true } },
    { name: 'mobile', testIgnore: PERF_SPECS, use: { ...devices['Pixel 7'] } },
    // Performance budgets (LCP/CLS) run once, after the functional projects, so parallel workers
    // can't skew timings. These specs set their own viewports (320 → 3840).
    { name: 'perf', testMatch: PERF_SPECS, dependencies: ['desktop', 'tablet', 'mobile'], use: { ...devices['Desktop Chrome'] } },
    ...(crossBrowser
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        ]
      : []),
  ],
})
