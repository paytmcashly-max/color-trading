import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.PAYMENT_SERVICE_ENABLED = "true";
process.env.PAYMENT_DATABASE_URL = "postgresql://user:password@localhost:5432/payment_test";
process.env.MAIN_API_URL = "http://localhost:4000";
process.env.MAIN_CLIENT_URL = "http://localhost:3000";
process.env.PAYMENT_INTENT_SIGNING_SECRET = "payment-intent-test-secret-at-least-32-characters";
process.env.PAYMENT_SERVICE_SECRET = "payment-service-test-secret-at-least-32-characters";
process.env.CASHFREE_CLIENT_ID = "sandbox-client";
process.env.CASHFREE_CLIENT_SECRET = "sandbox-secret";
process.env.CASHFREE_RETURN_URL = "http://localhost:4100/return?order_id={order_id}";
process.env.CASHFREE_WEBHOOK_URL = "http://localhost:4100/api/webhooks/cashfree";

const { createSignedToken, verifySignedToken } = await import("@color-trading/shared/payment-signing");
const { verifyCashfreeSignature } = await import("./cashfree.client.js");
const { PaymentService, verifiedSuccessfulPayment } = await import("./payment.service.js");

test("payment intent token rejects tampering and preserves isolated purpose", () => {
  const token = createSignedToken({
    secret: process.env.PAYMENT_INTENT_SIGNING_SECRET!,
    payload: {
      intentId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
      amountPaise: "1000",
      purpose: "PREMIUM_CREDITS",
      expiresAt: "2030-01-01T00:00:00.000Z",
      nonce: "33333333-3333-4333-8333-333333333333",
    },
  });
  const payload = verifySignedToken<{ purpose: string }>(token, process.env.PAYMENT_INTENT_SIGNING_SECRET!);
  assert.equal(payload.purpose, "PREMIUM_CREDITS");
  assert.throws(() => verifySignedToken(`${token}x`, process.env.PAYMENT_INTENT_SIGNING_SECRET!));
});

test("payment intent token supports isolated real-money deposit purpose", () => {
  const token = createSignedToken({
    secret: process.env.PAYMENT_INTENT_SIGNING_SECRET!,
    payload: {
      intentId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
      amountPaise: "1000",
      purpose: "REAL_MONEY_GAME_DEPOSIT",
      expiresAt: "2030-01-01T00:00:00.000Z",
      nonce: "33333333-3333-4333-8333-333333333333",
    },
  });
  const payload = verifySignedToken<{ purpose: string }>(token, process.env.PAYMENT_INTENT_SIGNING_SECRET!);
  assert.equal(payload.purpose, "REAL_MONEY_GAME_DEPOSIT");
});

test("expired signed payment intent is rejected before any database checkout session is created", async () => {
  const token = createSignedToken({
    secret: process.env.PAYMENT_INTENT_SIGNING_SECRET!,
    payload: {
      intentId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
      amountPaise: "1000",
      purpose: "PREMIUM_CREDITS",
      expiresAt: "2020-01-01T00:00:00.000Z",
      nonce: "33333333-3333-4333-8333-333333333333",
    },
  });

  await assert.rejects(() => new PaymentService().exchangeSignedIntent(token), /PAYMENT_LINK_EXPIRED/);
});

test("Cashfree webhook signature verifies exact raw body only", () => {
  const timestamp = "1700000000000";
  const rawBody = Buffer.from('{"type":"PAYMENT_SUCCESS_WEBHOOK"}');
  const signature = crypto.createHmac("sha256", process.env.CASHFREE_CLIENT_SECRET!)
    .update(timestamp)
    .update(rawBody)
    .digest("base64");

  assert.equal(verifyCashfreeSignature(rawBody, timestamp, signature), true);
  assert.equal(verifyCashfreeSignature(Buffer.from(`${rawBody.toString()} `), timestamp, signature), false);
});

test("provider reconciliation requires matching paid order, currency, amount, and order ID", () => {
  const order = {
    cf_order_id: "cf-order-1",
    order_id: "pc_order_1",
    order_amount: 100,
    order_currency: "INR",
    order_status: "PAID",
  };
  const payment = {
    cf_payment_id: "cf-payment-1",
    order_id: "pc_order_1",
    payment_amount: 100,
    payment_currency: "INR",
    payment_status: "SUCCESS",
  };
  const expected = { providerOrderId: "pc_order_1", amountPaise: "10000" };

  assert.equal(verifiedSuccessfulPayment(order, [payment], expected)?.cf_payment_id, "cf-payment-1");
  assert.equal(verifiedSuccessfulPayment({ ...order, order_id: "other" }, [payment], expected), undefined);
  assert.equal(verifiedSuccessfulPayment({ ...order, order_amount: 101 }, [payment], expected), undefined);
  assert.equal(verifiedSuccessfulPayment(order, [{ ...payment, order_id: "other" }], expected), undefined);
  assert.equal(verifiedSuccessfulPayment(order, [{ ...payment, payment_currency: "USD" }], expected), undefined);
});
