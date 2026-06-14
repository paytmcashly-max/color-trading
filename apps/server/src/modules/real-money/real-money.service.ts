import {
  KycStatus,
  PaymentIntentPurpose,
  PredictionColor,
  Prisma,
  RealMoneyBetStatus,
  RealMoneyWalletStatus,
  RealMoneyWithdrawalStatus,
  RoundStatus,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";

import { HttpError } from "../../common/errors/http-error.js";
import {
  createdAtIdDescWhere,
  encodeCreatedAtIdCursor,
  pageInfo,
  type PaginationInput,
} from "../../common/utils/pagination.js";
import { env } from "../../config/env.js";
import type { PaymentService } from "../payments/payment.service.js";
import type {
  RealMoneyBetInput,
  RealMoneyDepositIntentInput,
  RealMoneyWithdrawalInput,
} from "./real-money.dto.js";
import { closedComplianceFlags } from "./real-money.guard.js";
import { kolkataDayBounds } from "./kolkata-day.js";

type LockedWallet = { id: string; availablePaise: bigint; lockedPaise: bigint; status: RealMoneyWalletStatus };

export class RealMoneyService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly paymentService: PaymentService,
  ) {}

  async eligibility(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { kycProfile: true, riskProfile: true, responsibleGamingLimit: true, realMoneyWallet: true },
    });
    if (!user) throw new HttpError(404, "USER_NOT_FOUND", "User was not found.");
    const reasons = closedComplianceFlags().map((flag) => `GLOBAL_${flag}`);
    if (user.status !== UserStatus.ACTIVE) reasons.push("USER_NOT_ACTIVE");
    if (user.kycProfile?.status !== KycStatus.VERIFIED) reasons.push("KYC_NOT_VERIFIED");
    if (user.riskProfile?.realMoneyBetBlocked) reasons.push("BETTING_BLOCKED");
    if (user.riskProfile?.realMoneyDepositBlocked) reasons.push("DEPOSIT_BLOCKED");
    if (user.riskProfile?.realMoneyWithdrawalBlocked) reasons.push("WITHDRAWAL_BLOCKED");
    if (user.realMoneyWallet?.status === RealMoneyWalletStatus.FROZEN) reasons.push("WALLET_FROZEN");
    if (isFuture(user.responsibleGamingLimit?.selfExcludedUntil)) reasons.push("SELF_EXCLUDED");
    if (isFuture(user.responsibleGamingLimit?.coolingOffUntil)) reasons.push("COOLING_OFF");
    return { eligible: reasons.length === 0, reasons, kycStatus: user.kycProfile?.status ?? KycStatus.NOT_SUBMITTED };
  }

  async wallet(userId: string) {
    const wallet = await this.prisma.realMoneyGameWallet.upsert({ where: { userId }, update: {}, create: { userId } });
    return serializeWallet(wallet);
  }

  async ledger(userId: string, pagination: PaginationInput) {
    const rows = await this.prisma.realMoneyGameLedgerEntry.findMany({
      where: { userId, ...createdAtIdDescWhere(pagination.cursor) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pagination.limit + 1,
    });
    const page = pageInfo(rows, pagination.limit, (row) => encodeCreatedAtIdCursor(row.createdAt, row.id));
    return { entries: page.items.map(serializeLedger), pageInfo: page.pageInfo };
  }

  async deposits(userId: string, pagination: PaginationInput) {
    const rows = await this.prisma.realMoneyDeposit.findMany({
      where: { userId, ...createdAtIdDescWhere(pagination.cursor) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pagination.limit + 1,
    });
    const page = pageInfo(rows, pagination.limit, (row) => encodeCreatedAtIdCursor(row.createdAt, row.id));
    return { deposits: page.items.map(serializeDeposit), pageInfo: page.pageInfo };
  }

  async createDepositIntent(userId: string, input: RealMoneyDepositIntentInput) {
    await this.assertActionAllowed(userId, "DEPOSIT");
    assertRange(input.amountPaise, env.MIN_REAL_MONEY_DEPOSIT_PAISE, env.MAX_REAL_MONEY_DEPOSIT_PAISE, "DEPOSIT_AMOUNT_OUT_OF_RANGE");
    await this.assertDailyLimit(userId, "DEPOSIT", input.amountPaise);
    const intent = await this.paymentService.createIntent(userId, {
      ...input,
      purpose: PaymentIntentPurpose.REAL_MONEY_GAME_DEPOSIT,
    });
    await this.prisma.realMoneyDeposit.upsert({
      where: { paymentIntentId: intent.id },
      update: {},
      create: { userId, paymentIntentId: intent.id, amountPaise: BigInt(input.amountPaise) },
    });
    return intent;
  }

  async bets(userId: string, pagination: PaginationInput) {
    const rows = await this.prisma.realMoneyBet.findMany({
      where: { userId, ...createdAtIdDescWhere(pagination.cursor) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pagination.limit + 1,
      include: { round: { select: { roundNumber: true, result: true, status: true } } },
    });
    const page = pageInfo(rows, pagination.limit, (row) => encodeCreatedAtIdCursor(row.createdAt, row.id));
    return { bets: page.items.map(serializeBet), pageInfo: page.pageInfo };
  }

  async placeBet(userId: string, input: RealMoneyBetInput) {
    await this.assertActionAllowed(userId, "BET");
    await this.assertDailyLimit(userId, "BET", input.stakePaise);
    if (input.stakePaise > env.MAX_REAL_MONEY_BET_PER_ROUND_PAISE) {
      throw new HttpError(409, "REAL_MONEY_BET_LIMIT_EXCEEDED", "Sandbox bet limit exceeded.");
    }
    const replay = await this.prisma.realMoneyBet.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (replay) {
      if (replay.userId !== userId || replay.roundId !== input.roundId || replay.choice !== input.choice || replay.stakePaise !== BigInt(input.stakePaise)) {
        throw new HttpError(409, "IDEMPOTENCY_KEY_CONFLICT", "Idempotency key was already used.");
      }
      return serializeBet(replay);
    }

    return this.prisma.$transaction(async (tx) => {
      const round = await tx.gameRound.findFirst({
        where: { id: input.roundId, status: RoundStatus.OPEN, lockTime: { gt: new Date() } },
      });
      if (!round) throw new HttpError(409, "ROUND_NOT_OPEN", "Sandbox bets are accepted only during the open phase.");
      const stake = BigInt(input.stakePaise);
      const [roundExposure, colorExposure] = await Promise.all([
        tx.realMoneyBet.aggregate({ where: { roundId: input.roundId, status: RealMoneyBetStatus.PENDING }, _sum: { stakePaise: true } }),
        tx.realMoneyBet.aggregate({ where: { roundId: input.roundId, choice: input.choice, status: RealMoneyBetStatus.PENDING }, _sum: { stakePaise: true } }),
      ]);
      if ((roundExposure._sum.stakePaise ?? 0n) + stake > BigInt(env.MAX_REAL_MONEY_EXPOSURE_PER_ROUND_PAISE)) {
        throw new HttpError(409, "REAL_MONEY_ROUND_EXPOSURE_LIMIT", "Sandbox round exposure limit reached.");
      }
      if ((colorExposure._sum.stakePaise ?? 0n) + stake > BigInt(env.MAX_REAL_MONEY_EXPOSURE_PER_COLOR_PAISE)) {
        throw new HttpError(409, "REAL_MONEY_COLOR_EXPOSURE_LIMIT", "Sandbox color exposure limit reached.");
      }
      const wallet = await lockWallet(tx, userId);
      if (wallet.status !== RealMoneyWalletStatus.ACTIVE) throw new HttpError(409, "REAL_MONEY_WALLET_FROZEN", "Sandbox wallet is not active.");
      if (wallet.availablePaise < stake) throw new HttpError(409, "INSUFFICIENT_REAL_MONEY_BALANCE", "Insufficient sandbox balance.");
      const bet = await tx.realMoneyBet.create({
        data: { userId, roundId: input.roundId, choice: input.choice, stakePaise: stake, idempotencyKey: input.idempotencyKey },
      });
      await moveWallet(tx, wallet, {
        userId, type: "BET_LOCKED", amount: stake, availableDelta: -stake, lockedDelta: stake,
        idempotencyKey: `real-money-bet:${bet.id}:lock`, referenceType: "BET", referenceId: bet.id,
      });
      return serializeBet(bet);
    }, serializable);
  }

  async withdrawals(userId: string, pagination: PaginationInput) {
    const rows = await this.prisma.realMoneyWithdrawal.findMany({
      where: { userId, ...createdAtIdDescWhere(pagination.cursor) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pagination.limit + 1,
    });
    const page = pageInfo(rows, pagination.limit, (row) => encodeCreatedAtIdCursor(row.createdAt, row.id));
    return { withdrawals: page.items.map(serializeWithdrawal), pageInfo: page.pageInfo };
  }

  async requestWithdrawal(userId: string, input: RealMoneyWithdrawalInput) {
    await this.assertActionAllowed(userId, "WITHDRAWAL");
    assertRange(input.amountPaise, env.MIN_REAL_MONEY_WITHDRAWAL_PAISE, env.MAX_REAL_MONEY_WITHDRAWAL_PAISE, "WITHDRAWAL_AMOUNT_OUT_OF_RANGE");
    await this.assertDailyLimit(userId, "WITHDRAWAL", input.amountPaise);
    const existing = await this.prisma.realMoneyWithdrawal.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return serializeWithdrawal(existing);
    return this.prisma.$transaction(async (tx) => {
      const wallet = await lockWallet(tx, userId);
      const amount = BigInt(input.amountPaise);
      if (wallet.availablePaise < amount) throw new HttpError(409, "INSUFFICIENT_REAL_MONEY_BALANCE", "Insufficient sandbox balance.");
      const withdrawal = await tx.realMoneyWithdrawal.create({ data: { userId, amountPaise: amount, idempotencyKey: input.idempotencyKey } });
      await moveWallet(tx, wallet, {
        userId, type: "WITHDRAWAL_LOCKED", amount, availableDelta: -amount, lockedDelta: amount,
        idempotencyKey: `real-money-withdrawal:${withdrawal.id}:lock`, referenceType: "WITHDRAWAL", referenceId: withdrawal.id,
      });
      return serializeWithdrawal(withdrawal);
    }, serializable);
  }

  private async assertActionAllowed(userId: string, action: "BET" | "DEPOSIT" | "WITHDRAWAL") {
    if (action === "BET") {
      const failedSettlement = await this.prisma.realMoneyRoundSettlement.findFirst({ where: { status: "FAILED" }, select: { id: true } });
      if (failedSettlement) throw new HttpError(503, "REAL_MONEY_BETTING_PAUSED", "Sandbox betting is paused pending settlement review.");
    }
    const eligibility = await this.eligibility(userId);
    const actionReason = action === "BET" ? "BETTING_BLOCKED" : `${action}_BLOCKED`;
    const unrelatedActionBlocks = new Set(["BETTING_BLOCKED", "DEPOSIT_BLOCKED", "WITHDRAWAL_BLOCKED"]);
    const blockingReasons = eligibility.reasons.filter((reason) => !unrelatedActionBlocks.has(reason) || reason === actionReason);
    if (blockingReasons.length > 0) {
      throw new HttpError(403, "REAL_MONEY_INELIGIBLE", "Account is not eligible for this sandbox operation.");
    }
  }

  private async assertDailyLimit(userId: string, action: "BET" | "DEPOSIT" | "WITHDRAWAL", amount: number) {
    const limits = await this.prisma.responsibleGamingLimit.findUnique({ where: { userId } });
    const { start, end } = kolkataDayBounds();
    if (action === "DEPOSIT") {
      const total = await this.prisma.realMoneyDeposit.aggregate({
        where: { userId, createdAt: { gte: start, lt: end }, status: { not: "FAILED" } },
        _sum: { amountPaise: true },
      });
      const limit = limits?.dailyDepositPaise ?? BigInt(env.MAX_REAL_MONEY_DEPOSIT_PAISE);
      if ((total._sum.amountPaise ?? 0n) + BigInt(amount) > limit) throw dailyLimit();
    } else if (action === "WITHDRAWAL") {
      const total = await this.prisma.realMoneyWithdrawal.aggregate({
        where: { userId, createdAt: { gte: start, lt: end }, status: { notIn: ["REJECTED", "CANCELLED"] } },
        _sum: { amountPaise: true },
      });
      const limit = limits?.dailyWithdrawalPaise ?? BigInt(env.MAX_REAL_MONEY_WITHDRAWAL_PAISE);
      if ((total._sum.amountPaise ?? 0n) + BigInt(amount) > limit) throw dailyLimit();
    } else {
      if (limits?.perBetPaise && BigInt(amount) > limits.perBetPaise) throw dailyLimit();
      const losses = await this.prisma.realMoneyBet.aggregate({
        where: { userId, settledAt: { gte: start, lt: end }, status: "LOST" },
        _sum: { stakePaise: true },
      });
      const limit = limits?.dailyLossPaise ?? BigInt(env.DAILY_REAL_MONEY_LOSS_LIMIT_PAISE);
      if ((losses._sum.stakePaise ?? 0n) >= limit) throw dailyLimit();
    }
  }
}

export const serializable = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 20_000 } as const;

export async function lockWallet(tx: Prisma.TransactionClient, userId: string) {
  await tx.realMoneyGameWallet.upsert({ where: { userId }, update: {}, create: { userId } });
  const rows = await tx.$queryRaw<LockedWallet[]>`
    SELECT id, available_paise AS "availablePaise", locked_paise AS "lockedPaise", status
    FROM real_money_game_wallets WHERE user_id = CAST(${userId} AS uuid) FOR UPDATE
  `;
  if (!rows[0]) throw new Error("Real-money wallet could not be locked.");
  return rows[0];
}

export async function moveWallet(
  tx: Prisma.TransactionClient,
  wallet: LockedWallet,
  input: {
    userId: string; type: Parameters<typeof tx.realMoneyGameLedgerEntry.create>[0]["data"]["type"];
    amount: bigint; availableDelta: bigint; lockedDelta: bigint; idempotencyKey: string; referenceType: string; referenceId: string;
  },
) {
  const availableAfter = wallet.availablePaise + input.availableDelta;
  const lockedAfter = wallet.lockedPaise + input.lockedDelta;
  if (availableAfter < 0n || lockedAfter < 0n) throw new HttpError(409, "REAL_MONEY_BALANCE_CONFLICT", "Sandbox balance operation is invalid.");
  const ledger = await tx.realMoneyGameLedgerEntry.create({
    data: {
      walletId: wallet.id, userId: input.userId, type: input.type, amountPaise: input.amount,
      availableBeforePaise: wallet.availablePaise, availableAfterPaise: availableAfter,
      lockedBeforePaise: wallet.lockedPaise, lockedAfterPaise: lockedAfter,
      idempotencyKey: input.idempotencyKey, referenceType: input.referenceType, referenceId: input.referenceId,
    },
  });
  await tx.realMoneyGameWallet.update({
    where: { id: wallet.id },
    data: { availablePaise: availableAfter, lockedPaise: lockedAfter, ledgerVersion: { increment: 1 } },
  });
  wallet.availablePaise = availableAfter;
  wallet.lockedPaise = lockedAfter;
  return ledger;
}

function assertRange(amount: number, min: number, max: number, code: string) {
  if (amount < min || amount > max) throw new HttpError(400, code, "Amount is outside the configured sandbox range.");
}
function dailyLimit() { return new HttpError(409, "RESPONSIBLE_GAMING_LIMIT_REACHED", "Daily sandbox limit has been reached."); }
function isFuture(value?: Date | null) { return Boolean(value && value > new Date()); }
function serializeWallet(wallet: { availablePaise: bigint; lockedPaise: bigint; status: RealMoneyWalletStatus; ledgerVersion: bigint; updatedAt: Date }) {
  return { availablePaise: wallet.availablePaise.toString(), lockedPaise: wallet.lockedPaise.toString(), totalPaise: (wallet.availablePaise + wallet.lockedPaise).toString(), status: wallet.status, ledgerVersion: wallet.ledgerVersion.toString(), updatedAt: wallet.updatedAt.toISOString() };
}
function serializeLedger(row: { id: string; type: string; amountPaise: bigint; availableAfterPaise: bigint; lockedAfterPaise: bigint; referenceType: string; referenceId: string; createdAt: Date }) {
  return { ...row, amountPaise: row.amountPaise.toString(), availableAfterPaise: row.availableAfterPaise.toString(), lockedAfterPaise: row.lockedAfterPaise.toString(), createdAt: row.createdAt.toISOString() };
}
function serializeDeposit(row: { id: string; amountPaise: bigint; status: string; creditedAt: Date | null; createdAt: Date }) {
  return { id: row.id, amountPaise: row.amountPaise.toString(), status: row.status, creditedAt: row.creditedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() };
}
function serializeBet(row: { id: string; roundId: string; choice: PredictionColor; stakePaise: bigint; payoutPaise: bigint; status: RealMoneyBetStatus; settledAt: Date | null; createdAt: Date; round?: { roundNumber: bigint; result: PredictionColor | null; status: RoundStatus } }) {
  return { id: row.id, roundId: row.roundId, roundNumber: row.round?.roundNumber.toString(), choice: row.choice, result: row.round?.result ?? null, stakePaise: row.stakePaise.toString(), payoutPaise: row.payoutPaise.toString(), status: row.status, settledAt: row.settledAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() };
}
function serializeWithdrawal(row: { id: string; amountPaise: bigint; status: RealMoneyWithdrawalStatus; reviewNote: string | null; paidAt: Date | null; createdAt: Date }) {
  return { id: row.id, amountPaise: row.amountPaise.toString(), status: row.status, reviewNote: row.reviewNote, paidAt: row.paidAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() };
}
