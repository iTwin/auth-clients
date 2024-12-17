import { _electron as electron, test as base } from '@playwright/test';
import { AuthFixture } from './AuthFixture';
import { ElectronAppFixture } from './ElectronAppFixture';
import { RefreshTokenStore } from '../../main/TokenStore';
import { getElectronUserDataPath, getTokenStoreFileName, getTokenStoreKey } from '../helpers/utils';

const tokenStoreFileName = getTokenStoreFileName();
const tokenStoreKey = getTokenStoreKey();
const userDataPath = getElectronUserDataPath();

export const test = base.extend<{ auth: AuthFixture, app: ElectronAppFixture }>({
  app: async ({ }, use) => {
    const tokenStore = new RefreshTokenStore(tokenStoreFileName, tokenStoreKey, userDataPath);
    await tokenStore.delete();
    const electronApp = await electron.launch({
      args: ["./dist/integration-test/test-app/index.js"],
    });
    const electronPage = await electronApp.firstWindow();
    const app = new ElectronAppFixture(electronPage, electronApp);
    await use(app);
    await app.destroy();
  },
  auth: async ({ browser }, use) => {
    const page = await browser.newPage();
    const auth = new AuthFixture({
      page,
      tokenStore: new RefreshTokenStore(tokenStoreFileName, tokenStoreKey, userDataPath)
    });
    await use(auth);
  },
});

export { expect } from '@playwright/test';