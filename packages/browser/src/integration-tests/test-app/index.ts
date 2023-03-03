/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  BrowserAuthorizationClient,
  BrowserAuthorizationCallbackHandler,
} from "../../index";

const client = new BrowserAuthorizationClient({
  clientId: "spa-pIa9gNNEaaBEQa8lOk0bdKvj1",
  redirectUri: "http://localhost:1234/oidc-callback",
  scope: "itwins:read projects:read itwins:modify projects:modify users:read",
  authority: "https://qa-ims.bentley.com",
  postSignoutRedirectUri: "",
  responseType: "code",
  silentRedirectUri: "http://localhost:1234/oidc-callback",
});

const contentArea = document.querySelector("div[data-testid='content']");

async function initialize() {
  if (isSignoutPage()) {
    if (contentArea) contentArea.textContent = "Signed Out!";
  } else if (isSigninViaPopupPage()) {
    const popupButton = document.getElementById("popup");
    if (popupButton)
      popupButton.addEventListener("click", async () => {
        await client.signInPopup();
        await client.signInSilent(); // effectively loads the current user.
        popupButton.parentElement?.removeChild(popupButton);
        await validateAuthenticated();
      });
  } else if (!isOidcCallbackPage()) {
    await authenticateRedirect();
  }

  if (isOidcCallbackPage()) {
    await BrowserAuthorizationCallbackHandler.handleSigninCallback({
      clientId: "spa-pIa9gNNEaaBEQa8lOk0bdKvj1",
      redirectUri: "http://localhost:1234/oidc-callback",
      authority: "https://qa-ims.bentley.com",
      responseMode: "query",
    });
  }
}

async function authenticateRedirect() {
  try {
    await client.signInSilent();
  } catch (err) {
    await client.signInRedirect();
  }
  await validateAuthenticated();
}

async function validateAuthenticated() {
  try {
    await client.getAccessToken();
    displayAuthorized();
  } catch (error) {
    console.log("issue getting access token after non interactive signin");
  }
}

async function signout(popup: boolean) {
  if (popup) await client.signOutPopup();
  else await client.signOutRedirect();
}

function displayAuthorized() {
  if (contentArea) {
    contentArea.textContent = "Authorized!";

    const signOutButton = document.createElement("button");
    signOutButton.textContent = "Signout";
    signOutButton.setAttribute("data-testid", "signout-button");
    signOutButton.addEventListener("click", () => signout(false));
    contentArea.appendChild(signOutButton);

    const signOutButtonPopup = document.createElement("button");
    signOutButtonPopup.textContent = "Signout Popup";
    signOutButtonPopup.setAttribute("data-testid", "signout-button-popup");
    signOutButtonPopup.addEventListener("click", () => signout(true));
    contentArea.appendChild(signOutButtonPopup);
  }
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

initialize().then(() => {
  console.log("All Done");
});
