import {
  BrowserAuthorizationClient,
  BrowserAuthorizationCallbackHandler,
  BrowserAuthorizationCallbackHandlerConfiguration,
} from "../../index";

const signInAuthButton = document.querySelector("button#signIn");

const client = new BrowserAuthorizationClient({
  clientId: "spa-QRTqE2Iq37h7vflXvTM2poAbr",
  redirectUri: "http://localhost:1234/oidc-callback",
  scope: "itwins:read projects:read itwins:modify projects:modify users:read",
  authority: "https://ims.bentley.com",
  postSignoutRedirectUri: "",
  responseType: "code",
  silentRedirectUri: "http://localhost:1234/oidc-callback",
});

if (signInAuthButton) {
  signInAuthButton.addEventListener("click", () => {
    client.signInRedirect().then(() => {
      console.log("signInPopup triggered");
    });
  });
}

if (window.location.href.includes("oidc-callback")) {
  const callbackHandler =
    BrowserAuthorizationCallbackHandler.handleSigninCallback({
      clientId: "spa-QRTqE2Iq37h7vflXvTM2poAbr",
      redirectUri: "http://localhost:1234/oidc-callback",
      authority: "https://ims.bentley.com",
      responseMode: "query",
    });
  callbackHandler.then(() => {
    console.log("done?");
  });
}
