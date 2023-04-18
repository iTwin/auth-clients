import { ElectronRendererAuthorization } from "../../renderer/Client";

if (!process.env.clientId) throw new Error("Please provide a clientId in env");

const auth = new ElectronRendererAuthorization({
  clientId: process.env.clientId,
});

auth.onAccessTokenChanged.addListener((token: string) => {
  console.log("token changed");
  console.log(token);
});

const signOutButton = document.getElementById("signOut");
const signInButton = document.getElementById("signIn");

signOutButton?.addEventListener("click", async () => {
  console.log("clicked sign out");
  try {
    await auth.signOut();
  } catch (error) {
    console.error(error);
  }
});

signInButton?.addEventListener("click", async () => {
  console.log("clicked sign in");
  try {
    await auth.signIn();
  } catch (error) {
    console.log(error);
  }
});
