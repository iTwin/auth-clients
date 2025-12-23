import { ElectronRendererAuthorization } from "../../renderer/Client";

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

signOutButton?.addEventListener("click", async () => {
  try {
    await auth.signOut();
  } catch (error) {}
});

signInButton?.addEventListener("click", async () => {
  try {
    await auth.signIn();
  } catch (error) {}
});

getStatusButton?.addEventListener("click", async () => {
  const message: HTMLElement | null = document.getElementById("status");
  if (message)
    message.textContent = `Status: signed ${auth.isAuthorized ? "in" : "out"}`;

  const otherMessage: HTMLElement | null =
    document.getElementById("otherStatus");
  if (otherMessage)
    otherMessage.textContent = `Other Status: signed ${
      otherAuth.isAuthorized ? "in" : "out"
    }`;
});
