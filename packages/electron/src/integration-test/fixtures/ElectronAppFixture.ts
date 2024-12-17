import type { ElectronApplication, Page } from "@playwright/test";

export class ElectronAppFixture {
  constructor(private _page: Page, private _app: ElectronApplication) { }

  public get buttons() {
    return {
      signIn: this._page.getByTestId("signIn"),
      signOut: this._page.getByTestId("signOut"),
      status: this._page.getByTestId("getStatus"),
    };
  }

  /**
   * Signs in, captures the URL electron opens internally, and returns for IMS.
   */
  public async clickSignIn(): Promise<string> {
    await this._page.waitForSelector("button#signIn");
    const button = this._page.getByTestId("signIn");
    const clickPromise = button.click();
    const urlPromise = this.getUrl();
    const [, url] = await Promise.all([clickPromise, urlPromise]);
    return url;
  }

  public async clickSignOut() {
    await this._page.waitForSelector("button#signOut");
    const button = this._page.getByTestId("signOut");
    await button.click();
  }

  public async checkStatus(expectedStatus: boolean) {
    await this._page.waitForSelector("button#getStatus");
    const button = this._page.getByTestId("getStatus");
    await button.click();
    this._page.getByText(expectedStatus ? "signed in" : "signed out");
  }

  /**
   * Captures the URL that electron opens internally using its shell module.
   */
  public async getUrl(): Promise<string> {
    return this._app.evaluate<string>(async ({ shell }) => {
      return new Promise((resolve) => {
        shell.openExternal = async (url: string) => {
          return resolve(url);
        };
      });
    });
  }

  public async destroy() {
    await this._page.close();
    await this._app.close();
  }
}
