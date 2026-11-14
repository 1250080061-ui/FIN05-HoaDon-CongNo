import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/setup.ts',
  workers: 1,
  timeout: 30_000,
  use: { baseURL: 'http://localhost:5173', channel: 'msedge', headless: true, screenshot: 'only-on-failure' },
})
