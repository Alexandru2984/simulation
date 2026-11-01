import { defineConfig, devices } from '@playwright/test'

// The stack is started by scripts/ci/run-e2e.sh; see e2e/README.md.
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:18443'

// CI runners and containers have no GPU: render WebGL with SwiftShader.
const launchOptions = {
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
}

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  // One shared simulation: run serially so tests never race each other.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    launchOptions,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'edge', testMatch: /edge\.spec\.js/ },
    {
      name: 'desktop',
      testMatch: /desktop\.spec\.js/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    { name: 'mobile', testMatch: /mobile\.spec\.js/, use: { ...devices['Pixel 7'] } },
    // Accessibility (axe-core, WCAG 2.1 AA); sets its own viewports.
    { name: 'a11y', testMatch: /a11y\.spec\.js/, use: { ...devices['Desktop Chrome'] } },
  ],
})
