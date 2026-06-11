import { RoundStatus } from "@prisma/client";

import { HttpError } from "../../../common/errors/http-error.js";
import { encodeCreatedAtIdCursor, pageInfo, type PaginationInput } from "../../../common/utils/pagination.js";
import {
  BET_LOCK_AFTER_MS,
  ROUND_ENGINE_CONFIG,
  ROUND_DURATION_MS,
} from "../game.constants.js";
import { publishGameEvent } from "../game.events.js";
import { serializeRound, serializeUserBetHistory } from "../game.serializer.js";
import type { GameRepository, GameRoundRecord } from "../repositories/game.repository.js";
import type { ResultService } from "./result.service.js";
import { clearRoundSeedReveal, readRoundSeedReveal, storeRoundSeedReveal } from "./round-seed.service.js";
import type { SettlementService } from "./settlement.service.js";

export class RoundService {
  constructor(
    private readonly gameRepository: GameRepository,
    private readonly resultService?: ResultService,
    private readonly settlementService?: SettlementService,
  ) {}

  async getCurrentRound() {
    const round = await this.gameRepository.findCurrentRound();

    return {
      round: round ? serializeRound(round) : null,
      config: ROUND_ENGINE_CONFIG,
    };
  }

  getRoundConfig() {
    return {
      config: ROUND_ENGINE_CONFIG,
    };
  }

  async getRoundHistory(pagination: PaginationInput = { limit: 30 }) {
    const rounds = await this.gameRepository.findRoundHistory(pagination);
    const page = pageInfo(rounds, pagination.limit, (round) =>
      encodeCreatedAtIdCursor(round.createdAt, round.id),
    );

    return {
      rounds: page.items.map((round) => ({
        ...serializeRound(round),
        betCount: round._count.bets,
      })),
      pageInfo: page.pageInfo,
    };
  }

  async getUserBetHistory(userId: string, pagination: PaginationInput = { limit: 50 }) {
    const bets = await this.gameRepository.findUserBetHistory(userId, pagination);
    const page = pageInfo(bets, pagination.limit, (bet) =>
      encodeCreatedAtIdCursor(bet.createdAt, bet.id),
    );

    return {
      bets: page.items.map(serializeUserBetHistory),
      pageInfo: page.pageInfo,
    };
  }

  async ensureLifecycle() {
    let currentRound = await this.gameRepository.findCurrentRound();
    const gameControl = await this.gameRepository.getGameControl();

    if (gameControl?.paused) {
      if (currentRound) {
        this.emitTimer(currentRound);
      }

      publishGameEvent("system:sync", {
        type: "GAME_PAUSED",
        paused: true,
        reason: gameControl.reason,
        updatedAt: gameControl.updatedAt.toISOString(),
      });

      return currentRound;
    }

    if (!currentRound) {
      return this.createNextRound();
    }

    const now = new Date();

    if (currentRound.status === RoundStatus.INIT) {
      currentRound = await this.openRound(currentRound);
    }

    if (currentRound.status === RoundStatus.OPEN && now >= currentRound.lockTime) {
      currentRound = await this.lockRound(currentRound);
    }

    if (currentRound.status === RoundStatus.LOCKED && now >= currentRound.endTime) {
      return this.resolveRound(currentRound);
    }

    if (currentRound.status === RoundStatus.RESOLVING) {
      return this.resolveRound(currentRound);
    }

    this.emitTimer(currentRound);
    return currentRound;
  }

  private async createNextRound() {
    if (!this.resultService) {
      throw new HttpError(500, "RESULT_SERVICE_REQUIRED", "Result service is not configured.");
    }

    const latestRound = await this.gameRepository.findLatestRound();
    const roundNumber = (latestRound?.roundNumber ?? 0n) + 1n;
    const startTime = new Date();
    const lockTime = new Date(startTime.getTime() + BET_LOCK_AFTER_MS);
    const endTime = new Date(startTime.getTime() + ROUND_DURATION_MS);
    const seed = this.resultService.createSeed();

    const { round, created } = await this.gameRepository.transaction(async (tx) => {
      const existingRound = await this.gameRepository.findCurrentRoundInTx(tx);

      if (existingRound) {
        return { round: existingRound, created: false };
      }

      const createdRound = await this.gameRepository.createRound(tx, {
        roundNumber,
        startTime,
        lockTime,
        endTime,
        seedHash: seed.seedHash,
        seedReveal: seed.seedReveal,
      });

      return { round: createdRound, created: true };
    });

    if (!created) {
      return round;
    }

    await storeRoundSeedReveal(round.id, seed.seedReveal);
    const openRound = await this.openRound(round);
    publishGameEvent("round:start", this.buildRoundPayload(openRound));
    publishGameEvent("round:update", this.buildRoundPayload(openRound));
    publishGameEvent("round:created", { round: serializeRound(openRound) });

    return openRound;
  }

  private async openRound(round: GameRoundRecord) {
    await this.gameRepository.updateRoundStatus(round.id, RoundStatus.INIT, RoundStatus.OPEN);
    const openRound = await this.gameRepository.findRoundById(round.id);

    if (openRound) {
      this.emitTimer(openRound);
      return openRound;
    }

    return round;
  }

