import assert from "node:assert/strict";
import test from "node:test";

import { signPayload } from "@color-trading/shared/payment-signing";

import { verifyInternalPaymentEventSignature } from "./payment.signing.js";

const secret = "payment-service-event-signing-secret-long-enough";
const timestamp = "1700000000000";
const rawBody = Buffer.from('{"eventId":"event-1"}');

test("internal payment event signature rejects altered and expired payloads", () => {
  const signature = signPayload(`${timestamp}.${rawBody.toString("utf8")}`, secret);
  assert.equal(verifyInternalPaymentEventSignature({
    rawBody,
    signature,
    timestamp,
    secret,
    now: Number(timestamp),
  }), true);
  assert.equal(verifyInternalPaymentEventSignature({
    rawBody: Buffer.from(`${rawBody.toString("utf8")} `),
    signature,
    timestamp,
    secret,
    now: Number(timestamp),
  }), false);
  assert.equal(verifyInternalPaymentEventSignature({
    rawBody,
    signature,
    timestamp,
    secret,
    now: Number(timestamp) + 300_001,
  }), false);
});
