-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "WalletStatus" AS ENUM ('ACTIVE', 'FROZEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CoinLedgerType" AS ENUM ('BET_DEBIT', 'BET_WIN_CREDIT', 'PURCHASE_CREDIT', 'BONUS_CREDIT', 'ADMIN_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "CoinLedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "CoinLedgerStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "LedgerReferenceType" AS ENUM ('BET', 'ROUND', 'COIN_PACKAGE', 'ADMIN_ACTION', 'EXTERNAL_PURCHASE');

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('INIT', 'OPEN', 'LOCKED', 'RESOLVING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PredictionColor" AS ENUM ('RED', 'GREEN', 'VIOLET');

-- CreateEnum
CREATE TYPE "BetStatus" AS ENUM ('PENDING', 'WON', 'LOST', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FraudSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" VARCHAR(80),
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "event_type" VARCHAR(80) NOT NULL,
    "severity" "FraudSeverity" NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "level" "LogLevel" NOT NULL,
    "message" VARCHAR(240) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_metrics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "metric_name" VARCHAR(120) NOT NULL,
    "value" DECIMAL(18,4) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_risk_profiles" (
    "user_id" UUID NOT NULL,
    "risk_score" INTEGER NOT NULL DEFAULT 0,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "bot_suspected" BOOLEAN NOT NULL DEFAULT false,
    "last_updated" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_risk_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "admin_user_id" UUID,
    "actor_id" VARCHAR(120),
    "actor_type" VARCHAR(40) NOT NULL DEFAULT 'ADMIN',
    "action" VARCHAR(120),
    "action_type" VARCHAR(80) NOT NULL,
    "target_type" VARCHAR(80),
    "target_id" VARCHAR(120),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(128) NOT NULL,
    "user_agent" VARCHAR(512),
    "ip_address" INET,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "deposit_balance" BIGINT NOT NULL DEFAULT 1000,
    "winning_balance" BIGINT NOT NULL DEFAULT 0,
    "ledger_version" BIGINT NOT NULL DEFAULT 0,
    "status" "WalletStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_ledger" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "type" "CoinLedgerType" NOT NULL,
    "direction" "CoinLedgerDirection" NOT NULL,
    "amount_coins" BIGINT NOT NULL,
    "balance_after_coins" BIGINT,
    "idempotency_key" VARCHAR(160) NOT NULL,
    "reference_type" "LedgerReferenceType",
    "reference_id" UUID,
    "status" "CoinLedgerStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "coin_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_rounds" (
    "round_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "round_number" BIGINT NOT NULL,
    "start_time" TIMESTAMPTZ(6) NOT NULL,
    "lock_time" TIMESTAMPTZ(6) NOT NULL,
    "end_time" TIMESTAMPTZ(6) NOT NULL,
    "status" "RoundStatus" NOT NULL DEFAULT 'INIT',
    "result" "PredictionColor",
    "seed_hash" VARCHAR(128) NOT NULL,
    "seed_reveal" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "game_rounds_pkey" PRIMARY KEY ("round_id")
);

-- CreateTable
CREATE TABLE "bets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "choice" "PredictionColor" NOT NULL,
    "coins_staked" BIGINT NOT NULL,
    "idempotency_key" VARCHAR(160),
    "status" "BetStatus" NOT NULL DEFAULT 'PENDING',
    "payout_amount" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_packages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(80) NOT NULL,
    "coins_amount" INTEGER NOT NULL,
    "price" DECIMAL(12,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "coin_packages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE INDEX "fraud_logs_user_id_created_at_idx" ON "fraud_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "fraud_logs_event_type_created_at_idx" ON "fraud_logs"("event_type", "created_at");

-- CreateIndex
CREATE INDEX "fraud_logs_severity_created_at_idx" ON "fraud_logs"("severity", "created_at");

-- CreateIndex
CREATE INDEX "logs_level_created_at_idx" ON "logs"("level", "created_at");

-- CreateIndex
CREATE INDEX "logs_message_created_at_idx" ON "logs"("message", "created_at");

-- CreateIndex
CREATE INDEX "system_metrics_metric_name_created_at_idx" ON "system_metrics"("metric_name", "created_at");

-- CreateIndex
CREATE INDEX "user_risk_profiles_risk_score_idx" ON "user_risk_profiles"("risk_score");

-- CreateIndex
CREATE INDEX "user_risk_profiles_is_blocked_idx" ON "user_risk_profiles"("is_blocked");

-- CreateIndex
CREATE INDEX "user_risk_profiles_bot_suspected_idx" ON "user_risk_profiles"("bot_suspected");

-- CreateIndex
CREATE INDEX "audit_logs_admin_user_id_created_at_idx" ON "audit_logs"("admin_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_type_created_at_idx" ON "audit_logs"("action_type", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_key" ON "auth_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_created_at_idx" ON "auth_sessions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "auth_sessions_revoked_at_idx" ON "auth_sessions"("revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE INDEX "wallets_status_idx" ON "wallets"("status");

-- CreateIndex
CREATE UNIQUE INDEX "coin_ledger_idempotency_key_key" ON "coin_ledger"("idempotency_key");

-- CreateIndex
CREATE INDEX "coin_ledger_user_id_created_at_idx" ON "coin_ledger"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "coin_ledger_wallet_id_created_at_idx" ON "coin_ledger"("wallet_id", "created_at");

-- CreateIndex
CREATE INDEX "coin_ledger_reference_type_reference_id_idx" ON "coin_ledger"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "coin_ledger_status_created_at_idx" ON "coin_ledger"("status", "created_at");

-- CreateIndex
CREATE INDEX "coin_ledger_type_created_at_idx" ON "coin_ledger"("type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "game_rounds_round_number_key" ON "game_rounds"("round_number");

-- CreateIndex
CREATE INDEX "game_rounds_status_start_time_idx" ON "game_rounds"("status", "start_time");

-- CreateIndex
CREATE INDEX "game_rounds_start_time_idx" ON "game_rounds"("start_time");

-- CreateIndex
CREATE INDEX "game_rounds_lock_time_idx" ON "game_rounds"("lock_time");

-- CreateIndex
CREATE INDEX "game_rounds_end_time_idx" ON "game_rounds"("end_time");

-- CreateIndex
CREATE INDEX "bets_user_id_created_at_idx" ON "bets"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "bets_round_id_idx" ON "bets"("round_id");

-- CreateIndex
CREATE INDEX "bets_round_id_status_idx" ON "bets"("round_id", "status");

-- CreateIndex
CREATE INDEX "bets_status_created_at_idx" ON "bets"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "bets_idempotency_key_key" ON "bets"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "bets_user_id_round_id_key" ON "bets"("user_id", "round_id");

-- CreateIndex
CREATE INDEX "coin_packages_active_sort_order_idx" ON "coin_packages"("active", "sort_order");

-- AddForeignKey
ALTER TABLE "fraud_logs" ADD CONSTRAINT "fraud_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_risk_profiles" ADD CONSTRAINT "user_risk_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_ledger" ADD CONSTRAINT "coin_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_ledger" ADD CONSTRAINT "coin_ledger_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "game_rounds"("round_id") ON DELETE RESTRICT ON UPDATE CASCADE;
