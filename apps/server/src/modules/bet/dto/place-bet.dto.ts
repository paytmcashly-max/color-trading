import { PredictionColor } from "@prisma/client";
import { z } from "zod";

export const BETTING_OPTIONS = [
  PredictionColor.RED,
  PredictionColor.GREEN,
  PredictionColor.VIOLET,
] as const;

const coinAmountSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const placeBetSchema = z
  .object({
    roundId: z.string().uuid(),
    choice: z.nativeEnum(PredictionColor).optional(),
    selection: z.nativeEnum(PredictionColor).optional(),
    amount: coinAmountSchema.optional(),
    coinsStaked: coinAmountSchema.optional(),
    idempotencyKey: z.string().trim().min(12).max(160),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.choice === undefined && value.selection === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["selection"],
        message: "Selection is required.",
      });
    }

    if (
      value.choice !== undefined &&
      value.selection !== undefined &&
      value.choice !== value.selection
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["selection"],
        message: "choice and selection must match when both are provided.",
      });
    }

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
    choice: value.selection ?? value.choice!,
    coinsStaked: value.amount ?? value.coinsStaked!,
    idempotencyKey: value.idempotencyKey,
  }));

export type PlaceBetDto = z.infer<typeof placeBetSchema>;
