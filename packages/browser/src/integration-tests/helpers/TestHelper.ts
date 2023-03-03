/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Page, expect } from "@playwright/test";
import { SignInOptions, AuthType } from "../types";
import { User } from "oidc-client-ts";

export class TestHelper {
  constructor(private signInOptions: SignInOptions) {}

  async signIn(page: Page) {
    await page.getByLabel("Email address").fill(this.signInOptions.email);
    await page.getByLabel("Email address").press("Enter");
    await page.getByLabel("Password").fill(this.signInOptions.password);
    await page.getByText("Sign In").click();

    const url = await page.url();
    if (url.endsWith("resume/as/authorization.ping")) {
      await this.handleConsentScreen(page);
    }
  }

  async getUserFromLocalStorage(page: Page): Promise<User> {
    const storageState = await page.context().storageState();
    const localStorage = storageState.origins.find(
      (o) => o.origin === this.signInOptions.url
    )?.localStorage;

    if (!localStorage)
      throw new Error(
        `Could not find local storage for origin: ${this.signInOptions.url}`
      );

    const user = localStorage.find((s) => s.name.startsWith("oidc.user"));
    if (!user) throw new Error("Could not find user in localStorage");

    return User.fromStorageString(user.value);
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
    if (authType === AuthType.PopUp) url += "signin-via-popup";
    expect(page.url()).toEqual(url);
  }

  private async handleConsentScreen(page: Page) {
    const consentAcceptButton = await page.getByRole("link", {
      name: "Accept",
    });
    if (consentAcceptButton) consentAcceptButton.click();
  }
}
