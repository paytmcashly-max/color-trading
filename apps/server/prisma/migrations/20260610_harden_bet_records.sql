UPDATE bets
SET idempotency_key = 'legacy-bet:' || id::text
WHERE idempotency_key IS NULL;

ALTER TABLE bets
  ALTER COLUMN idempotency_key SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bets_coins_staked_positive'
  ) THEN
    ALTER TABLE bets
      ADD CONSTRAINT bets_coins_staked_positive CHECK (coins_staked > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bets_payout_amount_non_negative'
  ) THEN
    ALTER TABLE bets
      ADD CONSTRAINT bets_payout_amount_non_negative CHECK (payout_amount >= 0);
  END IF;
END
$$;
