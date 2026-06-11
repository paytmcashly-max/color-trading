import { logger } from "../../../common/utils/logger.js";
import { getRedisClient } from "../../../database/redis.client.js";
import { ROUND_DURATION_MS } from "../game.constants.js";
import type { Redis } from "ioredis";

const localSeedVault = new Map<string, { seedReveal: string; expiresAt: number }>();

export async function storeRoundSeedReveal(
  roundId: string,
  seedReveal: string,
  redis: Redis | null = getRedisClient(),
) {

  if (redis) {
    try {
      await redis.set(seedKey(roundId), seedReveal, "PX", ROUND_DURATION_MS * 2);
      return;
    } catch (error) {
      logger.warn("round_seed_cache_write_failed", { error, roundId });
    }
  }

  sweepExpiredLocalSeeds();
  localSeedVault.set(roundId, {
    seedReveal,
    expiresAt: Date.now() + ROUND_DURATION_MS * 2,
  });
}

export async function readRoundSeedReveal(
  roundId: string,
  redis: Redis | null = getRedisClient(),
) {

  if (redis) {
    try {
      const cached = await redis.get(seedKey(roundId));
      if (cached) {
        return cached;
      }
    } catch (error) {
      logger.warn("round_seed_cache_read_failed", { error, roundId });
    }
  }

  const localSeed = localSeedVault.get(roundId);

  if (!localSeed || localSeed.expiresAt <= Date.now()) {
    localSeedVault.delete(roundId);
    return null;
  }

  return localSeed.seedReveal;
}

export async function clearRoundSeedReveal(
  roundId: string,
  redis: Redis | null = getRedisClient(),
) {

  if (redis) {
    try {
      await redis.del(seedKey(roundId));
    } catch (error) {
      logger.warn("round_seed_cache_clear_failed", { error, roundId });
    }
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
