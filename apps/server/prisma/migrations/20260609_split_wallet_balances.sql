ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS deposit_balance BIGINT,
  ADD COLUMN IF NOT EXISTS winning_balance BIGINT NOT NULL DEFAULT 0;

UPDATE wallets
SET deposit_balance = COALESCE(deposit_balance, balance_coins, 0)
WHERE deposit_balance IS NULL;

ALTER TABLE wallets
  ALTER COLUMN deposit_balance SET NOT NULL,
  ALTER COLUMN deposit_balance SET DEFAULT 1000;

ALTER TABLE wallets
  DROP CONSTRAINT IF EXISTS wallets_balance_non_negative,
  ADD CONSTRAINT wallets_deposit_balance_non_negative CHECK (deposit_balance >= 0),
  ADD CONSTRAINT wallets_winning_balance_non_negative CHECK (winning_balance >= 0);

ALTER TABLE wallets
  DROP COLUMN IF EXISTS balance_coins;
