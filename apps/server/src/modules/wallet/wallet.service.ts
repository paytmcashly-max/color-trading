import {
  CoinLedgerDirection,
  CoinLedgerStatus,
  CoinLedgerType,
  LedgerReferenceType,
  Prisma,
  WalletStatus,
} from "@prisma/client";

import { HttpError } from "../../common/errors/http-error.js";
import { hashToken } from "../../common/utils/token-hash.js";
import { logger } from "../../common/utils/logger.js";
import type { WalletRepository, LedgerRecord, LockedWallet } from "./wallet.repository.js";
import { serializeLedgerEntry, serializeWallet } from "./wallet.serializer.js";

interface LedgerMutationInput {
  userId: string;
  amountCoins: number;
  referenceId: string;
  idempotencyKey: string;
}

interface MovementInput extends LedgerMutationInput {
  type: CoinLedgerType;
  direction: CoinLedgerDirection;
  referenceType: LedgerReferenceType;
}

export class WalletService {
  constructor(private readonly walletRepository: WalletRepository) {}

  async getWalletBalance(userId: string) {
    const wallet =
      (await this.walletRepository.findWalletByUserId(userId)) ??
      (await this.walletRepository.transaction((tx) =>
        this.walletRepository.ensureWalletForUser(tx, userId),
      ));

    return {
      wallet: serializeWallet(wallet),
    };
  }

  creditCoins(input: LedgerMutationInput) {
    return this.applyLedgerMovement({
      ...input,
      type: CoinLedgerType.BONUS_CREDIT,
      direction: CoinLedgerDirection.CREDIT,
      referenceType: LedgerReferenceType.ADMIN_ACTION,
    });
  }

  debitCoins(input: LedgerMutationInput) {
    return this.applyLedgerMovement({
      ...input,
      type: CoinLedgerType.BET_DEBIT,
      direction: CoinLedgerDirection.DEBIT,
      referenceType: LedgerReferenceType.BET,
    });
  }

  creditBetWinnings(input: LedgerMutationInput) {
    return this.applyLedgerMovement({
      ...input,
      type: CoinLedgerType.BET_WIN_CREDIT,
      direction: CoinLedgerDirection.CREDIT,
      referenceType: LedgerReferenceType.ROUND,
    });
  }

  adminAdjustCoins(input: LedgerMutationInput & { direction: CoinLedgerDirection }) {
    return this.applyLedgerMovement({
      ...input,
      type: CoinLedgerType.ADMIN_ADJUSTMENT,
      referenceType: LedgerReferenceType.ADMIN_ACTION,
    });
  }

  async getLedgerHistory(userId: string) {
    const entries = await this.walletRepository.getLedgerHistory(userId);

    return {
      entries: entries.map(serializeLedgerEntry),
    };
  }

