/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { Page } from "@playwright/test";
import type { SignInOptions } from "../types";

/**
 * Helper class for tests
 */
export class TestHelper {
  constructor(private _signInOptions: SignInOptions) { }

  public async clickSignIn(electronPage: Page) {
    await electronPage.waitForSelector("button#signIn");
    const button = electronPage.getByTestId("signIn");
    await button.click();
  }

  public async clickOtherSignIn(electronPage: Page) {
    await electronPage.waitForSelector("button#otherSignIn");
    const button = electronPage.getByTestId("otherSignIn");
    await button.click();
  }

  public async clickSignOut(electronPage: Page) {
    await electronPage.waitForSelector("button#signOut");
    const button = electronPage.getByTestId("signOut");
    await button.click();
  }

  public async isSignedIn(electronPage: Page) {
    const button = electronPage.getByTestId("getStatus");
    await button.click();
    const locator = electronPage.getByText("signed in");
    return locator.isVisible();
  }
  public async checkStatus(electronPage: Page, expectedStatus: boolean) {
    await electronPage.waitForSelector("button#getStatus");
    const button = electronPage.getByTestId("getStatus");
    await button.click();
    electronPage.getByText(expectedStatus ? "signed in" : "signed out");
  }

  public async checkOtherStatus(electronPage: Page, expectedStatus: boolean) {
    await electronPage.waitForSelector("button#otherGetStatus");
    const button = electronPage.getByTestId("otherGetStatus");
    await button.click();
    electronPage.getByText(expectedStatus ? "signed in" : "signed out");
  }

  public async signIn(page: Page, url: string) {
    await page.goto(url);
    await page.waitForSelector("#identifierInput", { timeout: 5000 });
    await page.getByLabel("Email address").fill(this._signInOptions.email);
    await page.getByLabel("Email address").press("Enter");
    await page.getByLabel("Password").fill(this._signInOptions.password);
    await page.getByText("Sign In", { exact: true }).click();

    const consentUrl = page.url();
    if (consentUrl.endsWith("resume/as/authorization.ping")) {
      await this.handleConsentScreen(page);
    }
  }

  private async handleConsentScreen(page: Page) {
    const consentAcceptButton = page.getByRole("link", {
      name: "Accept",
    });
    if (consentAcceptButton)
      await consentAcceptButton.click();
  }
}
