import { BetStatus, type PredictionColor, type Prisma } from "@prisma/client";

import { HttpError } from "../../../common/errors/http-error.js";
import { logger } from "../../../common/utils/logger.js";
import { getObservability } from "../../observability/observability.module.js";
import type { WalletService } from "../../wallet/wallet.service.js";
import { WIN_PAYOUT_MULTIPLIER, WINNER_SETTLEMENT_CONCURRENCY } from "../game.constants.js";
import { publishGameEvent } from "../game.events.js";
import { serializeSettledBet } from "../game.serializer.js";
import type {
  GameRepository,
  SettlementStatsRow,
  WinnerPayoutRow,
} from "../repositories/game.repository.js";

export interface SettlementResult {
  roundId: string;
  result: PredictionColor;
  totalBets: number;
  winningBets: number;
  losingBets: number;
  totalPayoutCoins: string;
  pendingBets: number;
  creditedUsers: number;
}

const WINNER_USER_BATCH_SIZE = 250;

interface RecoveryRefund {
  bet: Awaited<ReturnType<GameRepository["findPendingBetsForRound"]>>[number];
  walletResult: Awaited<ReturnType<WalletService["refundCancelledBetInTransaction"]>>;
}

export class SettlementService {
  constructor(
    private readonly gameRepository: GameRepository,
    private readonly walletService: WalletService,
  ) {}

  async settleRound(roundId: string, result: PredictionColor): Promise<SettlementResult> {
    const startedAt = Date.now();

    const settlementState = await this.gameRepository.transaction((tx) =>
      this.gameRepository.beginRoundSettlementInTx(tx, roundId, result),
    );

    if (!settlementState || settlementState.result !== result) {
      throw new HttpError(
        409,
        "ROUND_SETTLEMENT_RESULT_CONFLICT",
        "Round settlement already exists with a different result.",
      );
    }

    if (settlementState.status === "SUCCESS") {
      const existingStats = await this.gameRepository.getRoundSettlementStats(roundId);
      return toSettlementResult(roundId, result, existingStats, 0);
    }

    const losingUpdate = await this.gameRepository.markLosingBetsForRound(roundId, result);
    const losingBets = await this.gameRepository.findLosingBetsForRound(roundId);
    for (const bet of losingBets) {
      publishGameEvent("bet:settled", {
        ...serializeSettledBet(bet, result),
      });
    }
    const creditedUsers = await this.settleWinningUsers(roundId, result);
    const stats = await this.gameRepository.getRoundSettlementStats(roundId);

    if (stats.pendingBets > 0) {
      throw new HttpError(
        409,
        "ROUND_SETTLEMENT_INCOMPLETE",
        "Round settlement still has pending bets.",
      );
    }

    await this.gameRepository.completeRoundSettlement(
      roundId,
      result,
      stats,
      {
        durationMs: Date.now() - startedAt,
        loserRowsUpdated: losingUpdate.count,
        payoutMultiplier: WIN_PAYOUT_MULTIPLIER,
        creditedUsers,
      } satisfies Prisma.InputJsonObject,
    );

    await getObservability().audit.write({
      actorId: "round-engine",
      actorType: "SYSTEM",
      action: "ROUND_SETTLEMENT_COMPLETED",
      targetType: "ROUND",
      targetId: roundId,
      metadata: {
        result,
        totalBets: stats.totalBets,
        winningBets: stats.winningBets,
        losingBets: stats.losingBets,
        totalPayoutCoins: stats.totalPayoutCoins.toString(),
        creditedUsers,
        durationMs: Date.now() - startedAt,
      },
    });

    publishGameEvent("round:settlement", {
      roundId,
      result,
      status: "SUCCESS",
      totalBets: stats.totalBets,
      winningBets: stats.winningBets,
      losingBets: stats.losingBets,
      totalPayoutCoins: stats.totalPayoutCoins.toString(),
      creditedUsers,
    });

    return toSettlementResult(roundId, result, stats, creditedUsers);
  }

