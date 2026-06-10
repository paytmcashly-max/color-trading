ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ(6);

UPDATE users
SET email_verified_at = COALESCE(email_verified_at, now())
WHERE role = 'ADMIN'
  AND email_verified_at IS NULL;
