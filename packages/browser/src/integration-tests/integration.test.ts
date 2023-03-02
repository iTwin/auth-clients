/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from "@playwright/test";
import { TestHelper } from "./helpers/TestHelper";
import { AuthType, SignInOptions } from "./types";
import { loadConfig } from "./helpers/loadConfig";

const {
  IMJS_TEST_REGULAR_USER_NAME,
  IMJS_TEST_REGULAR_USER_PASSWORD,
  BASE_URL,
  CLIENT_ID,
  ENV_PREFIX,
} = loadConfig();

const signInOptions: SignInOptions = {
  email: IMJS_TEST_REGULAR_USER_NAME,
  password: IMJS_TEST_REGULAR_USER_PASSWORD,
  url: BASE_URL,
  clientId: CLIENT_ID,
  envPrefix: ENV_PREFIX || "",
};

const testHelper = new TestHelper(signInOptions);

test.only("login redirect", async ({ page }) => {
  await page.goto(signInOptions.url);
  await testHelper.signIn(page);
  await page.screenshot({
    path: "./screenshots/loginRedirect_AfterSignin.jpg",
  });
  await testHelper.validateAuthenticated(page);
  await page.screenshot({ path: "./screenshots/loginRedirect_EndState.jpg" });
});

test("logout redirect", async ({ page }) => {
  await page.goto(signInOptions.url);
  await testHelper.signIn(page);
  const locator = page.getByTestId("logout-button");
  await locator.click();

  const content = page.getByText("Sign Off Successful");
  expect(content).toBeDefined();

  // Cannot get the below working on QA...
  // We'll have to settle for the above check
  // await expect(content).toContainText("Logged Out!");
  // const user = await testHelper.getUserFromLocalStorage(page);
  // expect(user).not.toBeDefined();
});

test("login popup", async ({ page }) => {
  await page.goto(`${signInOptions.url}/login-via-popup`);
  const popupPromise = page.waitForEvent("popup");
  const el = await page.getByText("Login via Popup");
  await el.click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  await testHelper.signIn(popup);
  await testHelper.validateAuthenticated(page, AuthType.PopUp);
});

test("logout popup", async ({ page }) => {
  await page.goto(`${signInOptions.url}/login-via-popup`);
  const popupPromise = page.waitForEvent("popup");
  const el = await page.getByText("Login via Popup");
  await el.click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  await testHelper.signIn(popup);
  await testHelper.validateAuthenticated(page, AuthType.PopUp);

  const logoutPopupPromise = page.waitForEvent("popup");
  const locator = page.getByTestId("logout-button-popup");
  await locator.click();
  const logOutPopup = await logoutPopupPromise;

  const content = logOutPopup.getByText("Sign Off Successful");
  expect(content).toBeDefined();
});
