import { PlaywrightTestConfig } from '@playwright/test'

const config: PlaywrightTestConfig = {
  testDir: './src/integration-test',
  maxFailures: 2,
}

export default config