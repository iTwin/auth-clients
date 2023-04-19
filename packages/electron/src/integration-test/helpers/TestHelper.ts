/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { SignInOptions } from "../types";

export class TestHelper {
  constructor(private _signInOptions: SignInOptions) {}

  public async signIn(page: Page, urlWhenClicked: string) {
    await page.goto(urlWhenClicked);
    await page.getByLabel("Email address").fill(this._signInOptions.email);
    await page.getByLabel("Email address").press("Enter");
    await page.getByLabel("Password").fill(this._signInOptions.password);
    await page.getByText("Sign In").click();

    const consentUrl = page.url();
    if (consentUrl.endsWith("resume/as/authorization.ping")) {
      await this.handleConsentScreen(page);
    }
    await expect(page.getByText('Sign in was successful!You can close this browser window and return to the appli')).toBeVisible();
}

  private async handleConsentScreen(page: Page) {
    const consentAcceptButton = page.getByRole("link", {
      name: "Accept",
    });
    if (consentAcceptButton)
      await consentAcceptButton.click();
  }
}
