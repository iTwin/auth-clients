/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  BrowserAuthorizationClient,
  BrowserAuthorizationCallbackHandler,
} from "../../index";

const contentArea = document.querySelector("div[data-testid='content']");

const client = new BrowserAuthorizationClient({
  clientId: "spa-pIa9gNNEaaBEQa8lOk0bdKvj1",
  redirectUri: "http://localhost:1234/oidc-callback",
  scope: "itwins:read projects:read itwins:modify projects:modify users:read",
  authority: "https://qa-ims.bentley.com",
  postSignoutRedirectUri: "",
  responseType: "code",
  silentRedirectUri: "http://localhost:1234/oidc-callback",
});

function logoutPage() {
  return window.location.href.includes("logout");
}

function loginViaPopupPage() {
  return window.location.href.includes("login-via-popup");
}

function oidcCallbackPage() {
  return window.location.href.includes("oidc-callback");
}

async function initialize() {
  if (logoutPage()) {
    if (contentArea) contentArea.textContent = "Logged Out!";
  } else if (loginViaPopupPage()) {
    const popupButton = document.getElementById("popup");
    if (popupButton)
      popupButton.addEventListener("click", async () => {
        await client.signInPopup();
        await client.signInSilent(); // effectively loads the current user.
        popupButton.parentElement?.removeChild(popupButton);
        await validateAuthenticated();
      });
  } else if (!oidcCallbackPage()) {
    await authenticateRedirect();
  }

  if (oidcCallbackPage()) {
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
    const token = await client.getAccessToken();
    displayAuthorized(token);
  } catch (error) {
    console.log("issue getting access token after non interactive signin");
  }
}

async function logout(popup: boolean) {
  if (popup) await client.signOutPopup();
  else await client.signOutRedirect();
}

function displayAuthorized(token: string) {
  console.log(token);
  if (contentArea) {
    contentArea.textContent = "Authorized!";

    const logOutButton = document.createElement("button");
    logOutButton.textContent = "Logout";
    logOutButton.setAttribute("data-testid", "logout-button");
    logOutButton.addEventListener("click", () => logout(false));
    contentArea.appendChild(logOutButton);

    const logOutButtonPopup = document.createElement("button");
    logOutButtonPopup.textContent = "Logout Popup";
    logOutButtonPopup.setAttribute("data-testid", "logout-button-popup");
    logOutButtonPopup.addEventListener("click", () => logout(true));
    contentArea.appendChild(logOutButtonPopup);
  }
}

initialize().then(() => {
  console.log("All Done");
});
