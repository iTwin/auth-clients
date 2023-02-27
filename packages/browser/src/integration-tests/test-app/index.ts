import { BrowserAuthorizationClient } from "../../index";

const signInAuthButton = document.querySelector("button#signIn");

const client = new BrowserAuthorizationClient({
  clientId: "",
  redirectUri: "http://localhost:1234/oidc-callback",
  scope: "itwins:read projects:read itwins:modify projects:modify users:read",
  authority: "https://ims.bentley.com",
  postSignoutRedirectUri: "",
  responseType: "code",
  silentRedirectUri: "http://localhost:1234/oidc-callback",
});

if (signInAuthButton) {
  signInAuthButton.addEventListener("click", () => {
    client.signInPopup().then(() => {
      console.log("signInPopup triggered");
    });
  });
}
