CREATE TABLE IF NOT EXISTS game_controls (
  id VARCHAR(32) PRIMARY KEY DEFAULT 'global',
  paused BOOLEAN NOT NULL DEFAULT FALSE,
  reason VARCHAR(500),
  updated_by UUID,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

INSERT INTO game_controls (id, paused)
VALUES ('global', FALSE)
ON CONFLICT (id) DO NOTHING;
