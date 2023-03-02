/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Page, expect } from "@playwright/test";
import { SignInOptions, AuthType } from "../types";

export class TestHelper {
  constructor(private signInOptions: SignInOptions) {}

  async signIn(page: Page) {
    await page.getByLabel("Email address").fill(this.signInOptions.email);
    await page.getByLabel("Email address").press("Enter");
    await page.getByLabel("Password").fill(this.signInOptions.password);
    await page.getByText("Sign In").click();
  }

  async getUserFromLocalStorage(page: Page) {
    const storageState = await page.context().storageState();
    const localStorage = storageState.origins.find(
      (o) => o.origin === this.signInOptions.url
    )?.localStorage;

    if (!localStorage) return undefined;

    const user = localStorage.find(
      (s) =>
        s.name ===
        `oidc.user:https://${this.signInOptions.envPrefix}ims.bentley.com:${this.signInOptions.clientId}`
    );
    const userValue = user?.value;

    try {
      return JSON.parse(userValue!);
    } catch (error) {
      return undefined;
    }
  }

  async validateAuthenticated(
    page: Page,
    authType: AuthType = AuthType.Redirect
  ) {
    const locator = page.getByTestId("content");
    await expect(locator).toContainText("Authorized");
    const user = await this.getUserFromLocalStorage(page);
    expect(user.access_token).toBeDefined();

    let url = `${this.signInOptions.url}/`;
    if (authType === AuthType.PopUp) url += "login-via-popup";
    expect(page.url()).toEqual(url);
  }
}
