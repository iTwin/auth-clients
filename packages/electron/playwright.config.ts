import { PlaywrightTestConfig } from '@playwright/test'

const config: PlaywrightTestConfig = {
  testDir: './src/integration-test',
  timeout: 60000,
  maxFailures: 2,
  use: {
    screenshot: "only-on-failure",
  },
}

export default config
