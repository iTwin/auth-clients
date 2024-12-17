import type { Page } from "@playwright/test";
import { RefreshTokenStore } from "../../main/TokenStore";

interface AuthFixtureProps {
  page: Page;
  tokenStore: RefreshTokenStore
}

export class AuthFixture {
  private _page: Page;
  private _tokenStore: RefreshTokenStore

  constructor(options: AuthFixtureProps) {
    this._page = options.page;
    this._tokenStore = options.tokenStore;
  }

  public async signInIMS(url: string, email: string, password: string) {
    await this._page.goto(url);
    await this._page.waitForSelector("#identifierInput", { timeout: 5000 });
    await this._page.getByLabel("Email address").fill(email);
    await this._page.getByLabel("Email address").press("Enter");
    await this._page.getByLabel("Password").fill(password);
    await this._page.getByText("Sign In").click();

    const consentUrl = this._page.url();
    if (consentUrl.endsWith("resume/as/authorization.ping")) {
      await this.handleConsentScreen();
    }
  }

  // Admittedly this is cheating: no user would interact
  // with the tokenStore directly, but this is a tough
  // case to test otherwise.
  public async switchScopes(scopes: string) {
    await this._tokenStore.load(scopes);
  }

  private async handleConsentScreen() {
    const consentAcceptButton = this._page.getByRole("link", {
      name: "Accept",
    });
    if (consentAcceptButton)
      await consentAcceptButton.click();
  }
}
