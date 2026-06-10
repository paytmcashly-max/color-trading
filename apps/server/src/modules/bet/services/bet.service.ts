import { Prisma } from "@prisma/client";

import { HttpError } from "../../../common/errors/http-error.js";
import { publishGameEvent } from "../../game/game.events.js";
import { serializeBet } from "../../game/game.serializer.js";
import type { WalletService } from "../../wallet/wallet.service.js";
import type { PlaceBetDto } from "../dto/place-bet.dto.js";
import type { BetRepositoryPort } from "../repositories/bet.repository.js";

export class BetService {
  constructor(
    private readonly betRepository: BetRepositoryPort,
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

  async getUserBets(userId: string) {
    const bets = await this.betRepository.findUserBets(userId);

    return {
      bets: bets.map(serializeBet),
    };
  }

  private async createBetAndDebitWallet(userId: string, dto: PlaceBetDto) {
    try {
      return await this.betRepository.transaction(async (tx) => {
        const round = await this.betRepository.lockOpenRoundForBet(tx, dto.roundId);

        if (!round) {
          throw new HttpError(
            409,
            "ROUND_NOT_OPEN",
            "Bets are accepted only while the round phase is BETTING.",
          );
        }

        const bet = await this.betRepository.createPendingBet(tx, {
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
        return this.handleIdempotencyConflict(userId, dto);
      }

      throw error;
    }
  }

  private async findIdempotentReplay(userId: string, dto: PlaceBetDto) {
    const existingBet = await this.betRepository.findBetByIdempotencyKey(dto.idempotencyKey);

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

  private async handleIdempotencyConflict(userId: string, dto: PlaceBetDto) {
    const existingBet = await this.betRepository.findBetByIdempotencyKey(dto.idempotencyKey);

    if (existingBet && this.isSameBet(existingBet, userId, dto)) {
      return {
        bet: serializeBet(existingBet),
        wallet: (await this.walletService.getWalletBalance(userId)).wallet,
        idempotentReplay: true,
        created: false,
      };
    }

    throw new HttpError(
      409,
      "IDEMPOTENCY_KEY_CONFLICT",
      "Idempotency key was already used for a different bet.",
    );
  }

  private isSameBet(
    bet: Awaited<ReturnType<BetRepositoryPort["findBetByIdempotencyKey"]>>,
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
