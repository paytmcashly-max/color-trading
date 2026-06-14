import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4100),
  PAYMENT_DATABASE_URL: z.string().url(),
  MAIN_API_URL: z.string().url(),
  MAIN_CLIENT_URL: z.string().url(),
  PAYMENT_INTENT_SIGNING_SECRET: z.string().min(32),
  PAYMENT_SERVICE_SECRET: z.string().min(32),
  CASHFREE_CLIENT_ID: z.string().min(1),
  CASHFREE_CLIENT_SECRET: z.string().min(1),
  CASHFREE_API_VERSION: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default("2025-01-01"),
  CASHFREE_BASE_URL: z.literal("https://sandbox.cashfree.com/pg").default("https://sandbox.cashfree.com/pg"),
  CASHFREE_RETURN_URL: z.string().url(),
  CASHFREE_WEBHOOK_URL: z.string().url(),
}).refine((value) => value.PAYMENT_INTENT_SIGNING_SECRET !== value.PAYMENT_SERVICE_SECRET, {
  path: ["PAYMENT_SERVICE_SECRET"],
  message: "Payment signing secrets must be different.",
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid payment service environment", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
