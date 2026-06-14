import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, createSignedToken, verifyPayloadSignature, verifySignedToken } from "./payment-signing.js";

const secret = "shared-payment-signing-test-secret-long-enough";

test("canonical JSON and signed token are stable for nested object order", () => {
  assert.equal(
    canonicalJson({ z: 1, nested: { b: 2, a: 1 } }),
    canonicalJson({ nested: { a: 1, b: 2 }, z: 1 }),
  );

  const token = createSignedToken({ payload: { intentId: "intent-1" }, secret });
  assert.deepEqual(verifySignedToken(token, secret), { intentId: "intent-1" });
});

test("tampered signatures are rejected safely", () => {
  assert.equal(verifyPayloadSignature("payload", "not-a-signature", secret), false);
  const token = createSignedToken({ payload: { intentId: "intent-1" }, secret });
  assert.throws(() => verifySignedToken(`${token}0`, secret));
});
