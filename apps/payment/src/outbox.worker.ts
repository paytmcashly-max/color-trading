import { signPayload } from "@color-trading/shared/payment-signing";

import { config } from "./config.js";
import { pool } from "./db.js";

interface ClaimedEvent {
  id: string;
  eventId: string;
  rawPayload: string;
  attempts: number;
}

export function startOutboxWorker() {
  const timer = setInterval(() => void runDeliveryCycle(), 2_000);
  timer.unref();
  void runDeliveryCycle();
  return () => clearInterval(timer);
}

export async function deliverNextEvent() {
  const claimed = await pool.query<ClaimedEvent>(
    `UPDATE outbox_events
     SET status = 'PROCESSING', locked_until = now() + interval '30 seconds', updated_at = now()
     WHERE id = (
       SELECT id FROM outbox_events
       WHERE status IN ('PENDING', 'PROCESSING')
         AND next_attempt_at <= now()
         AND (locked_until IS NULL OR locked_until < now())
       ORDER BY created_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING id, event_id AS "eventId", raw_payload AS "rawPayload", attempts`,
  );
  const event = claimed.rows[0];
  if (!event) return;

  const timestamp = String(Date.now());
  const signature = signPayload(`${timestamp}.${event.rawPayload}`, config.PAYMENT_SERVICE_SECRET);
  try {
    const response = await fetch(`${config.MAIN_API_URL}/api/v1/internal/payment-events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Payment-Service-Signature": signature,
        "X-Payment-Service-Timestamp": timestamp,
        "X-Payment-Service-Event-Id": event.eventId,
      },
      body: event.rawPayload,
    });
    if (!response.ok) throw new Error(`MAIN_PAYMENT_EVENT_FAILED_${response.status}`);
    await pool.query(
      `UPDATE outbox_events
       SET status = 'DELIVERED', delivered_at = now(), locked_until = NULL, updated_at = now()
       WHERE id = $1`,
      [event.id],
    );
  } catch (error) {
    const attempts = event.attempts + 1;
    const delaySeconds = Math.min(300, 2 ** Math.min(attempts, 8));
    await pool.query(
      `UPDATE outbox_events
       SET status = 'PENDING', attempts = $2, next_attempt_at = now() + ($3 * interval '1 second'),
           locked_until = NULL, last_error = $4, updated_at = now()
       WHERE id = $1`,
      [event.id, attempts, delaySeconds, String(error).slice(0, 240)],
    );
    if (attempts >= 8) {
      console.error("payment_outbox_delivery_repeatedly_failed", { eventId: event.eventId, attempts });
    }
  }
}

async function runDeliveryCycle() {
  try {
    await deliverNextEvent();
  } catch (error) {
    console.error("payment_outbox_worker_cycle_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}
