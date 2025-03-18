/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { User } from "oidc-client-ts";
import { AuthType } from "../types";
import type { SignInOptions } from "../types";

export class TestHelper {
  constructor(private _signInOptions: SignInOptions) {}

  public async signIn(page: Page) {
    await page.getByLabel("Email address").fill(this._signInOptions.email);
    await page.getByLabel("Email address").press("Enter");
    await page.getByLabel("Password").fill(this._signInOptions.password);
    await page.getByText("Sign In").click();

    const url = page.url();
    if (url.endsWith("resume/as/authorization.ping")) {
      await this.handleConsentScreen(page);
    }
  }

  public async getUserFromLocalStorage(page: Page): Promise<User> {
    const storageState = await page.context().storageState();
    const localStorage = storageState.origins.find(
      (o) => o.origin === this._signInOptions.url
    )?.localStorage;

    if (!localStorage)
      throw new Error(
        `Could not find local storage for origin: ${this._signInOptions.url}`
      );

    const user = localStorage.find((s) => s.name.startsWith("oidc.user"));

    if (!user)
      throw new Error("Could not find user in localStorage");

    return User.fromStorageString(user.value);
  }

  public async validateAuthenticated(
    page: Page,
    authType: AuthType = AuthType.Redirect
  ) {
    const locator = page.getByTestId("content");
    await expect(locator).toContainText("Authorized");
    const user = await this.getUserFromLocalStorage(page);
    expect(user.access_token).toBeDefined();

    let url = `${this._signInOptions.url}/`;
    if (authType === AuthType.PopUp)
      url += "signin-via-popup";
    if (authType === AuthType.RedirectStatic)
      url = "http://localhost:5173/?callbackFromStorage=true";

    expect(page.url()).toEqual(url);
  }

  private async handleConsentScreen(page: Page) {
    const consentAcceptButton = page.getByRole("link", {
      name: "Accept",
    });
    if (consentAcceptButton)
      await consentAcceptButton.click();
  }
}
