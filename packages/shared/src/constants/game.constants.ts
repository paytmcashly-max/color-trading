export const GAME_TIME_SECONDS = 60;
export const BET_LOCK_TIME_SECONDS = 45;

export const GAME_TIMING = {
  roundDurationSeconds: GAME_TIME_SECONDS,
  betLockAfterSeconds: BET_LOCK_TIME_SECONDS,
} as const;

export const ROUND_ENGINE_LIFECYCLE = [
  "WAITING",
  "BETTING",
  "LOCKED",
  "RESULT",
  "SETTLED",
] as const;
