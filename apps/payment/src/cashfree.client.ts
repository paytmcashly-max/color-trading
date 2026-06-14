import crypto from "node:crypto";

import { config } from "./config.js";

export interface CashfreeOrder {
  cf_order_id: string;
  order_id: string;
  order_amount: number;
  order_currency: string;
  order_status: string;
  payment_session_id?: string;
}

export interface CashfreePayment {
  cf_payment_id: string;
  order_id: string;
  payment_amount: number;
  payment_currency: string;
  payment_status: string;
  payment_completion_time?: string;
}

export class CashfreeClient {
  createOrder(input: {
    orderId: string;
    amountPaise: string;
    userId: string;
    idempotencyKey: string;
    purpose: "PREMIUM_CREDITS" | "REAL_MONEY_GAME_DEPOSIT";
  }) {
    return this.request<CashfreeOrder>("/orders", {
      method: "POST",
      headers: { "x-idempotency-key": input.idempotencyKey },
      body: JSON.stringify({
        order_id: input.orderId,
        order_amount: Number(input.amountPaise) / 100,
        order_currency: "INR",
        customer_details: {
          customer_id: input.userId,
          customer_phone: "9999999999",
        },
        order_meta: {
          return_url: config.CASHFREE_RETURN_URL!,
          notify_url: config.CASHFREE_WEBHOOK_URL!,
        },
        order_note: input.purpose === "REAL_MONEY_GAME_DEPOSIT"
          ? "Compliance-gated sandbox game wallet deposit"
          : "Premium credits sandbox order",
      }),
    });
  }

  getOrder(orderId: string) {
    return this.request<CashfreeOrder>(`/orders/${encodeURIComponent(orderId)}`, { method: "GET" });
  }

  getPayments(orderId: string) {
    return this.request<CashfreePayment[]>(`/orders/${encodeURIComponent(orderId)}/payments`, { method: "GET" });
  }

  private async request<T>(path: string, options: RequestInit) {
    const response = await fetch(`${config.CASHFREE_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "x-api-version": config.CASHFREE_API_VERSION,
        "x-client-id": config.CASHFREE_CLIENT_ID!,
        "x-client-secret": config.CASHFREE_CLIENT_SECRET!,
        "x-request-id": crypto.randomUUID(),
        ...options.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`CASHFREE_REQUEST_FAILED_${response.status}`);
    }
    return response.json() as Promise<T>;
  }
}

export function verifyCashfreeSignature(rawBody: Buffer, timestamp: string, signature: string) {
  const expected = crypto.createHmac("sha256", config.CASHFREE_CLIENT_SECRET!)
    .update(timestamp)
    .update(rawBody)
    .digest();
  const received = Buffer.from(signature, "base64");
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
