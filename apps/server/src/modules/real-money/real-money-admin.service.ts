import {
  KycStatus,
  Prisma,
  RealMoneyWalletStatus,
  RealMoneyWithdrawalStatus,
  type PrismaClient,
} from "@prisma/client";

import { HttpError } from "../../common/errors/http-error.js";
import { redactSensitiveData } from "../../common/security/redact.js";
import { createdAtIdDescWhere, encodeCreatedAtIdCursor, pageInfo, type PaginationInput } from "../../common/utils/pagination.js";
import { lockWallet, moveWallet, serializable } from "./real-money.service.js";

export class RealMoneyAdminService {
  constructor(private readonly prisma: PrismaClient) {}

  async reviewKyc(adminUserId: string, userId: string, input: { status: KycStatus; jurisdiction?: string; reviewNote: string }) {
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.userKycProfile.upsert({
        where: { userId },
        update: { ...input, reviewedBy: adminUserId, reviewedAt: new Date() },
        create: { userId, ...input, reviewedBy: adminUserId, reviewedAt: new Date() },
      });
      await audit(tx, adminUserId, "REAL_MONEY_KYC_REVIEW", "USER", userId, {
        status: input.status, jurisdiction: input.jurisdiction, reviewNote: input.reviewNote,
      });
      return profile;
    }, serializable);
  }

  async setRiskControls(adminUserId: string, userId: string, input: {
    betBlocked: boolean; depositBlocked: boolean; withdrawalBlocked: boolean; reason: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.userRiskProfile.upsert({
        where: { userId },
        update: {
          realMoneyBetBlocked: input.betBlocked,
          realMoneyDepositBlocked: input.depositBlocked,
          realMoneyWithdrawalBlocked: input.withdrawalBlocked,
          realMoneyBlockReason: input.reason,
          lastUpdated: new Date(),
        },
        create: {
          userId,
          realMoneyBetBlocked: input.betBlocked,
          realMoneyDepositBlocked: input.depositBlocked,
          realMoneyWithdrawalBlocked: input.withdrawalBlocked,
          realMoneyBlockReason: input.reason,
        },
      });
      await audit(tx, adminUserId, "REAL_MONEY_RISK_CONTROLS_UPDATED", "USER", userId, input);
      return profile;
    }, serializable);
  }

  async setWalletFrozen(adminUserId: string, userId: string, input: { frozen: boolean; reason: string }) {
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.realMoneyGameWallet.upsert({
        where: { userId },
        update: { status: input.frozen ? RealMoneyWalletStatus.FROZEN : RealMoneyWalletStatus.ACTIVE },
        create: { userId, status: input.frozen ? RealMoneyWalletStatus.FROZEN : RealMoneyWalletStatus.ACTIVE },
      });
      await audit(tx, adminUserId, input.frozen ? "REAL_MONEY_WALLET_FROZEN" : "REAL_MONEY_WALLET_UNFROZEN", "USER", userId, input);
      return wallet;
    }, serializable);
  }

  async setResponsibleLimits(adminUserId: string, userId: string, input: {
    dailyDepositPaise?: number | null; dailyWithdrawalPaise?: number | null; dailyLossPaise?: number | null;
    perBetPaise?: number | null; selfExcludedUntil?: string | null; coolingOffUntil?: string | null;
  }) {
    const data = {
      dailyDepositPaise: toBigInt(input.dailyDepositPaise),
      dailyWithdrawalPaise: toBigInt(input.dailyWithdrawalPaise),
      dailyLossPaise: toBigInt(input.dailyLossPaise),
      perBetPaise: toBigInt(input.perBetPaise),
      selfExcludedUntil: toDate(input.selfExcludedUntil),
      coolingOffUntil: toDate(input.coolingOffUntil),
    };
    return this.prisma.$transaction(async (tx) => {
      const limits = await tx.responsibleGamingLimit.upsert({ where: { userId }, update: data, create: { userId, ...data } });
      await audit(tx, adminUserId, "RESPONSIBLE_GAMING_LIMITS_UPDATED", "USER", userId, {
        ...input,
      });
      return limits;
    }, serializable);
  }

  async listWithdrawals(pagination: PaginationInput) {
    const rows = await this.prisma.realMoneyWithdrawal.findMany({
      where: createdAtIdDescWhere(pagination.cursor),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pagination.limit + 1,
      include: { user: { select: { email: true } } },
    });
    const page = pageInfo(rows, pagination.limit, (row) => encodeCreatedAtIdCursor(row.createdAt, row.id));
    return {
      withdrawals: page.items.map((row) => ({
        id: row.id, userId: row.userId, userEmail: row.user.email,
        amountPaise: row.amountPaise.toString(), status: row.status,
        reviewNote: row.reviewNote, createdAt: row.createdAt.toISOString(),
      })),
      pageInfo: page.pageInfo,
    };
  }

  async listDeposits(pagination: PaginationInput) {
    const rows = await this.prisma.realMoneyDeposit.findMany({
      where: createdAtIdDescWhere(pagination.cursor),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pagination.limit + 1,
      include: { user: { select: { email: true } } },
    });
    const page = pageInfo(rows, pagination.limit, (row) => encodeCreatedAtIdCursor(row.createdAt, row.id));
    return {
      deposits: page.items.map((row) => ({
        id: row.id, userId: row.userId, userEmail: row.user.email,
        amountPaise: row.amountPaise.toString(), status: row.status,
        providerTxnId: row.providerTxnId, creditedAt: row.creditedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      pageInfo: page.pageInfo,
    };
  }

  async wallet(userId: string) {
    const wallet = await this.prisma.realMoneyGameWallet.findUnique({ where: { userId } });
    return wallet ? {
      userId, availablePaise: wallet.availablePaise.toString(), lockedPaise: wallet.lockedPaise.toString(),
      totalPaise: (wallet.availablePaise + wallet.lockedPaise).toString(), status: wallet.status,
      ledgerVersion: wallet.ledgerVersion.toString(), updatedAt: wallet.updatedAt.toISOString(),
    } : null;
  }

  async decideWithdrawal(adminUserId: string, withdrawalId: string, input: {
    action: "APPROVE" | "REJECT" | "MARK_PAID"; note: string; idempotencyKey: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const replay = await tx.auditLog.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (replay) return { idempotent: true };
      const withdrawal = await tx.realMoneyWithdrawal.findUnique({ where: { id: withdrawalId } });
      if (!withdrawal) throw new HttpError(404, "WITHDRAWAL_NOT_FOUND", "Withdrawal request was not found.");
      const wallet = await lockWallet(tx, withdrawal.userId);
      let nextStatus: RealMoneyWithdrawalStatus;
      if (input.action === "APPROVE") {
        if (withdrawal.status !== RealMoneyWithdrawalStatus.REQUESTED) throw invalidTransition();
        nextStatus = RealMoneyWithdrawalStatus.APPROVED;
      } else if (input.action === "REJECT") {
        if (withdrawal.status !== RealMoneyWithdrawalStatus.REQUESTED && withdrawal.status !== RealMoneyWithdrawalStatus.APPROVED) throw invalidTransition();
        nextStatus = RealMoneyWithdrawalStatus.REJECTED;
        await moveWallet(tx, wallet, {
          userId: withdrawal.userId, type: "WITHDRAWAL_REJECTED_RELEASE", amount: withdrawal.amountPaise,
          availableDelta: withdrawal.amountPaise, lockedDelta: -withdrawal.amountPaise,
          idempotencyKey: `real-money-withdrawal:${withdrawal.id}:reject`, referenceType: "WITHDRAWAL", referenceId: withdrawal.id,
        });
      } else {
        if (withdrawal.status !== RealMoneyWithdrawalStatus.APPROVED) throw invalidTransition();
        nextStatus = RealMoneyWithdrawalStatus.PAID;
        await moveWallet(tx, wallet, {
          userId: withdrawal.userId, type: "WITHDRAWAL_PAID", amount: withdrawal.amountPaise,
          availableDelta: 0n, lockedDelta: -withdrawal.amountPaise,
          idempotencyKey: `real-money-withdrawal:${withdrawal.id}:paid`, referenceType: "WITHDRAWAL", referenceId: withdrawal.id,
        });
      }
      const updated = await tx.realMoneyWithdrawal.update({
        where: { id: withdrawal.id },
        data: {
          status: nextStatus, reviewNote: input.note, reviewedBy: adminUserId, reviewedAt: new Date(),
          ...(nextStatus === RealMoneyWithdrawalStatus.PAID ? { paidAt: new Date() } : {}),
        },
      });
      await audit(tx, adminUserId, `REAL_MONEY_WITHDRAWAL_${input.action}`, "WITHDRAWAL", withdrawal.id, {
        userId: withdrawal.userId, amountPaise: withdrawal.amountPaise.toString(), note: input.note,
      }, input.idempotencyKey);
      return { idempotent: false, withdrawal: { id: updated.id, status: updated.status } };
    }, serializable);
  }

  async ledger(userId: string, pagination: PaginationInput) {
    const rows = await this.prisma.realMoneyGameLedgerEntry.findMany({
      where: { userId, ...createdAtIdDescWhere(pagination.cursor) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pagination.limit + 1,
    });
    const page = pageInfo(rows, pagination.limit, (row) => encodeCreatedAtIdCursor(row.createdAt, row.id));
    return { entries: page.items.map((row) => ({ ...row, amountPaise: row.amountPaise.toString(), availableBeforePaise: row.availableBeforePaise.toString(), availableAfterPaise: row.availableAfterPaise.toString(), lockedBeforePaise: row.lockedBeforePaise.toString(), lockedAfterPaise: row.lockedAfterPaise.toString() })), pageInfo: page.pageInfo };
  }

  async settlementAlerts() {
    return this.prisma.realMoneyRoundSettlement.findMany({ where: { status: "FAILED" }, orderBy: { createdAt: "desc" }, take: 100 });
  }
}

function invalidTransition() {
  return new HttpError(409, "WITHDRAWAL_STATE_CONFLICT", "Withdrawal cannot transition from its current state.");
}
function toBigInt(value?: number | null) { return value === undefined ? undefined : value === null ? null : BigInt(value); }
function toDate(value?: string | null) { return value === undefined ? undefined : value === null ? null : new Date(value); }

function audit(
  tx: Prisma.TransactionClient,
  adminUserId: string,
  actionType: string,
  targetType: string,
  targetId: string,
  metadata: Prisma.InputJsonValue,
  idempotencyKey?: string,
) {
  return tx.auditLog.create({
    data: {
      adminUserId, actionType, targetType, targetId, idempotencyKey,
      metadata: redactSensitiveData(metadata) as Prisma.InputJsonValue,
    },
  });
}
