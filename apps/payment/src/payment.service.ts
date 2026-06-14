import crypto from "node:crypto";

import type { SignedPaymentIntent, VerifiedPaymentEvent } from "@color-trading/shared";
import { verifySignedToken } from "@color-trading/shared/payment-signing";
import { z } from "zod";

import { CashfreeClient, type CashfreeOrder, type CashfreePayment } from "./cashfree.client.js";
import { config } from "./config.js";
import { pool } from "./db.js";

const signedIntentSchema = z.object({
  intentId: z.string().uuid(),
  userId: z.string().uuid(),
  amountPaise: z.string().regex(/^[1-9]\d*$/).refine((value) => {
    const amount = BigInt(value);
    return amount >= 1_000n && amount <= 1_000_000n && amount % 100n === 0n;
  }, "Amount must be whole rupees between INR 10 and INR 10,000."),
  purpose: z.enum(["PREMIUM_CREDITS", "REAL_MONEY_GAME_DEPOSIT"]),
  expiresAt: z.string().datetime(),
  nonce: z.string().uuid(),
});

export class PaymentService {
  constructor(private readonly cashfree = new CashfreeClient()) {}

  async exchangeSignedIntent(token: string) {
    const intent = signedIntentSchema.parse(
      verifySignedToken<SignedPaymentIntent>(token, config.PAYMENT_INTENT_SIGNING_SECRET!),
    );
    if (new Date(intent.expiresAt) <= new Date()) {
      throw new Error("PAYMENT_LINK_EXPIRED");
    }

    const sessionId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO checkout_sessions (id, intent_id, intent_payload, expires_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, now())
       ON CONFLICT (intent_id) DO NOTHING`,
      [sessionId, intent.intentId, JSON.stringify(intent), intent.expiresAt],
    );
    const result = await pool.query<{ id: string }>(
      "SELECT id FROM checkout_sessions WHERE intent_id = $1",
      [intent.intentId],
    );
    return result.rows[0]!.id;
  }

  async getSession(sessionId: string) {
    const result = await pool.query<{
      id: string;
      intentId: string;
      intentPayload: SignedPaymentIntent;
      expiresAt: Date;
    }>(
      `SELECT id, intent_id AS "intentId", intent_payload AS "intentPayload", expires_at AS "expiresAt"
       FROM checkout_sessions WHERE id = $1`,
      [sessionId],
    );
    const session = result.rows[0];
    if (!session || session.expiresAt <= new Date()) {
      throw new Error("CHECKOUT_SESSION_EXPIRED");
    }
    return session;
  }

  async createProviderOrder(sessionId: string) {
    const session = await this.getSession(sessionId);
    const providerOrderId = `${session.intentPayload.purpose === "PREMIUM_CREDITS" ? "pc" : "rm"}_${session.intentId.replaceAll("-", "")}`;
    await pool.query(
      `INSERT INTO payment_service_orders (
         id, intent_id, session_id, user_id, amount_paise, purpose, provider, provider_order_id, status, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 'cashfree', $7, 'CREATING', now())
       ON CONFLICT (intent_id) DO NOTHING`,
      [
        crypto.randomUUID(),
        session.intentId,
        session.id,
        session.intentPayload.userId,
        session.intentPayload.amountPaise,
        session.intentPayload.purpose,
        providerOrderId,
      ],
    );
    const existing = await pool.query<{
      providerOrderId: string;
      paymentSessionId: string | null;
      status: string;
    }>(
      `SELECT provider_order_id AS "providerOrderId", payment_session_id AS "paymentSessionId", status
       FROM payment_service_orders WHERE intent_id = $1`,
      [session.intentId],
    );
    if (existing.rows[0]?.paymentSessionId) {
      return existing.rows[0];
    }

    const order = await this.cashfree.createOrder({
      orderId: providerOrderId,
      amountPaise: session.intentPayload.amountPaise,
      userId: session.intentPayload.userId,
      idempotencyKey: session.id,
      purpose: session.intentPayload.purpose,
    });
    await pool.query(
      `UPDATE payment_service_orders
       SET cf_order_id = $2, payment_session_id = $3, status = $4, updated_at = now()
       WHERE intent_id = $1`,
      [
        session.intentId,
        order.cf_order_id,
        order.payment_session_id,
        order.order_status,
      ],
    );
    return {
      providerOrderId,
      paymentSessionId: order.payment_session_id ?? "",
      status: order.order_status,
    };
  }

  async reconcileOrder(providerOrderId: string) {
    const localResult = await pool.query<{
      intentId: string;
      userId: string;
      amountPaise: string;
      purpose: "PREMIUM_CREDITS" | "REAL_MONEY_GAME_DEPOSIT";
    }>(
      `SELECT intent_id AS "intentId", user_id AS "userId", amount_paise::text AS "amountPaise", purpose
       FROM payment_service_orders WHERE provider_order_id = $1`,
      [providerOrderId],
    );
    const local = localResult.rows[0];
    if (!local) throw new Error("PAYMENT_ORDER_NOT_FOUND");

    const [order, payments] = await Promise.all([
      this.cashfree.getOrder(providerOrderId),
      this.cashfree.getPayments(providerOrderId),
    ]);
    const successful = verifiedSuccessfulPayment(order, payments, {
      providerOrderId,
      amountPaise: local.amountPaise,
    });
    if (!successful) {
      return { verified: false, intentId: local.intentId };
    }

    const paidAt = successful.payment_completion_time ?? new Date().toISOString();
    const event: VerifiedPaymentEvent = {
      eventId: crypto.randomUUID(),
      intentId: local.intentId,
      userId: local.userId,
      amountPaise: local.amountPaise,
      purpose: local.purpose,
      provider: "cashfree",
      providerOrderId,
      providerTxnId: successful.cf_payment_id,
      status: "PAID_VERIFIED",
      paidAt,
    };
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO provider_transactions (
           id, intent_id, provider_order_id, provider_txn_id, amount_paise, status, paid_at
         ) VALUES ($1, $2, $3, $4, $5, 'PAID_VERIFIED', $6)
         ON CONFLICT (provider_txn_id) DO NOTHING
         RETURNING id`,
        [crypto.randomUUID(), local.intentId, providerOrderId, successful.cf_payment_id, local.amountPaise, paidAt],
      );
      if (inserted.rowCount) {
        await client.query(
          `INSERT INTO outbox_events (id, event_id, raw_payload, status, updated_at)
           VALUES ($1, $2, $3, 'PENDING', now())`,
          [crypto.randomUUID(), event.eventId, JSON.stringify(event)],
        );
      }
      await client.query(
        "UPDATE payment_service_orders SET status = 'PAID_VERIFIED', updated_at = now() WHERE provider_order_id = $1",
        [providerOrderId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return { verified: true, intentId: local.intentId };
  }
}

export function verifiedSuccessfulPayment(
  order: CashfreeOrder,
  payments: CashfreePayment[],
  expected: { providerOrderId: string; amountPaise: string },
) {
  const expectedAmount = BigInt(expected.amountPaise);
  const orderAmount = toPaise(order.order_amount);
  if (
    order.order_id !== expected.providerOrderId ||
    order.order_status !== "PAID" ||
    order.order_currency !== "INR" ||
    orderAmount !== expectedAmount
  ) {
    return undefined;
  }

  return payments.find((payment) =>
    payment.payment_status === "SUCCESS" &&
    payment.order_id === expected.providerOrderId &&
    payment.payment_currency === "INR" &&
    toPaise(payment.payment_amount) === expectedAmount
  );
}

function toPaise(amount: number) {
  if (!Number.isFinite(amount)) return undefined;
  const paise = Math.round(amount * 100);
  return Number.isSafeInteger(paise) ? BigInt(paise) : undefined;
}
