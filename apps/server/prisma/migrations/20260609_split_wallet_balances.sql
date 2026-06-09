ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS deposit_balance BIGINT,
  ADD COLUMN IF NOT EXISTS winning_balance BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'wallets'
      AND column_name = 'balance_coins'
  ) THEN
    UPDATE wallets
    SET deposit_balance = COALESCE(deposit_balance, balance_coins, 0)
    WHERE deposit_balance IS NULL;
  ELSE
    UPDATE wallets
    SET deposit_balance = COALESCE(deposit_balance, 0)
    WHERE deposit_balance IS NULL;
  END IF;
END $$;

ALTER TABLE wallets
  ALTER COLUMN deposit_balance SET NOT NULL,
  ALTER COLUMN deposit_balance SET DEFAULT 1000;

ALTER TABLE wallets
  DROP CONSTRAINT IF EXISTS wallets_balance_non_negative;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wallets_deposit_balance_non_negative'
  ) THEN
    ALTER TABLE wallets
      ADD CONSTRAINT wallets_deposit_balance_non_negative CHECK (deposit_balance >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wallets_winning_balance_non_negative'
  ) THEN
    ALTER TABLE wallets
      ADD CONSTRAINT wallets_winning_balance_non_negative CHECK (winning_balance >= 0);
  END IF;
END $$;

ALTER TABLE wallets
  DROP COLUMN IF EXISTS balance_coins;
