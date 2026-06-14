CREATE TYPE "PaymentIntentStatus" AS ENUM ('CREATED', 'PAYMENT_STARTED', 'PAID_VERIFIED', 'CREDITED', 'FAILED', 'EXPIRED');

CREATE TABLE "payment_intents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "amount_paise" BIGINT NOT NULL,
  "status" "PaymentIntentStatus" NOT NULL DEFAULT 'CREATED',
  "payment_service_order_id" VARCHAR(80),
  "provider" VARCHAR(40),
  "provider_txn_id" VARCHAR(120),
  "idempotency_key" VARCHAR(160) NOT NULL,
  "credited_at" TIMESTAMPTZ(6),
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_intents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "payment_intents_amount_paise_check" CHECK ("amount_paise" BETWEEN 1000 AND 1000000 AND MOD("amount_paise", 100) = 0)
);

CREATE UNIQUE INDEX "payment_intents_provider_txn_id_key" ON "payment_intents"("provider_txn_id");
CREATE UNIQUE INDEX "payment_intents_idempotency_key_key" ON "payment_intents"("idempotency_key");
CREATE INDEX "payment_intents_user_id_created_at_idx" ON "payment_intents"("user_id", "created_at");
CREATE INDEX "payment_intents_status_created_at_idx" ON "payment_intents"("status", "created_at");

CREATE TABLE "processed_payment_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "intent_id" UUID NOT NULL,
  "provider" VARCHAR(40) NOT NULL,
  "status" VARCHAR(40) NOT NULL,
  "payload_hash" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "processed_payment_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "processed_payment_events_intent_id_fkey" FOREIGN KEY ("intent_id") REFERENCES "payment_intents"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "processed_payment_events_event_id_key" ON "processed_payment_events"("event_id");
CREATE INDEX "processed_payment_events_intent_id_idx" ON "processed_payment_events"("intent_id");

CREATE TABLE "premium_credit_wallets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "balance_credits" BIGINT NOT NULL DEFAULT 0,
  "ledger_version" BIGINT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "premium_credit_wallets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "premium_credit_wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "premium_credit_wallets_user_id_key" ON "premium_credit_wallets"("user_id");

CREATE TABLE "premium_credit_ledger" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "wallet_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "credits" BIGINT NOT NULL,
  "balance_before" BIGINT NOT NULL,
  "balance_after" BIGINT NOT NULL,
  "payment_intent_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(160) NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "premium_credit_ledger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "premium_credit_ledger_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "premium_credit_wallets"("id") ON DELETE RESTRICT,
  CONSTRAINT "premium_credit_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "premium_credit_ledger_payment_intent_id_fkey" FOREIGN KEY ("payment_intent_id") REFERENCES "payment_intents"("id") ON DELETE RESTRICT,
  CONSTRAINT "premium_credit_ledger_credits_check" CHECK ("credits" > 0 AND "balance_after" = "balance_before" + "credits")
);
CREATE UNIQUE INDEX "premium_credit_ledger_idempotency_key_key" ON "premium_credit_ledger"("idempotency_key");
CREATE INDEX "premium_credit_ledger_user_id_created_at_idx" ON "premium_credit_ledger"("user_id", "created_at");
CREATE INDEX "premium_credit_ledger_payment_intent_id_idx" ON "premium_credit_ledger"("payment_intent_id");
