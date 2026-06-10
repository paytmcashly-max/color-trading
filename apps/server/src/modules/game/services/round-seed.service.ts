import { HttpError } from "../../../common/errors/http-error.js";
import { env } from "../../../config/env.js";
import { getRedisClient } from "../../../database/redis.client.js";
import { ROUND_DURATION_MS } from "../game.constants.js";

const localSeedVault = new Map<string, { seedReveal: string; expiresAt: number }>();

export async function storeRoundSeedReveal(roundId: string, seedReveal: string) {
  const redis = getRedisClient();

  if (redis) {
    await redis.set(seedKey(roundId), seedReveal, "PX", ROUND_DURATION_MS * 2);
    return;
  }

  if (env.NODE_ENV === "production") {
    throw new HttpError(503, "ROUND_SEED_STORE_UNAVAILABLE", "Redis is required to store round seeds in production.");
  }

  sweepExpiredLocalSeeds();
  localSeedVault.set(roundId, {
    seedReveal,
    expiresAt: Date.now() + ROUND_DURATION_MS * 2,
  });
}

export async function readRoundSeedReveal(roundId: string) {
  const redis = getRedisClient();

  if (redis) {
    return redis.get(seedKey(roundId));
  }

  const localSeed = localSeedVault.get(roundId);

  if (!localSeed || localSeed.expiresAt <= Date.now()) {
    localSeedVault.delete(roundId);
    return null;
  }

  return localSeed.seedReveal;
}

export async function clearRoundSeedReveal(roundId: string) {
  const redis = getRedisClient();

  if (redis) {
    await redis.del(seedKey(roundId));
    return;
  }

  localSeedVault.delete(roundId);
}

function seedKey(roundId: string) {
  return `game:round:${roundId}:seed`;
}

function sweepExpiredLocalSeeds() {
  const now = Date.now();

  for (const [roundId, seed] of localSeedVault) {
    if (seed.expiresAt <= now) {
      localSeedVault.delete(roundId);
    }
  }
}
