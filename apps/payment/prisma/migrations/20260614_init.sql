CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "checkout_sessions" (
  "id" UUID PRIMARY KEY,
  "intent_id" UUID NOT NULL UNIQUE,
  "intent_payload" JSONB NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "payment_service_orders" (
  "id" UUID PRIMARY KEY,
  "intent_id" UUID NOT NULL UNIQUE,
  "session_id" UUID NOT NULL UNIQUE,
  "user_id" UUID NOT NULL,
  "amount_paise" BIGINT NOT NULL,
  "purpose" VARCHAR(40) NOT NULL,
  "provider" VARCHAR(40) NOT NULL,
  "provider_order_id" VARCHAR(80) NOT NULL UNIQUE,
  "cf_order_id" VARCHAR(80) UNIQUE,
  "payment_session_id" TEXT,
  "status" VARCHAR(40) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_service_orders_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "checkout_sessions"("id") ON DELETE RESTRICT,
  CONSTRAINT "payment_service_orders_amount_paise_check" CHECK ("amount_paise" BETWEEN 1000 AND 1000000 AND MOD("amount_paise", 100) = 0)
);
CREATE INDEX IF NOT EXISTS "payment_service_orders_status_created_at_idx"
  ON "payment_service_orders"("status", "created_at");

CREATE TABLE IF NOT EXISTS "provider_transactions" (
  "id" UUID PRIMARY KEY,
  "intent_id" UUID NOT NULL,
  "provider_order_id" VARCHAR(80) NOT NULL UNIQUE,
  "provider_txn_id" VARCHAR(120) NOT NULL UNIQUE,
  "amount_paise" BIGINT NOT NULL,
  "status" VARCHAR(40) NOT NULL,
  "paid_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "provider_transactions_provider_order_id_fkey" FOREIGN KEY ("provider_order_id") REFERENCES "payment_service_orders"("provider_order_id") ON DELETE RESTRICT,
  CONSTRAINT "provider_transactions_amount_paise_check" CHECK ("amount_paise" BETWEEN 1000 AND 1000000 AND MOD("amount_paise", 100) = 0)
);
CREATE INDEX IF NOT EXISTS "provider_transactions_intent_id_idx"
  ON "provider_transactions"("intent_id");

CREATE TABLE IF NOT EXISTS "outbox_events" (
  "id" UUID PRIMARY KEY,
  "event_id" UUID NOT NULL UNIQUE,
  "raw_payload" TEXT NOT NULL,
  "status" VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_until" TIMESTAMPTZ(6),
  "delivered_at" TIMESTAMPTZ(6),
  "last_error" VARCHAR(240),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "outbox_events_status_next_attempt_at_idx"
  ON "outbox_events"("status", "next_attempt_at");
