/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { AuthType } from "./types";
import { test } from "./fixtures/BrowserFixtures";

test("signin redirect", async ({ app }) => {
  await app.goToPage(app.routes.root)
  await app.signIn();
  await app.waitForPageLoad(app.routes.root)
  await app.validateAuthenticated();
});

test("signin redirect - callback settings from storage", async ({ app }) => {
  await app.goToPage(app.routes.staticCallback);
  await app.signIn();
  await app.waitForPageLoad(app.routes.staticCallback)
  await app.validateAuthenticated(AuthType.RedirectStatic);
});

test("signout redirect", async ({ app }) => {
  await app.goToPage(app.routes.root)
  await app.signIn();
  await app.waitForPageLoad(app.routes.root)
  await app.validateAuthenticated()
  await app.signOut();
  await app.validateUnauthenticated()
});

test("signin popup", async ({ app }) => {
  await app.signInViaPopup();
  await app.validateAuthenticated(AuthType.PopUp);
});

test("signout popup", async ({ app }) => {
  await app.signInViaPopup();
  await app.validateAuthenticated(AuthType.PopUp);
  const signOutPopup = await app.signOutViaPopup()
  await app.validateUnauthenticated(signOutPopup);
});