  async recoverUnresolvableRound(roundId: string, reason: string) {
    const recovery = await this.gameRepository.transaction(async (tx) => {
      const cancelled = await this.gameRepository.cancelActiveRoundInTx(tx, roundId);

      if (cancelled.count === 0) {
        return { recovered: false, refunds: [] as RecoveryRefund[] };
      }

      const pendingBets = await this.gameRepository.findPendingBetsForRoundInTx(tx, roundId);
      const refunds: RecoveryRefund[] = [];

      for (const bet of pendingBets) {
        if (bet.coinsStaked > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new HttpError(500, "REFUND_TOO_LARGE", "Bet refund exceeds safe service limits.");
        }

        const walletResult = await this.walletService.refundCancelledBetInTransaction(tx, {
          userId: bet.userId,
          amountCoins: Number(bet.coinsStaked),
          referenceId: bet.id,
          idempotencyKey: `round:${roundId}:bet:${bet.id}:recovery-refund`,
        });
        await this.gameRepository.updatePendingBetStatusInTx(tx, bet.id, BetStatus.CANCELLED, 0n);
        refunds.push({ bet, walletResult });
      }

      return { recovered: true, refunds };
    });

    if (!recovery.recovered) {
      return recovery;
    }

    for (const refund of recovery.refunds) {
      if ("wallet" in refund.walletResult && refund.walletResult.wallet) {
        this.walletService.publishWalletUpdate(
          refund.bet.userId,
          refund.walletResult.wallet,
          refund.walletResult.ledgerEntry,
        );
      }
      publishGameEvent("bet:settled", serializeSettledBet(
        { ...refund.bet, status: BetStatus.CANCELLED, payoutAmount: 0n, updatedAt: new Date() },
        null,
      ));
    }

    await getObservability().audit.write({
      actorId: "round-engine",
      actorType: "SYSTEM",
      action: "ROUND_RECOVERY_CANCELLED",
      targetType: "ROUND",
      targetId: roundId,
      metadata: {
        reason,
        refundedBetCount: recovery.refunds.length,
      },
    });
    publishGameEvent("system:error", {
      code: reason,
      message: "Round was cancelled and pending bets were refunded because settlement was not recoverable.",
      roundId,
      recovered: true,
    });

    return recovery;
  }

  private async settleWinningUsers(roundId: string, result: PredictionColor) {
    let creditedUsers = 0;

    while (true) {
      const winners = await this.gameRepository.findPendingWinnerPayouts(
        roundId,
        result,
        WIN_PAYOUT_MULTIPLIER,
        WINNER_USER_BATCH_SIZE,
      );

      if (winners.length === 0) {
        return creditedUsers;
      }

      for (let index = 0; index < winners.length; index += WINNER_SETTLEMENT_CONCURRENCY) {
        const batch = winners.slice(index, index + WINNER_SETTLEMENT_CONCURRENCY);
        const results = await Promise.all(
          batch.map((winner) => this.settleWinnerUser(roundId, result, winner)),
        );
        creditedUsers += results.filter(Boolean).length;
      }
    }
  }

  private async settleWinnerUser(
    roundId: string,
    result: PredictionColor,
    winner: WinnerPayoutRow,
  ) {
    if (winner.totalPayoutCoins > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new HttpError(500, "PAYOUT_TOO_LARGE", "Payout exceeds safe service limits.");
    }

    const settlement = await this.gameRepository.transaction(async (tx) => {
      const lockedBets = await this.gameRepository.lockPendingWinnerBetsForUserInTx(
        tx,
        roundId,
        result,
        winner.userId,
      );

      if (lockedBets.length === 0) {
        return null;
      }

      const payoutAmount = lockedBets.reduce(
        (total, bet) => total + bet.coinsStaked * BigInt(WIN_PAYOUT_MULTIPLIER),
        0n,
      );

      if (payoutAmount > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new HttpError(500, "PAYOUT_TOO_LARGE", "Payout exceeds safe service limits.");
      }

      const credit = await this.walletService.creditBetWinningsInTransaction(tx, {
        userId: winner.userId,
        amountCoins: Number(payoutAmount),
        referenceId: roundId,
        idempotencyKey: `round:${roundId}:user:${winner.userId}:settlement-credit`,
      });

      const updatedBets = await this.gameRepository.markWinnerBetsSettledInTx(
        tx,
        lockedBets.map((bet) => bet.id),
        WIN_PAYOUT_MULTIPLIER,
      );

      return {
        userId: winner.userId,
        payoutAmount,
        walletResult: credit,
        bets: updatedBets.filter((bet) => bet.status === BetStatus.WON),
      };
    });

    if (!settlement) {
      return false;
    }

    if ("wallet" in settlement.walletResult && settlement.walletResult.wallet) {
      this.walletService.publishWalletUpdate(
        settlement.userId,
        settlement.walletResult.wallet,
        settlement.walletResult.ledgerEntry,
      );
    }

    for (const bet of settlement.bets) {
      publishGameEvent("bet:settled", {
        ...serializeSettledBet(bet, result),
      });
    }

    logger.info("winner_user_settled", {
      roundId,
      userId: settlement.userId,
      betCount: settlement.bets.length,
      payoutAmount: settlement.payoutAmount.toString(),
    });

    return true;
  }
}

function toSettlementResult(
  roundId: string,
  result: PredictionColor,
  stats: SettlementStatsRow,
  creditedUsers: number,
): SettlementResult {
  return {
    roundId,
    result,
    totalBets: stats.totalBets,
    winningBets: stats.winningBets,
    losingBets: stats.losingBets,
    totalPayoutCoins: stats.totalPayoutCoins.toString(),
    pendingBets: stats.pendingBets,
    creditedUsers,
  };
}
