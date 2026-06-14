import type { PredictionColor, PrismaClient } from "@prisma/client";

import { logger } from "../../common/utils/logger.js";
import { env } from "../../config/env.js";
import { getObservability } from "../observability/observability.module.js";
import { lockWallet, moveWallet, serializable } from "./real-money.service.js";

export class RealMoneySettlementService {
  constructor(private readonly prisma: PrismaClient) {}

  async settleRound(roundId: string, result: PredictionColor) {
    if (!env.REAL_MONEY_ENABLED) return { status: "DISABLED" as const };
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.realMoneyRoundSettlement.findUnique({ where: { roundId } });
        if (existing?.status === "SUCCESS") return { status: "SUCCESS" as const, idempotent: true };
        if (existing && existing.result !== result) throw new Error("REAL_MONEY_SETTLEMENT_RESULT_CONFLICT");
        await tx.realMoneyRoundSettlement.upsert({
          where: { roundId },
          update: { status: "PENDING", failureReason: null },
          create: { roundId, result },
        });
        const bets = await tx.realMoneyBet.findMany({ where: { roundId, status: "PENDING" }, orderBy: { id: "asc" } });
        let totalPayout = 0n;
        for (const bet of bets) {
          const wallet = await lockWallet(tx, bet.userId);
          const won = bet.choice === result;
          const payout = won ? bet.stakePaise * BigInt(env.REAL_MONEY_WIN_PAYOUT_MULTIPLIER) : 0n;
          await moveWallet(tx, wallet, {
            userId: bet.userId,
            type: won ? "BET_WON_PAYOUT" : "BET_LOST_SETTLED",
            amount: won ? payout : bet.stakePaise,
            availableDelta: won ? payout : 0n,
            lockedDelta: -bet.stakePaise,
            idempotencyKey: `real-money-bet:${bet.id}:settlement`,
            referenceType: "BET",
            referenceId: bet.id,
          });
          await tx.realMoneyBet.update({
            where: { id: bet.id },
            data: { status: won ? "WON" : "LOST", payoutPaise: payout, settledAt: new Date() },
          });
          totalPayout += payout;
        }
        await tx.realMoneyRoundSettlement.update({
          where: { roundId },
          data: { status: "SUCCESS", totalBets: bets.length, totalPayoutPaise: totalPayout, completedAt: new Date() },
        });
        return { status: "SUCCESS" as const, totalBets: bets.length, totalPayoutPaise: totalPayout.toString() };
      }, serializable);
    } catch (error) {
      await this.prisma.realMoneyRoundSettlement.upsert({
        where: { roundId },
        update: { status: "FAILED", failureReason: String(error).slice(0, 500) },
        create: { roundId, result, status: "FAILED", failureReason: String(error).slice(0, 500) },
      }).catch(() => undefined);
      await getObservability().audit.write({
        actorId: "round-engine",
        actorType: "SYSTEM",
        action: "REAL_MONEY_SETTLEMENT_FAILED",
        targetType: "ROUND",
        targetId: roundId,
        metadata: { result, errorCode: error instanceof Error ? error.message.slice(0, 120) : "unknown" },
      });
      logger.error("real_money_settlement_failed", { roundId, result, error });
      return { status: "FAILED" as const };
    }
  }

  async refundRound(roundId: string) {
    if (!env.REAL_MONEY_ENABLED) return { status: "DISABLED" as const };
    return this.prisma.$transaction(async (tx) => {
      const bets = await tx.realMoneyBet.findMany({ where: { roundId, status: "PENDING" } });
      for (const bet of bets) {
        const wallet = await lockWallet(tx, bet.userId);
        await moveWallet(tx, wallet, {
          userId: bet.userId, type: "BET_REFUND", amount: bet.stakePaise,
          availableDelta: bet.stakePaise, lockedDelta: -bet.stakePaise,
          idempotencyKey: `real-money-bet:${bet.id}:refund`, referenceType: "BET", referenceId: bet.id,
        });
        await tx.realMoneyBet.update({ where: { id: bet.id }, data: { status: "REFUNDED", settledAt: new Date() } });
      }
      return { status: "SUCCESS" as const, refundedBets: bets.length };
    }, { ...serializable, timeout: 30_000 });
  }
}
