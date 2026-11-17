import assert from "node:assert/strict";
import { test } from "node:test";
import { PROOF_PACKAGE, proofGradleInit } from "../lib/proof-android.mjs";

test("proof APK is a separate package from the app and Trial", () => {
  assert.equal(PROOF_PACKAGE, "com.larrabee.homecockpit.s02proof");
  assert.notEqual(PROOF_PACKAGE, "com.larrabee.homecockpit");
  assert.notEqual(PROOF_PACKAGE, "com.larrabee.homecockpit.trial");
});

test("proof build type is an optimised, non-debuggable release copy", () => {
  const init = proofGradleInit();
  assert.match(init, /buildTypes\.create\('s02Proof'\)/);
  assert.match(init, /initWith\(a\.buildTypes\.getByName\('release'\)\)/);
  assert.match(init, /applicationIdSuffix '\.s02proof'/);
  assert.match(init, /debuggable false/);
  // Debug signing only: never the Trial key.
  assert.match(init, /signingConfigs\.getByName\('debug'\)/);
  assert.doesNotMatch(init, /mauriceTrial|MAURICE_SIGNING/);
});
