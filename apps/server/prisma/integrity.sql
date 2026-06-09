CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

ALTER TABLE wallets
  ADD CONSTRAINT wallets_balance_non_negative
  CHECK (balance_coins >= 0);

ALTER TABLE coin_ledger
  ADD CONSTRAINT coin_ledger_amount_positive
  CHECK (amount_coins > 0),
  ADD CONSTRAINT coin_ledger_reference_complete
  CHECK (
    (reference_type IS NULL AND reference_id IS NULL)
    OR (reference_type IS NOT NULL AND reference_id IS NOT NULL)
  );

ALTER TABLE bets
  ADD CONSTRAINT bets_coins_staked_positive
  CHECK (coins_staked > 0),
  ADD CONSTRAINT bets_payout_amount_non_negative
  CHECK (payout_amount >= 0);

ALTER TABLE game_rounds
  ADD CONSTRAINT game_rounds_time_order
  CHECK (start_time < lock_time AND lock_time < end_time);

ALTER TABLE coin_packages
  ADD CONSTRAINT coin_packages_coins_amount_range
  CHECK (coins_amount BETWEEN 10 AND 10000),
  ADD CONSTRAINT coin_packages_price_non_negative
  CHECK (price IS NULL OR price >= 0);

CREATE INDEX IF NOT EXISTS coin_ledger_success_user_created_idx
  ON coin_ledger (user_id, created_at)
  WHERE status = 'SUCCESS';
