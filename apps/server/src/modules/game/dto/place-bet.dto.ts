import { PredictionColor } from "@prisma/client";
import { z } from "zod";

const coinAmountSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const placeBetSchema = z
  .object({
    roundId: z.string().uuid(),
    choice: z.nativeEnum(PredictionColor),
    amount: coinAmountSchema.optional(),
    coinsStaked: coinAmountSchema.optional(),
    idempotencyKey: z.string().trim().min(12).max(160),
  })
  .superRefine((value, context) => {
    if (value.amount === undefined && value.coinsStaked === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amount"],
        message: "Bet amount is required.",
      });
    }

    if (
      value.amount !== undefined &&
      value.coinsStaked !== undefined &&
      value.amount !== value.coinsStaked
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amount"],
        message: "amount and coinsStaked must match when both are provided.",
      });
    }
  })
  .transform((value) => ({
    roundId: value.roundId,
    choice: value.choice,
    coinsStaked: value.amount ?? value.coinsStaked!,
    idempotencyKey: value.idempotencyKey,
  }));

export type PlaceBetDto = z.infer<typeof placeBetSchema>;