  private async applyLedgerMovement(input: MovementInput) {
    this.assertValidAmount(input.amountCoins);

    const existingLedger = await this.walletRepository.findLedgerByIdempotencyKey(
      input.idempotencyKey,
    );

    if (existingLedger) {
      this.assertIdempotentReplay(existingLedger, input);
      this.assertReplayWasSuccessful(existingLedger);
      this.logLedgerMovement("wallet_ledger_idempotent_replay", input, {
        ledgerEntryId: existingLedger.id,
      });

      return {
        idempotentReplay: true,
        ledgerEntry: serializeLedgerEntry(existingLedger),
      };
    }

    try {
      const result = await this.walletRepository.transaction(async (tx) => {
        const wallet = await this.walletRepository.ensureWalletForUser(tx, input.userId);
        this.assertWalletCanTransact(wallet);

        const amountCoins = BigInt(input.amountCoins);
        const nextBalance = this.calculateNextBalance(
          wallet.balanceCoins,
          amountCoins,
          input.direction,
        );

        if (nextBalance < 0n) {
          const ledgerEntry = await this.walletRepository.createLedgerEntry(tx, {
            userId: input.userId,
            walletId: wallet.id,
            type: input.type,
            direction: input.direction,
            amountCoins,
            balanceAfterCoins: wallet.balanceCoins,
            idempotencyKey: input.idempotencyKey,
            referenceType: input.referenceType,
            referenceId: input.referenceId,
            status: CoinLedgerStatus.FAILED,
            metadata: {
              reason: "INSUFFICIENT_FUNDS",
            },
          });

          return {
            insufficientFunds: true,
            ledgerEntry,
          } as const;
        }

        const ledgerEntry = await this.walletRepository.createLedgerEntry(tx, {
          userId: input.userId,
          walletId: wallet.id,
          type: input.type,
          direction: input.direction,
          amountCoins,
          balanceAfterCoins: nextBalance,
          idempotencyKey: input.idempotencyKey,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          status: CoinLedgerStatus.SUCCESS,
        });

        const updatedWallet = await this.walletRepository.updateWalletSnapshot(
          tx,
          wallet.id,
          nextBalance,
        );

        return {
          insufficientFunds: false,
          wallet: updatedWallet,
          ledgerEntry,
        } as const;
      });

      if (result.insufficientFunds) {
        this.logLedgerMovement("wallet_ledger_failed", input, {
          reason: "INSUFFICIENT_FUNDS",
          ledgerEntryId: result.ledgerEntry.id,
        });
        throw new HttpError(409, "INSUFFICIENT_FUNDS", "Wallet balance is too low.");
      }

      this.logLedgerMovement("wallet_ledger_success", input, {
        ledgerEntryId: result.ledgerEntry.id,
        walletId: result.wallet.id,
        nextBalanceCoins: result.wallet.balanceCoins,
      });

      return {
        idempotentReplay: false,
        wallet: serializeWallet(result.wallet),
        ledgerEntry: serializeLedgerEntry(result.ledgerEntry),
      };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const replay = await this.walletRepository.findLedgerByIdempotencyKeyForUser(
          input.userId,
          input.idempotencyKey,
        );

        if (replay) {
          this.assertIdempotentReplay(replay, input);
          this.assertReplayWasSuccessful(replay);
          this.logLedgerMovement("wallet_ledger_unique_conflict_replayed", input, {
            ledgerEntryId: replay.id,
          });
          return {
            idempotentReplay: true,
            ledgerEntry: serializeLedgerEntry(replay),
          };
        }
      }

      throw error;
    }
  }

  private assertValidAmount(amountCoins: number) {
    if (!Number.isSafeInteger(amountCoins) || amountCoins <= 0) {
      throw new HttpError(400, "INVALID_COIN_AMOUNT", "Coin amount must be a positive safe integer.");
    }
  }

  private assertWalletCanTransact(wallet: LockedWallet) {
    if (wallet.status !== WalletStatus.ACTIVE) {
      throw new HttpError(423, "WALLET_NOT_ACTIVE", "Wallet is not active.");
    }
  }

  private calculateNextBalance(
    currentBalance: bigint,
    amountCoins: bigint,
    direction: CoinLedgerDirection,
  ) {
    if (direction === CoinLedgerDirection.CREDIT) {
      return currentBalance + amountCoins;
    }

    return currentBalance - amountCoins;
  }

  private assertIdempotentReplay(existingLedger: LedgerRecord, input: MovementInput) {
    const matches =
      existingLedger.userId === input.userId &&
      existingLedger.type === input.type &&
      existingLedger.direction === input.direction &&
      existingLedger.amountCoins === BigInt(input.amountCoins) &&
      existingLedger.referenceId === input.referenceId &&
      existingLedger.referenceType === input.referenceType;

    if (!matches) {
      throw new HttpError(
        409,
        "IDEMPOTENCY_KEY_CONFLICT",
        "Idempotency key was already used for a different wallet operation.",
      );
    }
  }

  private assertReplayWasSuccessful(existingLedger: LedgerRecord) {
    if (existingLedger.status === CoinLedgerStatus.FAILED) {
      throw new HttpError(
        409,
        "PREVIOUS_WALLET_OPERATION_FAILED",
        "Idempotency key belongs to a failed wallet operation.",
      );
    }
  }

  private logLedgerMovement(
    message: string,
    input: MovementInput,
    metadata: Record<string, unknown> = {},
  ) {
    logger.info(message, {
      userId: input.userId,
      type: input.type,
      direction: input.direction,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      amountCoins: input.amountCoins,
      idempotencyKey: input.idempotencyKey,
      idempotencyKeyHash: hashToken(input.idempotencyKey).slice(0, 16),
      ...metadata,
    });
  }
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
