CREATE TYPE "PaymentIntentPurpose" AS ENUM ('PREMIUM_CREDITS', 'REAL_MONEY_GAME_DEPOSIT');
CREATE TYPE "RealMoneyWalletStatus" AS ENUM ('ACTIVE', 'FROZEN', 'CLOSED');
CREATE TYPE "RealMoneyLedgerType" AS ENUM (
  'DEPOSIT_APPROVED', 'BET_LOCKED', 'BET_WON_PAYOUT', 'BET_LOST_SETTLED',
  'BET_REFUND', 'WITHDRAWAL_LOCKED', 'WITHDRAWAL_REJECTED_RELEASE',
  'WITHDRAWAL_PAID', 'ADMIN_ADJUSTMENT'
);
CREATE TYPE "RealMoneyBetStatus" AS ENUM ('PENDING', 'WON', 'LOST', 'CANCELLED', 'REFUNDED');
CREATE TYPE "RealMoneySettlementStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');
CREATE TYPE "KycStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED');
CREATE TYPE "RealMoneyDepositStatus" AS ENUM ('INTENT_CREATED', 'PAID_VERIFIED', 'CREDITED', 'FAILED');
CREATE TYPE "RealMoneyWithdrawalStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED');

ALTER TABLE payment_intents
  ADD COLUMN purpose "PaymentIntentPurpose" NOT NULL DEFAULT 'PREMIUM_CREDITS';

ALTER TABLE user_risk_profiles
  ADD COLUMN real_money_bet_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN real_money_deposit_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN real_money_withdrawal_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN real_money_block_reason VARCHAR(240);

CREATE TABLE real_money_game_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  available_paise BIGINT NOT NULL DEFAULT 0,
  locked_paise BIGINT NOT NULL DEFAULT 0,
  ledger_version BIGINT NOT NULL DEFAULT 0,
  status "RealMoneyWalletStatus" NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT real_money_wallet_nonnegative CHECK (available_paise >= 0 AND locked_paise >= 0)
);
CREATE INDEX real_money_game_wallets_status_idx ON real_money_game_wallets(status);

CREATE TABLE real_money_game_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES real_money_game_wallets(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type "RealMoneyLedgerType" NOT NULL,
  amount_paise BIGINT NOT NULL,
  available_before_paise BIGINT NOT NULL,
  available_after_paise BIGINT NOT NULL,
  locked_before_paise BIGINT NOT NULL,
  locked_after_paise BIGINT NOT NULL,
  idempotency_key VARCHAR(160) NOT NULL UNIQUE,
  reference_type VARCHAR(60) NOT NULL,
  reference_id VARCHAR(120) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT real_money_ledger_positive_amount CHECK (amount_paise > 0),
  CONSTRAINT real_money_ledger_nonnegative_balances CHECK (
    available_before_paise >= 0 AND available_after_paise >= 0 AND
    locked_before_paise >= 0 AND locked_after_paise >= 0
  )
);
CREATE INDEX real_money_game_ledger_user_created_idx ON real_money_game_ledger(user_id, created_at DESC);
CREATE INDEX real_money_game_ledger_reference_idx ON real_money_game_ledger(reference_type, reference_id);

CREATE TABLE real_money_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  round_id UUID NOT NULL REFERENCES game_rounds(round_id) ON DELETE RESTRICT,
  choice "PredictionColor" NOT NULL,
  stake_paise BIGINT NOT NULL,
  payout_paise BIGINT NOT NULL DEFAULT 0,
  status "RealMoneyBetStatus" NOT NULL DEFAULT 'PENDING',
  idempotency_key VARCHAR(160) NOT NULL UNIQUE,
  settled_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT real_money_bet_positive_stake CHECK (stake_paise > 0),
  CONSTRAINT real_money_bet_nonnegative_payout CHECK (payout_paise >= 0)
);
CREATE INDEX real_money_bets_user_created_idx ON real_money_bets(user_id, created_at DESC);
CREATE INDEX real_money_bets_round_status_idx ON real_money_bets(round_id, status);
CREATE INDEX real_money_bets_round_choice_idx ON real_money_bets(round_id, choice);

CREATE TABLE real_money_round_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL UNIQUE REFERENCES game_rounds(round_id) ON DELETE RESTRICT,
  result "PredictionColor" NOT NULL,
  status "RealMoneySettlementStatus" NOT NULL DEFAULT 'PENDING',
  total_bets INTEGER NOT NULL DEFAULT 0,
  total_payout_paise BIGINT NOT NULL DEFAULT 0,
  failure_reason VARCHAR(500),
  started_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX real_money_round_settlements_status_created_idx ON real_money_round_settlements(status, created_at DESC);

CREATE TABLE user_kyc_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status "KycStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
  jurisdiction VARCHAR(80),
  review_note VARCHAR(500),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX user_kyc_profiles_status_idx ON user_kyc_profiles(status);

CREATE TABLE responsible_gaming_limits (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  daily_deposit_paise BIGINT,
  daily_withdrawal_paise BIGINT,
  daily_loss_paise BIGINT,
  per_bet_paise BIGINT,
  self_excluded_until TIMESTAMPTZ(6),
  cooling_off_until TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT responsible_limits_positive CHECK (
    (daily_deposit_paise IS NULL OR daily_deposit_paise > 0) AND
    (daily_withdrawal_paise IS NULL OR daily_withdrawal_paise > 0) AND
    (daily_loss_paise IS NULL OR daily_loss_paise > 0) AND
    (per_bet_paise IS NULL OR per_bet_paise > 0)
  )
);

CREATE TABLE real_money_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  payment_intent_id UUID NOT NULL UNIQUE REFERENCES payment_intents(id) ON DELETE RESTRICT,
  amount_paise BIGINT NOT NULL,
  status "RealMoneyDepositStatus" NOT NULL DEFAULT 'INTENT_CREATED',
  provider_txn_id VARCHAR(120) UNIQUE,
  credited_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT real_money_deposit_positive_amount CHECK (amount_paise > 0)
);
CREATE INDEX real_money_deposits_user_created_idx ON real_money_deposits(user_id, created_at DESC);
CREATE INDEX real_money_deposits_status_created_idx ON real_money_deposits(status, created_at DESC);

CREATE TABLE real_money_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_paise BIGINT NOT NULL,
  status "RealMoneyWithdrawalStatus" NOT NULL DEFAULT 'REQUESTED',
  idempotency_key VARCHAR(160) NOT NULL UNIQUE,
  review_note VARCHAR(500),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ(6),
  paid_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT real_money_withdrawal_positive_amount CHECK (amount_paise > 0)
);
CREATE INDEX real_money_withdrawals_user_created_idx ON real_money_withdrawals(user_id, created_at DESC);
CREATE INDEX real_money_withdrawals_status_created_idx ON real_money_withdrawals(status, created_at DESC);
