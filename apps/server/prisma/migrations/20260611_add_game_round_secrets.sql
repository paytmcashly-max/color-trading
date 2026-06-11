CREATE TABLE IF NOT EXISTS game_round_secrets (
  round_id UUID PRIMARY KEY REFERENCES game_rounds(round_id) ON DELETE CASCADE,
  seed_reveal_encrypted TEXT NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  revealed_at TIMESTAMPTZ(6)
);

CREATE INDEX IF NOT EXISTS game_round_secrets_revealed_at_idx
  ON game_round_secrets(revealed_at);
