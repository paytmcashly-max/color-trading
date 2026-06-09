DROP INDEX IF EXISTS "bets_user_id_round_id_key";

CREATE INDEX IF NOT EXISTS "bets_user_id_round_id_idx"
  ON "bets"("user_id", "round_id");
