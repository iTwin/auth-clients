/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { BrowserAuthorizationClient } from "../../Client";
import { expect, test } from "@playwright/test";

import type { BrowserAuthorizationClientConfiguration } from "../../Client";
import { BrowserAuthorizationCallbackHandler } from "../../CallbackHandler";

const DEBUG_URL = false;
const DEBUG_JAVASCRIPT = true;

test.describe("BrowserAuthorizationClient (#integration)", () => {

  test("goto localhost", async ({ page }) => {
    await page.goto("http://localhost:3000");

    await expect(page).toHaveURL("http://localhost:3000/");
  });

  test("goto google ", async ({ page }) => {
    await page.goto("https://www.google.com");

    await expect(page).toHaveURL("https://www.google.com");
  });

  test("goto google onclick", async ({ page, context }) => {

    await page.goto("http://localhost:3000");
    // await page.goto("https://www.google.com");

    if (DEBUG_URL) console.log("URL before:", page.url());

    await context.exposeFunction('runSignin', async () => {
      if (DEBUG_JAVASCRIPT) console.log("inside javascript");
      window.location.href = "https://www.google.com"
      // window.location.replace("https://www.google.com");
    });

    await page.setContent(`
      <script>
        async function onClick() {
          await window.runSignin();
        }
      </script>
      <button onclick="onClick()">Click me</button>
      <div></div>
    `);

    await page.click("button");

    if (DEBUG_URL) console.log("URL after:", page.url());

    await expect(page).toHaveURL("https://www.google.com");

  });

  test("goto localhost onclick", async ({ page, context }) => {

    // await page.goto("http://localhost:3000");
    await page.goto("https://www.google.com");

    if (DEBUG_URL) console.log("URL before:", page.url());

    await context.exposeFunction('runSignin', async () => {
      if (DEBUG_JAVASCRIPT) console.log("inside javascript");
      // window.location.href = "http://localhost:3000"
      window.location.replace("http://localhost:3000");
    });

    await page.setContent(`
      <script>
        async function onClick() {
          await window.runSignin();
        }
      </script>
      <button onclick="onClick()">Click me</button>
      <div></div>
    `);

    await page.click("button");

    if (DEBUG_URL) console.log("URL after:", page.url());

    await expect(page).toHaveURL("http://localhost:3000");

  });

  test("intercept goto localhost onclick", async ({ page, context }) => {

    // await page.goto("http://localhost:3000");
    await page.goto("https://www.google.com");

    if (DEBUG_URL) console.log("URL before:", page.url());

    await context.exposeFunction('runSignin', async () => {
      // window.location.href = "http://localhost:3000"
      window.location.replace("http://localhost:3000");
    });

    await page.setContent(`
      <script>
        async function onClick() {
          await window.runSignin();
        }
      </script>
      <button onclick="onClick()">Click me</button>
      <div></div>
    `);

    let intercepted = false;
    await page.route(/^http/, async (interceptedRequest) => { // use "**" for any route
      const reqUrl = interceptedRequest.request().url();

      intercepted = true;
      if (DEBUG_JAVASCRIPT) console.log('intercept goto localhost onclick:', reqUrl);

      await interceptedRequest.continue();
    });

    await page.click("button");

    if (DEBUG_URL) console.log("URL after:", page.url());

    await page.waitForTimeout(10 * 1000);


    await expect(page).toHaveURL("http://localhost:3000");
    await expect(intercepted).toBe(true);

  });

  test("localhost, signin onclick", async ({ page, context }) => {

    await page.goto("http://localhost:3000");

    let client: BrowserAuthorizationClient;

    await page.route(/^http/, async (interceptedRequest) => { // use "**" for any route
      const reqUrl = interceptedRequest.request().url();
      // if (reqUrl.startsWith(this._config.redirectUri)) {
      //   await interceptedRequest.respond({ status: 200, contentType: "text/html", body: "OK" });
      //   resolve(reqUrl);
      //   return;
      // }

      if (DEBUG_JAVASCRIPT) console.log('intercepted request url:', reqUrl);

      // await interceptedRequest.fulfill();
      await interceptedRequest.continue();
    });

    let config: BrowserAuthorizationClientConfiguration = {
      clientId: "",
      redirectUri: "",
      scope: "",
      // clientId: process.env.IMJS_OIDC_BROWSER_TEST_CLIENT_ID!,
      // redirectUri: process.env.IMJS_OIDC_BROWSER_TEST_REDIRECT_URI!,
      // scope: process.env.IMJS_OIDC_BROWSER_TEST_SCOPES!,
    };

    client = new BrowserAuthorizationClient(config);

    await context.exposeFunction('runSignin', async () => {
      await BrowserAuthorizationCallbackHandler.handleSigninCallback(config);
      await client.signIn();
    });

    await page.setContent(`
      <script>
        async function onClick() {
          await window.runSignin();
        }
      </script>
      <button onclick="onClick()">Click me</button>
      <div></div>
    `);

    await page.click("button");

    // await page.waitForTimeout(10 * 1000);

    await expect(page).toHaveURL("http://localhost:3000");

    console.log("signed in:", client!.hasSignedIn);
    await expect(client!.hasSignedIn).toBe(true);
  });

  test("intercept goto google onclick", async ({ page, context }) => {

    await page.goto("http://localhost:3000");
    // await page.goto("https://www.google.com");

    await context.exposeFunction('runSignin', async () => {
      // window.location.href = "https://www.google.com"
      window.location.replace("http://www.google.com");
    });

    await page.setContent(`
      <script>
        async function onClick() {
          await window.runSignin();
        }
      </script>
      <button onclick="onClick()">Click me</button>
      <div></div>
    `);

    page.on('request', request => console.log('>>', request.method(), request.url()));
    page.on('response', response => console.log('<<', response.status(), response.url()));

    let intercepted = false;
    await page.route(/^http/, async (interceptedRequest) => { // use "**" for any route
      const reqUrl = interceptedRequest.request().url();
      // if (reqUrl.startsWith(this._config.redirectUri)) {
      //   await interceptedRequest.respond({ status: 200, contentType: "text/html", body: "OK" });
      //   resolve(reqUrl);
      //   return;
      // }

      intercepted = true;
      if (DEBUG_JAVASCRIPT) console.log('intercept goto google onclick:', reqUrl);

      // await interceptedRequest.fulfill();
      // await interceptedRequest.fulfill({ status: 200, contentType: "text/html", body: "OK" });
      await interceptedRequest.continue();
    });

    await page.click("button");

    await page.waitForTimeout(10 * 1000);

    await expect(page).toHaveURL(/^https:\/\/www.google.com/);
    await expect(intercepted).toBe(true);
  });
});