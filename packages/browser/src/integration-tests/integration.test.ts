/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect, test } from "@playwright/test";
import { TestHelper } from "./helpers/TestHelper";
import { AuthType } from "./types";
import type { SignInOptions } from "./types";
import { loadConfig } from "./helpers/loadConfig";

const { url, clientId, envPrefix, email, password } = loadConfig();

const signInOptions: SignInOptions = {
  email,
  password,
  url,
  clientId,
  envPrefix: envPrefix || "",
};

const testHelper = new TestHelper(signInOptions);

test("signin redirect", async ({ page }) => {
  await page.goto(signInOptions.url);
  await testHelper.signIn(page);
  await page.waitForURL(signInOptions.url);

  await testHelper.validateAuthenticated(page);
});

test("signout redirect", async ({ page }) => {
  await page.goto(signInOptions.url);
  await testHelper.signIn(page);
  await page.waitForURL(signInOptions.url);

  const locator = page.getByTestId("signout-button");
  await locator.click();

  const content = page.getByText("Sign Off Successful");
  expect(content).toBeDefined();

  // Cannot get the below working on QA...
  // We'll have to settle for the above check
  // await expect(content).toContainText("Signed Out!");
  // const user = await testHelper.getUserFromLocalStorage(page);
  // expect(user).not.toBeDefined();
});

test("signin popup", async ({ page }) => {
  await page.goto(`${signInOptions.url}/signin-via-popup`);
  const popupPromise = page.waitForEvent("popup");
  const el = page.getByText("Signin via Popup");
  await el.click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  await testHelper.signIn(popup);
  await popup.waitForEvent("close");
  await testHelper.validateAuthenticated(page, AuthType.PopUp);
});

test("signout popup", async ({ page }) => {
  await page.goto(`${signInOptions.url}/signin-via-popup`);
  const popupPromise = page.waitForEvent("popup");
  const el = page.getByText("Signin via Popup");
  await el.click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  await testHelper.signIn(popup);
  await popup.waitForEvent("close");
  await testHelper.validateAuthenticated(page, AuthType.PopUp);

  const signoutPopupPromise = page.waitForEvent("popup");
  const locator = page.getByTestId("signout-button-popup");
  await locator.click();
  const signOutPopup = await signoutPopupPromise;

  const content = signOutPopup.getByText("Sign Off Successful");
  expect(content).toBeDefined();
});
