import { ElectronApplication, Page, expect, test } from "@playwright/test";

const { _electron: electron } = require('playwright');
let electronApp: ElectronApplication;

test.beforeAll(async () => {
  electronApp = await electron.launch({ args: ['./dist/integration-test/test-app/index.js'] });
  electronApp.on('window', async (page) => {
    const filename = page.url()?.split('/').pop()
    console.log(`Window opened: ${filename}`)

    // capture errors
    page.on('pageerror', (error) => {
      console.error(error)
    })
    // capture console messages
    page.on('console', (msg) => {
      console.log(msg.text())
    })
  })

  page = await electronApp.firstWindow();
});

test.afterAll(async () => {
  // Exit app.
  await electronApp.close();
});

let page: Page

test('evaluate expression', async () => {
  // Evaluation expression in the Electron context.
  const appPath: string = await electronApp.evaluate(async ({ app }) => {
    // This runs in the main Electron process, parameter here is always
    // the result of the require('electron') in the main app script.
    return app.getAppPath();
  });
  console.log(appPath);
})

test('"sign in" and "sign out" button exist', async () => {
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();
})
