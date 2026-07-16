import { TokenResponse } from "@openid/appauth";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import { TokenStore } from "../TokenStore";
import { createDecipheriv, scryptSync } from "crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "fs";
import * as sinon from "sinon";
import type * as NodePersist from "node-persist";
chai.use(chaiAsPromised);

interface TokenStoreInternals {
  getKey(): Promise<string>;
  getKeyFilePath(): string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  _store: NodePersist.LocalStorage;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  _appStorageKey: string;
}
const asInternals = (store: TokenStore): TokenStoreInternals => store as unknown as TokenStoreInternals;

describe("TokenStore", () => {
  let tokenStore: TokenStore;
  const testTokenResponse = new TokenResponse({
    access_token: "testAccessToken", // eslint-disable-line @typescript-eslint/naming-convention
    refresh_token: "testRefreshToken", // eslint-disable-line @typescript-eslint/naming-convention
    scope: "scope1 scope2",
  });

  beforeEach(async () => {
    tokenStore = new TokenStore({
      clientId: "testClientId",
      issuerUrl: "https://testUrl.com",
      scopes: "testScope1 testScope2",
    }, `${process.cwd()}/testConfig`);
    await tokenStore.initialize();
  });

  afterEach(() => {
    rmSync(`${process.cwd()}/testConfig`, {recursive: true, force: true});
  });

  it("should encrypt cache on save", async () => {
    if (process.platform === "linux")
      return;

    const saveSpy = sinon.spy(tokenStore as any, "encryptCache");
    await tokenStore.save(testTokenResponse);
    chai.assert.isTrue(saveSpy.calledOnce);
  });
  it("should be able to remove response", async () => {
    if (process.platform === "linux")
      return;

    await tokenStore.save(testTokenResponse);

    let retrievedToken = await tokenStore.load();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    chai.expect(retrievedToken!.refreshToken).equals(testTokenResponse.refreshToken);

    await tokenStore.remove();

    retrievedToken = await tokenStore.load();
    chai.assert(typeof retrievedToken === "undefined");
  });
  it("should decrypt cache on load", async () => {
    if (process.platform === "linux")
      return;

    await tokenStore.save(testTokenResponse);

    const retrievedToken = await tokenStore.load();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    chai.expect(retrievedToken!.refreshToken).equals(testTokenResponse.refreshToken);
  });

  it("load() should return undefined when scopes are mismatched", async () => {
    if (process.platform === "linux")
      return;

    await tokenStore.save(testTokenResponse);

    const tokenStore2 = new TokenStore({
      clientId: "testClientId",
      issuerUrl: "https://testUrl.com",
      scopes: "testScope1 testScope2 testScope3",
    }, `${process.cwd()}/testConfig`);
    await tokenStore2.initialize();

    const retrievedToken = await tokenStore2.load();
    chai.expect(retrievedToken).to.be.undefined;
  });

  describe("encryption key security", () => {
    it("should not derive the cipher key from public data (clientId/issuerUrl) alone", async () => {
      if (process.platform === "linux")
        return;

      await tokenStore.save(testTokenResponse);

      // An attacker who only knows the public clientId/issuerUrl (no filesystem access) derives
      // this candidate key the same way scryptSync(publicData, "iTwin") would; it must NOT decrypt.
      const key = await asInternals(tokenStore).getKey();
      const storedObj = await asInternals(tokenStore)._store.getItem(key);
      chai.assert.isDefined(storedObj, "expected an encrypted blob to have been stored");

      const publicAppStorageKey = asInternals(tokenStore)._appStorageKey;
      const oldSchemeKey = scryptSync(publicAppStorageKey, "iTwin", 32);

      let decryptedWithOldScheme: string | undefined;
      try {
        const decipher = createDecipheriv("aes-256-cbc", oldSchemeKey, Buffer.from(storedObj.iv, "hex"));
        decryptedWithOldScheme = decipher.update(storedObj.encryptedCache, "hex", "utf8") + decipher.final("utf8");
      } catch {
        // Throwing (e.g. "bad decrypt") is an acceptable proof that the public-data-derived key no longer works.
        decryptedWithOldScheme = undefined;
      }

      if (decryptedWithOldScheme !== undefined)
        chai.expect(decryptedWithOldScheme).to.not.include(testTokenResponse.refreshToken);
    });

    it("should persist the random per-install key to a file with restrictive permissions and reuse it", async () => {
      if (process.platform === "linux")
        return;

      await tokenStore.save(testTokenResponse);

      const keyFilePath = asInternals(tokenStore).getKeyFilePath();
      chai.assert.isTrue(existsSync(keyFilePath), "expected a key file to be written to disk");

      if (process.platform !== "win32") {
        const mode = statSync(keyFilePath).mode & 0o777;
        chai.expect(mode).to.equal(0o600);
      }

      // A second instance pointed at the same directory must reuse the persisted key.
      const tokenStore2 = new TokenStore({
        clientId: "testClientId",
        issuerUrl: "https://testUrl.com",
        scopes: "testScope1 testScope2",
      }, `${process.cwd()}/testConfig`);
      await tokenStore2.initialize();

      const retrievedToken = await tokenStore2.load();
      chai.assert.isDefined(retrievedToken);
      chai.expect(retrievedToken?.refreshToken).equals(testTokenResponse.refreshToken);
    });

    it("load() should return undefined and clear the entry when the stored blob can't be decrypted (e.g. old-scheme or corrupted data)", async () => {
      if (process.platform === "linux")
        return;

      await tokenStore.save(testTokenResponse);

      const key = await asInternals(tokenStore).getKey();
      const store = asInternals(tokenStore)._store;
      // A malformed/undecryptable blob (wrong key, wrong format, or bit-rot) should be a clean cache miss.
      await store.setItem(key, { encryptedCache: "deadbeef".repeat(8), iv: "00".repeat(16) });

      const retrievedToken = await tokenStore.load();
      chai.assert(typeof retrievedToken === "undefined");

      const storeKeys: string[] = await store.keys();
      chai.expect(storeKeys).to.not.include(key);
    });
  });

  describe("attack surface hardening", () => {
    const keyFilePath = `${process.cwd()}/testConfig/.token-store.key`;

    it("should NOT trust a pre-planted key file with attacker-known content and loose permissions", async () => {
      if (process.platform === "linux" || process.platform === "win32")
        return; // POSIX permission semantics required for this test

      // Attacker (or a race) writes a known key with loose permissions before ours is generated.
      const attackerKnownKey = Buffer.alloc(32, 0x41);
      mkdirSync(`${process.cwd()}/testConfig`, { recursive: true });
      writeFileSync(keyFilePath, attackerKnownKey, { mode: 0o644 });

      await tokenStore.save(testTokenResponse);

      const keyOnDiskAfter = readFileSync(keyFilePath);
      const stillAttackerKey = keyOnDiskAfter.equals(attackerKnownKey);
      const mode = statSync(keyFilePath).mode & 0o777;
      chai.assert.isFalse(stillAttackerKey && (mode & 0o077) !== 0,
        "attacker-planted, loosely-permissioned key must not be trusted/reused as-is");

      // decrypting the stored blob with the attacker's key must fail.
      const store = asInternals(tokenStore)._store;
      const key = await asInternals(tokenStore).getKey();
      const storedObj = await store.getItem(key);
      let decryptedWithAttackerKey: string | undefined;
      try {
        const decipher = createDecipheriv("aes-256-cbc", attackerKnownKey, Buffer.from(storedObj.iv, "hex"));
        decryptedWithAttackerKey = decipher.update(storedObj.encryptedCache, "hex", "utf8") + decipher.final("utf8");
      } catch {
        decryptedWithAttackerKey = undefined;
      }
      if (decryptedWithAttackerKey !== undefined)
        chai.expect(decryptedWithAttackerKey).to.not.include(testTokenResponse.refreshToken);
    });

    it("should NOT follow a symlink planted at the key file path (no writing through to an arbitrary target)", async () => {
      if (process.platform === "linux" || process.platform === "win32")
        return; // symlink semantics required for this test

      mkdirSync(`${process.cwd()}/testConfig`, { recursive: true });
      const victimTargetFile = `${process.cwd()}/testConfig/innocent-target.txt`;
      const originalContent = "original harmless content that must not be clobbered";
      writeFileSync(victimTargetFile, originalContent);
      symlinkSync(victimTargetFile, keyFilePath);

      await tokenStore.save(testTokenResponse);

      const targetContentAfter = readFileSync(victimTargetFile, "utf8");
      chai.expect(targetContentAfter).to.equal(originalContent, "symlink target must not be overwritten by key generation");

      // The key file path itself must no longer point at the victim target.
      const finalStat = lstatSync(keyFilePath);
      chai.assert.isFalse(finalStat.isSymbolicLink() && existsSync(keyFilePath) && readFileSync(keyFilePath).equals(readFileSync(victimTargetFile)),
        "key file must not still be a symlink pointing at the victim target");
    });

    it("should self-heal (not fail forever) when the trusted key file is truncated/corrupted (wrong length)", async () => {
      if (process.platform === "linux" || process.platform === "win32")
        return; // POSIX permission semantics required for this test

      // A key file that passes the trust check but is truncated (crash mid-write, full disk).
      mkdirSync(`${process.cwd()}/testConfig`, { recursive: true });
      writeFileSync(keyFilePath, Buffer.alloc(13, 0x41), { mode: 0o600 });

      await tokenStore.save(testTokenResponse);

      const keyOnDiskAfter = readFileSync(keyFilePath);
      chai.expect(keyOnDiskAfter.length).to.equal(32, "a truncated key file must be replaced with a valid 32-byte key");

      const retrievedToken = await tokenStore.load();
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      chai.expect(retrievedToken!.refreshToken).equals(testTokenResponse.refreshToken);
    });
  });

  describe("custom tokenEncryption hook", () => {
    const makeStubEncryption = () => ({
      encrypt: sinon.stub().callsFake(async (plaintext: string) => Promise.resolve(Buffer.from(plaintext, "utf8"))),
      decrypt: sinon.stub().callsFake(async (ciphertext: Buffer) => Promise.resolve(ciphertext.toString("utf8"))),
    });

    it("should use a supplied tokenEncryption hook for save/load instead of the built-in cipher", async () => {
      if (process.platform === "linux")
        return;

      const tokenEncryption = makeStubEncryption();
      const store = new TokenStore({
        clientId: "testClientId",
        issuerUrl: "https://testUrl.com",
        scopes: "testScope1 testScope2",
      }, `${process.cwd()}/testConfig`, tokenEncryption);
      await store.initialize();

      await store.save(testTokenResponse);
      chai.assert.isTrue(tokenEncryption.encrypt.calledOnce, "expected the custom encrypt() to be used on save");

      const retrievedToken = await store.load();
      chai.assert.isTrue(tokenEncryption.decrypt.calledOnce, "expected the custom decrypt() to be used on load");
      chai.assert.isDefined(retrievedToken);
      chai.expect(retrievedToken?.refreshToken).equals(testTokenResponse.refreshToken);
    });

    it("should treat a blob written with a different encryption scheme as a clean cache miss (no throw)", async () => {
      if (process.platform === "linux")
        return;

      // Written using the built-in (no hook) scheme.
      await tokenStore.save(testTokenResponse);

      // Read back using an instance configured with a custom tokenEncryption hook pointed at the same store.
      const tokenEncryption = makeStubEncryption();
      const storeWithHook = new TokenStore({
        clientId: "testClientId",
        issuerUrl: "https://testUrl.com",
        scopes: "testScope1 testScope2",
      }, `${process.cwd()}/testConfig`, tokenEncryption);
      await storeWithHook.initialize();

      const retrievedToken = await chai.expect(storeWithHook.load()).to.not.be.rejected;
      chai.expect(retrievedToken).to.be.undefined;
    });
  });
});
