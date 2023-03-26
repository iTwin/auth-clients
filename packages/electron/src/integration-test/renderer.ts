import { ElectronRendererAuthorization } from "../renderer/Client";

const auth = new ElectronRendererAuthorization();
auth.onAccessTokenChanged.addListener((token: string) => {
  console.log("token changed");
  console.log(token);
});

const signOutButton = document.getElementById("signOut");
const signInButton = document.getElementById("signIn");

signOutButton?.addEventListener("click", async () => {
  console.log("clicked");
  try {
    await auth.signOut();
  } catch (error) {
    console.error(error);
  }
});

signInButton?.addEventListener("click", async () => {
  console.log("clicked");
  try {
    await auth.signIn();
  } catch (error) {
    console.log(error);
  }
});
