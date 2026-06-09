import { Prisma } from "@prisma/client";

import { HttpError } from "../../../common/errors/http-error.js";
import { publishGameEvent } from "../game.events.js";
import { serializeBet } from "../game.serializer.js";
import type { GameRepository } from "../repositories/game.repository.js";
import type { WalletService } from "../../wallet/wallet.service.js";
import type { PlaceBetDto } from "../dto/place-bet.dto.js";

export class BetService {
  constructor(
    private readonly gameRepository: GameRepository,
    private readonly walletService: WalletService,
  ) {}

  async placeBet(userId: string, dto: PlaceBetDto) {
    const reservation = await this.reservePendingBet(userId, dto);
    const { bet } = reservation;

    try {
      const walletResult = await this.walletService.debitCoins({
        userId,
        amountCoins: dto.coinsStaked,
        referenceId: bet.id,
        idempotencyKey: `bet:${bet.id}:debit:${dto.idempotencyKey}`,
      });
      const wallet = await this.resolveWalletSnapshot(userId, walletResult);

      if (reservation.created) {
        publishGameEvent("bet:placed", {
          bet: serializeBet(bet),
        });
      }

      return {
        bet: serializeBet(bet),
        wallet,
        ledgerEntry: walletResult.ledgerEntry,
      };
    } catch (error) {
      if (reservation.created) {
        await this.gameRepository.deletePendingBet(bet.id);
      }
      throw error;
    }
  }

  private async reservePendingBet(userId: string, dto: PlaceBetDto) {
    try {
      return await this.gameRepository.transaction(async (tx) => {
        const round = await this.gameRepository.lockOpenRoundForBet(tx, dto.roundId);

        if (!round) {
          throw new HttpError(
            409,
            "ROUND_NOT_OPEN",
            "Bets are accepted only while the round phase is BETTING_OPEN.",
          );
        }

        const bet = await this.gameRepository.createPendingBet(tx, {
          userId,
          roundId: dto.roundId,
          choice: dto.choice,
          coinsStaked: BigInt(dto.coinsStaked),
          idempotencyKey: dto.idempotencyKey,
        });

        return { bet, created: true } as const;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return this.handleDuplicateBet(userId, dto);
      }

      throw error;
    }
  }

  private async handleDuplicateBet(userId: string, dto: PlaceBetDto) {
    const idempotentBet = await this.gameRepository.findBetByIdempotencyKey(dto.idempotencyKey);

    if (this.isSameBet(idempotentBet, userId, dto)) {
      return { bet: idempotentBet!, created: false } as const;
    }

    throw new HttpError(409, "DUPLICATE_BET", "User already placed a bet for this round.");
  }

  private isSameBet(
    bet: Awaited<ReturnType<GameRepository["findBetByIdempotencyKey"]>>,
    userId: string,
    dto: PlaceBetDto,
  ) {
    return (
      Boolean(bet) &&
      bet!.userId === userId &&
      bet!.roundId === dto.roundId &&
      bet!.choice === dto.choice &&
      bet!.coinsStaked === BigInt(dto.coinsStaked)
    );
  }

  private async resolveWalletSnapshot(
    userId: string,
    walletResult: Awaited<ReturnType<WalletService["debitCoins"]>>,
  ) {
    if ("wallet" in walletResult) {
      return walletResult.wallet;
    }

    return (await this.walletService.getWalletBalance(userId)).wallet;
  }
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
