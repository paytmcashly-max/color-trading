ALTER TABLE bets
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(160);

CREATE UNIQUE INDEX IF NOT EXISTS bets_idempotency_key_key
  ON bets (idempotency_key);
