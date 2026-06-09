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
    const replay = await this.findIdempotentReplay(userId, dto);

    if (replay) {
      return replay;
    }

    const result = await this.createBetAndDebitWallet(userId, dto);

    if ("ledgerEntry" in result) {
      publishGameEvent("bet:placed", {
        bet: result.bet,
      });
      this.walletService.publishWalletUpdate(userId, result.wallet, result.ledgerEntry);
    }

    return {
      bet: result.bet,
      wallet: result.wallet,
      ...("ledgerEntry" in result ? { ledgerEntry: result.ledgerEntry } : {}),
      ...("idempotentReplay" in result ? { idempotentReplay: result.idempotentReplay } : {}),
    };
  }

  private async createBetAndDebitWallet(userId: string, dto: PlaceBetDto) {
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

        const walletResult = await this.walletService.debitCoinsInTransaction(tx, {
          userId,
          amountCoins: dto.coinsStaked,
          referenceId: bet.id,
          idempotencyKey: `bet:${bet.id}:debit:${dto.idempotencyKey}`,
        });

        const wallet =
          "wallet" in walletResult && walletResult.wallet
            ? walletResult.wallet
            : (await this.walletService.getWalletBalance(userId)).wallet;

        return {
          bet: serializeBet(bet),
          wallet,
          ledgerEntry: walletResult.ledgerEntry,
          created: true,
        };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return this.handleDuplicateBet(userId, dto);
      }

      throw error;
    }
  }

  private async findIdempotentReplay(userId: string, dto: PlaceBetDto) {
    const existingBet = await this.gameRepository.findBetByIdempotencyKey(dto.idempotencyKey);

    if (!existingBet) {
      return null;
    }

    if (!this.isSameBet(existingBet, userId, dto)) {
      throw new HttpError(
        409,
        "IDEMPOTENCY_KEY_CONFLICT",
        "Idempotency key was already used for a different bet.",
      );
    }

    return {
      bet: serializeBet(existingBet),
      wallet: (await this.walletService.getWalletBalance(userId)).wallet,
      idempotentReplay: true,
      created: false,
    };
  }

  private async handleDuplicateBet(userId: string, dto: PlaceBetDto) {
    const idempotentBet = await this.gameRepository.findBetByIdempotencyKey(dto.idempotencyKey);

    if (this.isSameBet(idempotentBet, userId, dto)) {
      return {
        bet: serializeBet(idempotentBet!),
        wallet: (await this.walletService.getWalletBalance(userId)).wallet,
        idempotentReplay: true,
        created: false,
      };
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

}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
