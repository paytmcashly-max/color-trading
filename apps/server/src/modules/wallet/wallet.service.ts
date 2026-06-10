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
import { publishRealtimeEvent } from "../../sockets/socket.events.js";
import type { WalletRepository, LedgerRecord, LockedWallet } from "./wallet.repository.js";
import { serializeLedgerEntry, serializeWallet, serializeWalletTransaction } from "./wallet.serializer.js";

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

type TxClient = Prisma.TransactionClient;

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

  debitCoinsInTransaction(tx: TxClient, input: LedgerMutationInput) {
    return this.applyLedgerMovementInTransaction(tx, {
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

  refundCancelledBetInTransaction(tx: TxClient, input: LedgerMutationInput) {
    return this.applyLedgerMovementInTransaction(tx, {
      ...input,
      type: CoinLedgerType.ADMIN_ADJUSTMENT,
      direction: CoinLedgerDirection.CREDIT,
      referenceType: LedgerReferenceType.BET,
    });
  }

  async getLedgerHistory(userId: string) {
    const entries = await this.walletRepository.getLedgerHistory(userId);

    return {
      entries: entries.map(serializeLedgerEntry),
    };
  }

  async getTransactionHistory(userId: string) {
    const entries = await this.walletRepository.getLedgerHistory(userId);

    return {
      transactions: entries.map(serializeWalletTransaction),
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
        const currentTotalBalance = wallet.depositBalance + wallet.winningBalance;
        const nextBalances = this.calculateNextBalances(wallet, amountCoins, input);
        const nextTotalBalance = nextBalances.depositBalance + nextBalances.winningBalance;

        if (nextBalances.insufficientFunds) {
          const ledgerEntry = await this.walletRepository.createLedgerEntry(tx, {
            userId: input.userId,
            walletId: wallet.id,
            type: input.type,
            direction: input.direction,
            amountCoins,
            balanceBeforeCoins: currentTotalBalance,
            balanceAfterCoins: currentTotalBalance,
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
          balanceBeforeCoins: currentTotalBalance,
          balanceAfterCoins: nextTotalBalance,
          idempotencyKey: input.idempotencyKey,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          status: CoinLedgerStatus.SUCCESS,
          metadata: this.buildLedgerMetadata(wallet, nextBalances, currentTotalBalance, nextTotalBalance),
        });

        const updatedWallet = await this.walletRepository.updateWalletSnapshot(
          tx,
          wallet.id,
          {
            depositBalance: nextBalances.depositBalance,
            winningBalance: nextBalances.winningBalance,
          },
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
        nextDepositBalance: result.wallet.depositBalance,
        nextWinningBalance: result.wallet.winningBalance,
        nextTotalBalance: result.wallet.depositBalance + result.wallet.winningBalance,
      });

      const response = {
        idempotentReplay: false,
        wallet: serializeWallet(result.wallet),
        ledgerEntry: serializeLedgerEntry(result.ledgerEntry),
      };

      this.publishWalletUpdate(input.userId, response.wallet, response.ledgerEntry);

      return response;
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

  async applyLedgerMovementInTransaction(tx: TxClient, input: MovementInput) {
    this.assertValidAmount(input.amountCoins);

    const existingLedger = await this.walletRepository.findLedgerByIdempotencyKeyInTx(
      tx,
      input.idempotencyKey,
    );

    if (existingLedger) {
      this.assertIdempotentReplay(existingLedger, input);
      this.assertReplayWasSuccessful(existingLedger);

      return {
        idempotentReplay: true,
        ledgerEntry: serializeLedgerEntry(existingLedger),
      };
    }

    const wallet = await this.walletRepository.ensureWalletForUser(tx, input.userId);
    this.assertWalletCanTransact(wallet);

    const amountCoins = BigInt(input.amountCoins);
    const currentTotalBalance = wallet.depositBalance + wallet.winningBalance;
    const nextBalances = this.calculateNextBalances(wallet, amountCoins, input);
    const nextTotalBalance = nextBalances.depositBalance + nextBalances.winningBalance;

    if (nextBalances.insufficientFunds) {
      await this.walletRepository.createLedgerEntry(tx, {
        userId: input.userId,
        walletId: wallet.id,
        type: input.type,
        direction: input.direction,
        amountCoins,
        balanceBeforeCoins: currentTotalBalance,
        balanceAfterCoins: currentTotalBalance,
        idempotencyKey: input.idempotencyKey,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        status: CoinLedgerStatus.FAILED,
        metadata: {
          reason: "INSUFFICIENT_FUNDS",
        },
      });

      throw new HttpError(409, "INSUFFICIENT_FUNDS", "Wallet balance is too low.");
    }

    const ledgerEntry = await this.walletRepository.createLedgerEntry(tx, {
      userId: input.userId,
      walletId: wallet.id,
      type: input.type,
      direction: input.direction,
      amountCoins,
      balanceBeforeCoins: currentTotalBalance,
      balanceAfterCoins: nextTotalBalance,
      idempotencyKey: input.idempotencyKey,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      status: CoinLedgerStatus.SUCCESS,
      metadata: this.buildLedgerMetadata(wallet, nextBalances, currentTotalBalance, nextTotalBalance),
    });

    const updatedWallet = await this.walletRepository.updateWalletSnapshot(
      tx,
      wallet.id,
      {
        depositBalance: nextBalances.depositBalance,
        winningBalance: nextBalances.winningBalance,
      },
    );

    return {
      idempotentReplay: false,
      wallet: serializeWallet(updatedWallet),
      ledgerEntry: serializeLedgerEntry(ledgerEntry),
    };
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

  private calculateNextBalances(
    wallet: LockedWallet,
    amountCoins: bigint,
    input: MovementInput,
  ) {
    if (input.direction === CoinLedgerDirection.CREDIT) {
      if (input.type === CoinLedgerType.BET_WIN_CREDIT) {
        return {
          depositBalance: wallet.depositBalance,
          winningBalance: wallet.winningBalance + amountCoins,
          insufficientFunds: false,
        } as const;
      }

      return {
        depositBalance: wallet.depositBalance + amountCoins,
        winningBalance: wallet.winningBalance,
        insufficientFunds: false,
      } as const;
    }

    if (input.type === CoinLedgerType.ADMIN_ADJUSTMENT) {
      const nextDepositBalance = wallet.depositBalance - amountCoins;

      return {
        depositBalance: nextDepositBalance,
        winningBalance: wallet.winningBalance,
        insufficientFunds: nextDepositBalance < 0n,
      } as const;
    }

    const depositDebit = amountCoins <= wallet.depositBalance ? amountCoins : wallet.depositBalance;
    const remainingDebit = amountCoins - depositDebit;
    const nextWinningBalance = wallet.winningBalance - remainingDebit;

    return {
      depositBalance: wallet.depositBalance - depositDebit,
      winningBalance: nextWinningBalance,
      insufficientFunds: nextWinningBalance < 0n,
    } as const;
  }

  private buildLedgerMetadata(
    wallet: LockedWallet,
    nextBalances: { depositBalance: bigint; winningBalance: bigint },
    previousTotalBalance: bigint,
    nextTotalBalance: bigint,
  ) {
    return {
      previousDepositBalance: wallet.depositBalance.toString(),
      previousWinningBalance: wallet.winningBalance.toString(),
      previousTotalBalance: previousTotalBalance.toString(),
      nextDepositBalance: nextBalances.depositBalance.toString(),
      nextWinningBalance: nextBalances.winningBalance.toString(),
      nextTotalBalance: nextTotalBalance.toString(),
      depositDelta: (nextBalances.depositBalance - wallet.depositBalance).toString(),
      winningDelta: (nextBalances.winningBalance - wallet.winningBalance).toString(),
    };
  }

  publishWalletUpdate(
    userId: string,
    wallet: ReturnType<typeof serializeWallet>,
    ledgerEntry: ReturnType<typeof serializeLedgerEntry>,
  ) {
    publishRealtimeEvent("wallet:update", {
      userId,
      wallet,
      ledgerEntry,
    });
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
