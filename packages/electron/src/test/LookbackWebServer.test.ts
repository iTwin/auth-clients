import { LoopbackWebServer } from "../main/LoopbackWebServer";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import { ElectronAuthorizationEvents } from "../main/Events";

const expect = chai.expect;
chai.use(chaiAsPromised);

describe("LookbackWebServer", () => {
  it("should only listen on the host provided in the redirectUri", async () => {
    const redirectUri = "http://127.0.0.1:3000";
    // set some fake state so it correlates
    const fakeState = "fake-state"
    const electronAuthEvents = new ElectronAuthorizationEvents();
    LoopbackWebServer.addCorrelationState(
      fakeState,
      electronAuthEvents
    );

    await LoopbackWebServer.start(redirectUri);
    const res = await fetch(`${redirectUri}?state=${fakeState}&code=fake-code`);
    electronAuthEvents.onAuthorizationResponseCompleted.raiseEvent(); // effectively close loopback server
    expect(res.status).to.eq(200);

    const redirectUri2 = "http://127.0.0.2:3000"
    await LoopbackWebServer.start(redirectUri2);
    await expect(fetch(`${redirectUri}?state=${fakeState}&code=fake-code`)).to.be.rejectedWith("fetch failed");
    electronAuthEvents.onAuthorizationResponseCompleted.raiseEvent(); // effectively close loopback server
  })
})