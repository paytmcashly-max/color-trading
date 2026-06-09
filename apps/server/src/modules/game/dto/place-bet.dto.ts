import { PredictionColor } from "@prisma/client";
import { z } from "zod";

export const placeBetSchema = z.object({
  roundId: z.string().uuid(),
  choice: z.nativeEnum(PredictionColor),
  coinsStaked: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  idempotencyKey: z.string().trim().min(12).max(160),
});

export type PlaceBetDto = z.infer<typeof placeBetSchema>;
