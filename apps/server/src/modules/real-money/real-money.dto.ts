import { KycStatus, PredictionColor } from "@prisma/client";
import { z } from "zod";

const paise = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const realMoneyBetSchema = z.object({
  roundId: z.string().uuid(),
  choice: z.nativeEnum(PredictionColor),
  stakePaise: paise,
  idempotencyKey: z.string().trim().min(12).max(160),
}).strict();

export const realMoneyDepositIntentSchema = z.object({
  amountPaise: paise,
  idempotencyKey: z.string().trim().min(12).max(160),
}).strict();

export const realMoneyWithdrawalSchema = z.object({
  amountPaise: paise,
  idempotencyKey: z.string().trim().min(12).max(160),
}).strict();

export const kycReviewSchema = z.object({
  status: z.nativeEnum(KycStatus),
  jurisdiction: z.string().trim().min(2).max(80).optional(),
  reviewNote: z.string().trim().min(3).max(500),
}).strict();

export const riskControlSchema = z.object({
  betBlocked: z.boolean(),
  depositBlocked: z.boolean(),
  withdrawalBlocked: z.boolean(),
  reason: z.string().trim().min(3).max(240),
}).strict();

export const walletStatusSchema = z.object({
  frozen: z.boolean(),
  reason: z.string().trim().min(3).max(240),
}).strict();

export const responsibleGamingLimitSchema = z.object({
  dailyDepositPaise: paise.nullable().optional(),
  dailyWithdrawalPaise: paise.nullable().optional(),
  dailyLossPaise: paise.nullable().optional(),
  perBetPaise: paise.nullable().optional(),
  selfExcludedUntil: z.string().datetime().nullable().optional(),
  coolingOffUntil: z.string().datetime().nullable().optional(),
}).strict();

export const withdrawalDecisionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "MARK_PAID"]),
  note: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().trim().min(12).max(160),
}).strict();

export type RealMoneyBetInput = z.infer<typeof realMoneyBetSchema>;
export type RealMoneyDepositIntentInput = z.infer<typeof realMoneyDepositIntentSchema>;
export type RealMoneyWithdrawalInput = z.infer<typeof realMoneyWithdrawalSchema>;
