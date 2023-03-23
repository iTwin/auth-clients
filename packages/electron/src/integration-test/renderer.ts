import { ElectronRendererAuthorization } from "../renderer/Client";

const auth = new ElectronRendererAuthorization();
auth.onAccessTokenChanged.addListener((token: string) => {
  console.log("got token");
  console.log(token);
});

auth
  .signIn()
  .then(() => {
    console.log("complete");
  })
  .catch((e) => {
    console.log(e);
    console.log("wtf");
  });
