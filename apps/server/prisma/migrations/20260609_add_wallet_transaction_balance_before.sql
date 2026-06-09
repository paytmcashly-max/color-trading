ALTER TABLE coin_ledger
  ADD COLUMN IF NOT EXISTS balance_after_coins BIGINT,
  ADD COLUMN IF NOT EXISTS balance_before_coins BIGINT;

UPDATE coin_ledger
SET balance_after_coins =
  CASE
    WHEN direction = 'CREDIT' THEN amount_coins
    WHEN direction = 'DEBIT' THEN -amount_coins
    ELSE amount_coins
  END
WHERE balance_after_coins IS NULL;

UPDATE coin_ledger
SET balance_before_coins =
  CASE
    WHEN direction = 'CREDIT' THEN balance_after_coins - amount_coins
    WHEN direction = 'DEBIT' THEN balance_after_coins + amount_coins
    ELSE balance_after_coins
  END
WHERE balance_before_coins IS NULL
  AND balance_after_coins IS NOT NULL;

CREATE OR REPLACE VIEW wallet_transactions AS
SELECT
  id,
  user_id,
  CASE
    WHEN type = 'BET_DEBIT' THEN 'BET'
    WHEN type = 'BET_WIN_CREDIT' THEN 'WIN'
    WHEN type = 'ADMIN_ADJUSTMENT' THEN 'ADMIN_ADJUSTMENT'
    ELSE 'DEPOSIT'
  END AS type,
  amount_coins AS amount,
  balance_before_coins AS balance_before,
  balance_after_coins AS balance_after,
  created_at
FROM coin_ledger;
