import { z } from "zod";

export const coinAmountSchema = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);

export const ledgerMutationSchema = z.object({
  amountCoins: coinAmountSchema,
  referenceId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(12).max(160),
});

export const adminAdjustmentSchema = z.object({
  amountCoins: coinAmountSchema,
  direction: z.enum(["CREDIT", "DEBIT"]),
  referenceId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(12).max(160),
});

export type LedgerMutationDto = z.infer<typeof ledgerMutationSchema>;
export type AdminAdjustmentDto = z.infer<typeof adminAdjustmentSchema>;