  private async lockRound(round: GameRoundRecord) {
    const updated = await this.gameRepository.updateRoundStatus(
      round.id,
      RoundStatus.OPEN,
      RoundStatus.LOCKED,
    );

    if (updated.count > 0) {
      const lockedRound = await this.gameRepository.findRoundById(round.id);
      if (lockedRound) {
        publishGameEvent("round:lock", this.buildRoundPayload(lockedRound));
        publishGameEvent("round:update", this.buildRoundPayload(lockedRound));
        publishGameEvent("round:locked", { round: serializeRound(lockedRound) });
        this.emitTimer(lockedRound);
        return lockedRound;
      }
    }

    return round;
  }

  private async resolveRound(round: GameRoundRecord) {
    if (!this.resultService || !this.settlementService) {
      throw new HttpError(500, "GAME_ENGINE_NOT_CONFIGURED", "Game engine services are not configured.");
    }

    let seedReveal: string;
    try {
      seedReveal = await this.getSeedReveal(round.id);
    } catch (error) {
      if (error instanceof HttpError && error.code === "ROUND_SEED_REVEAL_MISSING") {
        return this.recoverUnresolvableRound(round, error.code);
      }
      throw error;
    }

    if (!this.resultService.seedHashMatches(seedReveal, round.seedHash)) {
      return this.recoverUnresolvableRound(round, "ROUND_SEED_HASH_MISMATCH");
    }

    const result = round.result ?? this.resultService.generateResult(seedReveal);

    if (round.status === RoundStatus.LOCKED) {
      const updated = await this.gameRepository.updateRoundStatus(
        round.id,
        RoundStatus.LOCKED,
        RoundStatus.RESOLVING,
        {
          result,
        },
      );

      if (updated.count === 0) {
        return this.gameRepository.findRoundById(round.id);
      }
    }

    const settlement = await this.settlementService.settleRound(round.id, result);

    await this.gameRepository.updateRoundStatus(
      round.id,
      RoundStatus.RESOLVING,
      RoundStatus.COMPLETED,
      {
        result,
        seedReveal,
      },
    );

    const completedRound = await this.gameRepository.findRoundById(round.id);

    if (completedRound) {
      await this.gameRepository.markRoundSeedRevealed(completedRound.id);
      publishGameEvent("round:result", {
        ...this.buildRoundPayload(completedRound),
        result,
        settlement,
      });
      publishGameEvent("round:update", this.buildRoundPayload(completedRound));
      publishGameEvent("round:state", this.buildRoundPayload(completedRound));
      publishGameEvent("round:completed", {
        round: serializeRound(completedRound),
        settlement,
      });

      await clearRoundSeedReveal(completedRound.id);

      return this.createNextRound();
    }

    return completedRound;
  }

  private async recoverUnresolvableRound(round: GameRoundRecord, reason: string) {
    if (!this.settlementService) {
      throw new HttpError(500, "GAME_ENGINE_NOT_CONFIGURED", "Settlement service is not configured.");
    }

    const recovery = await this.settlementService.recoverUnresolvableRound(round.id, reason);
    const cancelledRound = await this.gameRepository.findRoundById(round.id);

    if (recovery.recovered && cancelledRound) {
      const payload = {
        ...this.buildRoundPayload(cancelledRound),
        reason,
        refundedBetCount: recovery.refunds.length,
      };
      publishGameEvent("round:cancelled", payload);
      publishGameEvent("round:update", payload);
      publishGameEvent("round:state", payload);
      await clearRoundSeedReveal(round.id);
    }

    return this.createNextRound();
  }

  private async getSeedReveal(roundId: string) {
    const durableSeedReveal = await this.gameRepository.findDurableRoundSeedReveal(roundId);

    if (durableSeedReveal) {
      return durableSeedReveal;
    }

    const seedReveal = await readRoundSeedReveal(roundId);

    if (!seedReveal) {
      publishGameEvent("system:error", {
        code: "ROUND_SEED_REVEAL_MISSING",
        message: "Durable and cached round seed reveal are missing.",
        roundId,
      });
      throw new HttpError(500, "ROUND_SEED_REVEAL_MISSING", "Round seed reveal is missing.");
    }

    return seedReveal;
  }

  private emitTimer(round: GameRoundRecord) {
    const payload = this.buildRoundPayload(round);

    publishGameEvent("round:timer", {
      roundId: round.id,
      status: payload.round.status,
      dbStatus: round.status,
      lifecycleStatus: payload.round.lifecycleStatus,
      engineStatus: payload.round.engineStatus,
      remainingSeconds: payload.remainingSeconds,
      lockTime: round.lockTime.toISOString(),
      endTime: round.endTime.toISOString(),
      config: ROUND_ENGINE_CONFIG,
    });
    publishGameEvent("round:update", payload);
    publishGameEvent("round:state", payload);
  }

  private buildRoundPayload(round: GameRoundRecord) {
    const now = Date.now();
    const targetTime =
      round.status === RoundStatus.OPEN || round.status === RoundStatus.INIT
        ? round.lockTime.getTime()
        : round.endTime.getTime();
    const remainingSeconds = Math.max(0, Math.ceil((targetTime - now) / 1000));

    return {
      round: serializeRound(round),
      remainingSeconds,
      lockTime: round.lockTime.toISOString(),
      endTime: round.endTime.toISOString(),
      config: ROUND_ENGINE_CONFIG,
      syncedAt: new Date().toISOString(),
    };
  }
}
