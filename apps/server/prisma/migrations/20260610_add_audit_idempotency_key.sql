ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(160);

CREATE UNIQUE INDEX IF NOT EXISTS audit_logs_idempotency_key_key
  ON audit_logs (idempotency_key);
