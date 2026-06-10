ALTER TABLE coin_ledger
  ADD COLUMN IF NOT EXISTS balance_after_coins BIGINT;

UPDATE coin_ledger
SET balance_after_coins =
  CASE
    WHEN direction = 'CREDIT' THEN amount_coins
    WHEN direction = 'DEBIT' THEN -amount_coins
    ELSE amount_coins
  END
WHERE balance_after_coins IS NULL;
