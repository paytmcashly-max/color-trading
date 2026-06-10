CREATE TABLE IF NOT EXISTS round_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL UNIQUE REFERENCES game_rounds(round_id) ON DELETE RESTRICT,
  result "PredictionColor" NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED')),
  total_bets INTEGER NOT NULL DEFAULT 0,
  winning_bets INTEGER NOT NULL DEFAULT 0,
  losing_bets INTEGER NOT NULL DEFAULT 0,
  total_payout_coins BIGINT NOT NULL DEFAULT 0,
  metadata JSONB,
  started_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS round_settlements_status_created_at_idx
  ON round_settlements(status, created_at);

CREATE INDEX IF NOT EXISTS bets_round_id_status_choice_user_id_idx
  ON bets(round_id, status, choice, user_id);
