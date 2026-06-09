import { z } from "zod";

import { coinAmountSchema } from "../../wallet/dto/wallet.dto.js";

export const adminWalletAdjustmentSchema = z.object({
  amountCoins: coinAmountSchema,
  direction: z.enum(["CREDIT", "DEBIT"]),
  reason: z.string().trim().min(8).max(500),
  confirmation: z.literal("ADJUST WALLET"),
  idempotencyKey: z.string().trim().min(12).max(160).optional(),
});

export const forceStopRoundSchema = z.object({
  confirmation: z.literal("STOP ROUND"),
  reason: z.string().trim().min(8).max(500),
});

export const forceStartRoundSchema = z.object({
  reason: z.string().trim().min(8).max(500).optional(),
});

export type AdminWalletAdjustmentDto = z.infer<typeof adminWalletAdjustmentSchema>;
export type ForceStopRoundDto = z.infer<typeof forceStopRoundSchema>;
export type ForceStartRoundDto = z.infer<typeof forceStartRoundSchema>;
