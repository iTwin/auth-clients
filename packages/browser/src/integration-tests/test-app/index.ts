/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { BrowserAuthorizationClient } from "../../Client";

const oidcCallbackUrl = `${process.env.ITJS_AUTH_CLIENTS_BROWSER_BASE_URL}/oidc-callback`;
const authority = `https://${process.env.IMJS_URL_PREFIX}ims.bentley.com`;
const client = new BrowserAuthorizationClient({
  clientId: process.env.ITJS_AUTH_CLIENTS_BROWSER_CLIENT_ID!,
  redirectUri: oidcCallbackUrl,
  scope: "itwins:read projects:read itwins:modify projects:modify users:read",
  authority,
  postSignoutRedirectUri: "",
  responseType: "code",
  silentRedirectUri: oidcCallbackUrl,
});

const contentArea = document.querySelector("div[data-testid='content']");
let useStaticCallback = false;
async function initialize() {
  if (window.location.search.includes("callbackFromStorage=true")) {
    useStaticCallback = true;
  }

  if (isSignoutPage()) {
    if (contentArea)
      contentArea.textContent = "Signed Out!";
  } else if (isSigninViaPopupPage()) {
    if (contentArea)
      appendButton(contentArea, "Signin Via Popup", "popup", true, async () => {
        await client.signInPopup();
        await client.signInSilent(); // effectively loads the current user.
        const popupButton = document.getElementById("popup");
        if (popupButton)
          popupButton.parentElement?.removeChild(popupButton);
        await validateAuthenticated();
      });
  } else if (!isOidcCallbackPage()) {
    await authenticateRedirect();
  }

  if (isOidcCallbackPage()) {
    useStaticCallback
      ? await BrowserAuthorizationClient.handleSignInCallback()
      : await client.handleSigninCallback();
  }
}

async function authenticateRedirect() {
  await client.signInRedirect();
  await validateAuthenticated();
}

async function validateAuthenticated() {
  try {
    await client.getAccessToken();
    displayAuthorized();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log("issue getting access token after non interactive signin");
  }
}

async function signout(popup: boolean) {
  if (popup)
    await client.signOutPopup();
  else
    await client.signOutRedirect();
}

function displayAuthorized() {
  if (contentArea) {
    contentArea.textContent = "Authorized!";

    appendButton(contentArea, "Signout", "signout-button");
    appendButton(contentArea, "Signout Popup", "signout-button-popup", true);
  }
}

function appendButton(
  parent: Element,
  text: string,
  testId: string,
  popup: boolean = false,
  clickHandler?: () => void
) {
  const button = document.createElement("button");
  button.textContent = text;
  button.setAttribute("data-testid", testId);
  button.setAttribute("id", testId);
  const handler = clickHandler ?? (async () => {
    await signout(popup);
  })
  button.addEventListener("click", handler);
  parent.appendChild(button);
}

function isSignoutPage() {
  return window.location.href.includes("signout");
}

function isSigninViaPopupPage() {
  return window.location.href.includes("signin-via-popup");
}

function isOidcCallbackPage() {
  return window.location.href.includes("oidc-callback");
}

void initialize().then(() => {
  // Finished
});
