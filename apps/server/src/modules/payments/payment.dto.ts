import { z } from "zod";

export const createPaymentIntentSchema = z.object({
  amountPaise: z.number().int().min(1_000).max(1_000_000).multipleOf(100),
  purpose: z.enum(["PREMIUM_CREDITS", "REAL_MONEY_GAME_DEPOSIT"]),
  idempotencyKey: z.string().min(12).max(160).optional(),
});

export const paymentIntentParamsSchema = z.object({
  id: z.string().uuid(),
});

export const verifiedPaymentEventSchema = z.object({
  eventId: z.string().uuid(),
  intentId: z.string().uuid(),
  userId: z.string().uuid(),
  amountPaise: z.string().regex(/^[1-9]\d*$/).refine((value) => {
    const amount = BigInt(value);
    return amount >= 1_000n && amount <= 1_000_000n && amount % 100n === 0n;
  }, "Payment amount is outside the supported premium-credit range."),
  purpose: z.enum(["PREMIUM_CREDITS", "REAL_MONEY_GAME_DEPOSIT"]),
  provider: z.literal("cashfree"),
  providerOrderId: z.string().min(3).max(120),
  providerTxnId: z.string().min(3).max(120),
  status: z.literal("PAID_VERIFIED"),
  paidAt: z.string().datetime(),
});

export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema>;
export type VerifiedPaymentEventInput = z.infer<typeof verifiedPaymentEventSchema>;
