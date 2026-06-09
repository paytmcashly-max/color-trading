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
    const bet = await this.reservePendingBet(userId, dto);

    try {
      const walletResult = await this.walletService.debitCoins({
        userId,
        amountCoins: dto.coinsStaked,
        referenceId: bet.id,
        idempotencyKey: `bet:${bet.id}:debit:${dto.idempotencyKey}`,
      });

      publishGameEvent("bet:placed", {
        bet: serializeBet(bet),
      });
      publishGameEvent("wallet:update", {
        userId,
        wallet: "wallet" in walletResult ? walletResult.wallet : undefined,
        ledgerEntry: walletResult.ledgerEntry,
      });

      return {
        bet: serializeBet(bet),
        wallet: "wallet" in walletResult ? walletResult.wallet : undefined,
        ledgerEntry: walletResult.ledgerEntry,
      };
    } catch (error) {
      await this.gameRepository.updateBetStatus(bet.id, "CANCELLED");
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
            "Bets are accepted only while the round is OPEN.",
          );
        }

        return this.gameRepository.createPendingBet(tx, {
          userId,
          roundId: dto.roundId,
          choice: dto.choice,
          coinsStaked: BigInt(dto.coinsStaked),
        });
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new HttpError(409, "DUPLICATE_BET", "User already placed a bet for this round.");
      }

      throw error;
    }
  }
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
