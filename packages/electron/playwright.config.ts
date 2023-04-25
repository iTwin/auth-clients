/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { PlaywrightTestConfig } from '@playwright/test'

const config: PlaywrightTestConfig = {
  testDir: './src/integration-test',
  timeout: 60000,
  maxFailures: 2,
  workers: 1,
  use: {
    screenshot: "only-on-failure",
  },
  expect: {
    timeout: 10000,
  }
}

export default config
