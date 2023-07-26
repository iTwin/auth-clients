/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See COPYRIGHT.md in the repository root for full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as chai from "chai";
import { expect } from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as sinon from "sinon";
import * as TestBrowserAuthorizationClientModule from "../TestBrowserAuthorizationClient";
import type { TestBrowserAuthorizationClientConfiguration, TestUserCredentials } from "../TestUsers";
import { TestUsers } from "../TestUsers";
import { TestUtility } from "../TestUtility";
chai.use(chaiAsPromised);

describe("TestUtility", () => {
  const defaultUser: TestUserCredentials = {
    email: "test-email",
    password: "test-password",
  };
  const defaultConfig: TestBrowserAuthorizationClientConfiguration = {
    clientId: "test-client-id",
    redirectUri: "test-uri",
    scope: "test-scope",
  };

  let constructorStub: sinon.SinonStub;
  // let testStub: sinon.SinonStub;

  beforeEach(() => {
    constructorStub = sinon.stub(TestBrowserAuthorizationClientModule, "TestBrowserAuthorizationClient").returns(
      (user: TestUserCredentials, config: TestBrowserAuthorizationClientConfiguration) => { return { ...user, ...config }; });
    sinon.stub(TestUsers, "getTestBrowserAuthorizationClientConfiguration").returns({ ...defaultConfig });
    // testStub = sinon.stub(TestUtility, "getAuthorizationClient").returns()
  });

  afterEach(() => {
    sinon.restore();
    TestUtility["_clients"].clear();  // eslint-disable-line @typescript-eslint/dot-notation
  });

  it("should get client from cache when called with the same parameters", async () => {
    const client = TestUtility.getAuthorizationClient(defaultUser, defaultConfig);

    expect(TestUtility.getAuthorizationClient(defaultUser, defaultConfig)).to.equal(client);
    expect(constructorStub.calledOnce).to.be.true;
  });

  describe("Should get new client when called with different parameters", () => {
    [
      { user: { ...defaultUser }, config: undefined },
      { user: { ...defaultUser, email: "new-test-email" }, config: { ...defaultConfig } },
      { user: { ...defaultUser }, config: { ...defaultConfig, clientId: "new-test-client-id" } },
      { user: { ...defaultUser }, config: { ...defaultConfig, scope: "new-test-scope" } },
      { user: { ...defaultUser }, config: { ...defaultConfig, authority: "test-authority" } },
    ].forEach((data, index) => {
      it(`Test case #${index + 1}`, async () => {
        const client = TestUtility.getAuthorizationClient(defaultUser, defaultConfig);
        console.log(TestUtility.getAuthorizationClient(data.user, data.config));
        console.log(client);
        expect(TestUtility.getAuthorizationClient(data.user, data.config)).to.not.equal(client);
        expect(constructorStub.calledTwice).to.be.true;
        // const calls = constructorStub.getCalls();
        // calls.forEach((call) => {
        //   console.log(call.args);
        // })
      });
    });
  });

});
