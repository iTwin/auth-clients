/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { loadConfig } from "./helpers/loadConfig";
import { expect, test } from "./fixtures/ElectronFixtures";
const { email, password } = loadConfig();

test("buttons exist", async ({ app }) => {
  await expect(app.buttons.signIn).toBeVisible();
  await expect(app.buttons.signOut).toBeVisible();
  await expect(app.buttons.status).toBeVisible();
});

test("sign in successful", async ({ app, auth }) => {
  await app.checkStatus(false);

  const url = await app.clickSignIn();
  await auth.signInIMS(url, email, password);
  await app.checkStatus(true);
});

test("sign out successful", async ({ app, auth }) => {
  const url = await app.clickSignIn();
  await auth.signInIMS(url, email, password);
  await app.checkStatus(true);

  await app.clickSignOut();
  await app.checkStatus(false);
});

test("when scopes change, sign in is required", async ({ app, auth }) => {
  const url = await app.clickSignIn();
  await auth.signInIMS(url, email, password);
  await app.checkStatus(true);

  await auth.switchScopes("itwin-platform realitydata:read");
  await app.checkStatus(false);
});
