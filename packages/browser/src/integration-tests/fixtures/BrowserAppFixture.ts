/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { User } from "oidc-client-ts";
import { AuthType } from "../types";
import type { SignInOptions } from "../types";

export class BrowserAppFixture {
  constructor(private _page: Page, private _signInOptions: SignInOptions) { }

  get routes() {
    return {
      staticCallback: `${this._signInOptions.url}?callbackFromStorage=true`,
      authViaPopup: `${this._signInOptions.url}/signin-via-popup`,
      root: `${this._signInOptions.url}`,
    }
  }

  public async signIn(page: Page = this._page) {
    await page.getByLabel("Email address").fill(this._signInOptions.email);
    await page.getByLabel("Email address").press("Enter");
    await page.getByLabel("Password").fill(this._signInOptions.password);
    await page.getByText("Sign In").click();

    const url = page.url();
    if (url.endsWith("resume/as/authorization.ping")) {
      await this.handleConsentScreen(page);
    }
  }

  public async signInViaPopup() {
    await this._page.goto(this.routes.authViaPopup);
    const popupPromise = this._page.waitForEvent("popup");
    const el = this._page.getByText("Signin via Popup");
    await el.click();
    const popup = await popupPromise;
    await popup.waitForLoadState();

    const signInPromise = this.signIn(popup);
    const closeEventPromise = popup.waitForEvent("close");

    await Promise.all([signInPromise, closeEventPromise]);
  }

  public async signOutViaPopup() {
    const signoutPopupPromise = this._page.waitForEvent("popup");
    const locator = this._page.getByTestId("signout-button-popup");
    await locator.click();
    const signOutPopup = await signoutPopupPromise;
    return signOutPopup
  }

  public async signOut() {
    const locator = this._page.getByTestId("signout-button");
    await locator.click();
  }

  public async getUserFromLocalStorage(): Promise<User> {
    const storageState = await this._page.context().storageState();
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
    authType: AuthType = AuthType.Redirect
  ) {
    const locator = this._page.getByTestId("content");
    await expect(locator).toContainText("Authorized");
    const user = await this.getUserFromLocalStorage();
    expect(user.access_token).toBeDefined();

    let url = `${this._signInOptions.url}/`;
    if (authType === AuthType.PopUp)
      url += "signin-via-popup";
    if (authType === AuthType.RedirectStatic)
      url = "http://localhost:5173/?callbackFromStorage=true";

    expect(this._page.url()).toEqual(url);
  }

  public async validateUnauthenticated(page: Page = this._page) {
    const content = page.getByText("Sign Off Successful");
    await expect(content).toBeVisible();
  }

  public async goToPage(url: string) {
    await this._page.goto(url);
  }

  public async waitForPageLoad(url: string = this._signInOptions.url, page: Page = this._page) {
    await page.waitForURL(url);
  }

  private async handleConsentScreen(page: Page = this._page) {
    const consentAcceptButton = page.getByRole("link", {
      name: "Accept",
    });
    if (consentAcceptButton)
      await consentAcceptButton.click();
  }
}
