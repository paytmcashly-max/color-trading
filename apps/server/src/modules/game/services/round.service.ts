import { BetStatus, RoundStatus } from "@prisma/client";

import { HttpError } from "../../../common/errors/http-error.js";
import { getRedisClient } from "../../../database/redis.client.js";
import {
  BET_LOCK_AFTER_MS,
  ROUND_DURATION_MS,
  WIN_PAYOUT_MULTIPLIER,
  WINNER_SETTLEMENT_CONCURRENCY,
} from "../game.constants.js";
import { publishGameEvent } from "../game.events.js";
import { serializeBet, serializeRound } from "../game.serializer.js";
import type { BetRecord, GameRepository, GameRoundRecord } from "../repositories/game.repository.js";
import type { ResultService } from "./result.service.js";
import type { WalletService } from "../../wallet/wallet.service.js";

export class RoundService {
  constructor(
    private readonly gameRepository: GameRepository,
    private readonly resultService?: ResultService,
    private readonly walletService?: WalletService,
  ) {}

  async getCurrentRound() {
    const round = await this.gameRepository.findCurrentRound();

    return {
      round: round ? serializeRound(round) : null,
    };
  }

  async getRoundHistory() {
    const rounds = await this.gameRepository.findRoundHistory();

    return {
      rounds: rounds.map((round) => ({
        ...serializeRound(round),
        betCount: round._count.bets,
      })),
    };
  }

  async getUserBetHistory(userId: string) {
    const bets = await this.gameRepository.findUserBetHistory(userId);

    return {
      bets: bets.map((bet) => ({
        ...serializeBet(bet),
        round: {
          roundNumber: bet.round.roundNumber.toString(),
          status: bet.round.status,
          result: bet.round.result,
          startTime: bet.round.startTime.toISOString(),
          endTime: bet.round.endTime.toISOString(),
        },
      })),
    };
  }

  async ensureLifecycle() {
    let currentRound = await this.gameRepository.findCurrentRound();

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

    const round = await this.gameRepository.transaction(async (tx) => {
      const existingRound = await this.gameRepository.findCurrentRoundInTx(tx);

      if (existingRound) {
        return existingRound;
      }

      return this.gameRepository.createRound(tx, {
        roundNumber,
        startTime,
        lockTime,
        endTime,
        seedHash: seed.seedHash,
        seedReveal: seed.seedReveal,
      });
    });

    const redis = getRedisClient();
    if (redis) {
      await redis.set(`game:round:${round.id}:seed`, seed.seedReveal, "PX", ROUND_DURATION_MS * 2);
    }

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
    if (!this.resultService || !this.walletService) {
      throw new HttpError(500, "GAME_ENGINE_NOT_CONFIGURED", "Game engine services are not configured.");
    }

    const seedReveal = round.seedReveal ?? (await this.getSeedReveal(round.id));
    const result = round.result ?? this.resultService.generateResult(seedReveal);

    if (round.status === RoundStatus.LOCKED) {
      const updated = await this.gameRepository.updateRoundStatus(
        round.id,
        RoundStatus.LOCKED,
        RoundStatus.RESOLVING,
        {
          result,
          seedReveal,
        },
      );

      if (updated.count === 0) {
        return this.gameRepository.findRoundById(round.id);
      }
    }

    const bets = await this.gameRepository.findPendingBetsForRound(round.id);
    await this.settleBets(round.id, result, bets);

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
      publishGameEvent("round:result", {
        ...this.buildRoundPayload(completedRound),
        result,
      });
      publishGameEvent("round:update", this.buildRoundPayload(completedRound));
      publishGameEvent("round:state", this.buildRoundPayload(completedRound));
      publishGameEvent("round:completed", {
        round: serializeRound(completedRound),
      });

      return this.createNextRound();
    }

    return completedRound;
  }

  private async settleBets(roundId: string, result: string, bets: BetRecord[]) {
    for (let index = 0; index < bets.length; index += WINNER_SETTLEMENT_CONCURRENCY) {
      const batch = bets.slice(index, index + WINNER_SETTLEMENT_CONCURRENCY);
      await Promise.all(batch.map((bet) => this.settleBet(roundId, result, bet)));
    }
  }

  private async settleBet(roundId: string, result: string, bet: BetRecord) {
    if (bet.choice !== result) {
      const updatedBet = await this.gameRepository.transaction((tx) =>
        this.gameRepository.updatePendingBetStatusInTx(tx, bet.id, BetStatus.LOST),
      );

      if (!updatedBet) {
        return;
      }

      publishGameEvent("bet:settled", {
        bet: serializeBet(updatedBet),
        result,
      });
      return;
    }

    const payoutAmount = bet.coinsStaked * BigInt(WIN_PAYOUT_MULTIPLIER);

    if (payoutAmount > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new HttpError(500, "PAYOUT_TOO_LARGE", "Payout exceeds safe service limits.");
    }

    const { updatedBet, walletResult } = await this.gameRepository.transaction(async (tx) => {
      const credited = await this.walletService!.creditBetWinningsInTransaction(tx, {
        userId: bet.userId,
        amountCoins: Number(payoutAmount),
        referenceId: roundId,
        idempotencyKey: `round:${roundId}:bet:${bet.id}:win`,
      });

      const settledBet = await this.gameRepository.updatePendingBetStatusInTx(
        tx,
        bet.id,
        BetStatus.WON,
        payoutAmount,
      );

      return {
        updatedBet: settledBet,
        walletResult: credited,
      };
    });

    if (!updatedBet) {
      return;
    }

    if ("wallet" in walletResult && walletResult.wallet) {
      this.walletService!.publishWalletUpdate(bet.userId, walletResult.wallet, walletResult.ledgerEntry);
    }

    publishGameEvent("bet:settled", {
      bet: serializeBet(updatedBet),
      result,
    });
  }

  private async getSeedReveal(roundId: string) {
    const redis = getRedisClient();
    const seedReveal = redis ? await redis.get(`game:round:${roundId}:seed`) : null;

    if (!seedReveal) {
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
      remainingSeconds: payload.remainingSeconds,
      lockTime: round.lockTime.toISOString(),
      endTime: round.endTime.toISOString(),
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
      syncedAt: new Date().toISOString(),
    };
  }
}
