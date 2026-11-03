import { ElectronRendererAuthorization } from "../../renderer/Client.js";

if (!process.env.IMJS_TEST_ELECTRON_CLIENT_ID)
  throw new Error("Please provide a clientId in env");

const auth = new ElectronRendererAuthorization({
  clientId: process.env.IMJS_TEST_ELECTRON_CLIENT_ID,
});

const otherAuth = new ElectronRendererAuthorization({
  clientId: process.env.IMJS_TEST_ELECTRON_CLIENT_ID,
  channelClientPrefix: "prefixed",
});

const signOutButton = document.getElementById("signOut");
const signInButton = document.getElementById("signIn");
const getStatusButton = document.getElementById("getStatus");
const otherSignInButton = document.getElementById("otherSignIn");
const otherGetStatusButton = document.getElementById("otherGetStatus");

/** Reports failures to the tests, which otherwise only see a sign in that never happens. */
function reportError(error: unknown) {
  const message: HTMLElement | null = document.getElementById("error");
  if (message)
    message.textContent = `${error instanceof Error ? error.message : String(error)}`;
}

signOutButton?.addEventListener("click", async () => {
  try {
    await auth.signOut();
  } catch (error) {
    reportError(error);
  }
});

signInButton?.addEventListener("click", async () => {
  try {
    await auth.signIn();
  } catch (error) {
    reportError(error);
  }
});

otherSignInButton?.addEventListener("click", async () => {
  try {
    await otherAuth.signIn();
  } catch (error) {
    reportError(error);
  }
});

getStatusButton?.addEventListener("click", async () => {
  const message: HTMLElement | null = document.getElementById("status");
  if (message)
    message.textContent = `Status: signed ${auth.isAuthorized ? "in" : "out"}`;
});

otherGetStatusButton?.addEventListener("click", async () => {
  const otherMessage: HTMLElement | null = document.getElementById("otherStatus");
  if (otherMessage)
    otherMessage.textContent = `Other Status: signed ${
      otherAuth.isAuthorized ? "in" : "out"
    }`;
});
