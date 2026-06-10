import { getRedisClient } from "../../database/redis.client.js";
import { getPrismaClient } from "../../database/prisma.client.js";
import { env } from "../../config/env.js";
import { logger } from "../../common/utils/logger.js";
import { WalletRepository } from "../wallet/wallet.repository.js";
import { WalletService } from "../wallet/wallet.service.js";
import { GameRepository } from "./repositories/game.repository.js";
import { RedisLockService } from "./services/redis-lock.service.js";
import { ResultService } from "./services/result.service.js";
import { RoundService } from "./services/round.service.js";
import { SchedulerService } from "./services/scheduler.service.js";
import { SettlementService } from "./services/settlement.service.js";

export function startGameEngine() {
  if (!shouldStartGameEngine()) {
    logger.info("game_engine_disabled", { reason: "GAME_ENGINE_ENABLED=false" });
    return null;
  }

  const redis = getRedisClient();

  if (!redis) {
    console.warn("Game engine scheduler running in single-instance mode: REDIS_URL is not configured.");
  }

  const prisma = getPrismaClient();
  const gameRepository = new GameRepository(prisma);
  const walletService = new WalletService(new WalletRepository(prisma));
  const settlementService = new SettlementService(gameRepository, walletService);
  const roundService = new RoundService(gameRepository, new ResultService(), settlementService);
  const scheduler = new SchedulerService(roundService, new RedisLockService(redis));

  scheduler.start();

  return scheduler;
}

export function shouldStartGameEngine(config: Pick<typeof env, "GAME_ENGINE_ENABLED"> = env) {
  return config.GAME_ENGINE_ENABLED;
}
