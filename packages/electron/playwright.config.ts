import { PlaywrightTestConfig } from '@playwright/test'

const config: PlaywrightTestConfig = {
  testDir: './src/integration-test',
  timeout: 60000,
  maxFailures: 2,
  use: {
    screenshot: "only-on-failure",
  },
  expect: {
    timeout: 10000,
  }
}

export default config
