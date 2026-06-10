import { z } from "zod";
import { PredictionColor } from "@prisma/client";

import { coinAmountSchema } from "../../wallet/dto/wallet.dto.js";

export const adminWalletAdjustmentSchema = z.object({
  amountCoins: coinAmountSchema,
  direction: z.enum(["CREDIT", "DEBIT"]),
  reason: z.string().trim().min(8).max(500),
  confirmation: z.literal("ADJUST WALLET"),
  idempotencyKey: z.string().trim().min(12).max(160),
}).strict();

export const forceStopRoundSchema = z.object({
  confirmation: z.literal("STOP ROUND"),
  reason: z.string().trim().min(8).max(500),
}).strict();

export const forceStartRoundSchema = z.object({
  reason: z.string().trim().min(8).max(500).optional(),
}).strict();

export const gamePauseSchema = z.object({
  confirmation: z.literal("PAUSE GAME"),
  reason: z.string().trim().min(8).max(500),
}).strict();

export const gameResumeSchema = z.object({
  confirmation: z.literal("RESUME GAME"),
  reason: z.string().trim().min(8).max(500).optional(),
}).strict();

export const forceResultSchema = z.object({
  confirmation: z.literal("DECLARE RESULT"),
  result: z.nativeEnum(PredictionColor),
  reason: z.string().trim().min(8).max(500),
}).strict();

export type AdminWalletAdjustmentDto = z.infer<typeof adminWalletAdjustmentSchema>;
export type ForceStopRoundDto = z.infer<typeof forceStopRoundSchema>;
export type ForceStartRoundDto = z.infer<typeof forceStartRoundSchema>;
export type GamePauseDto = z.infer<typeof gamePauseSchema>;
export type GameResumeDto = z.infer<typeof gameResumeSchema>;
export type ForceResultDto = z.infer<typeof forceResultSchema>;
