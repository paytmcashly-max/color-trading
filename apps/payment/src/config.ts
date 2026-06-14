import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4100),
  PAYMENT_SERVICE_ENABLED: z.preprocess(
    (value) => typeof value === "string" ? value.toLowerCase() === "true" : value,
    z.boolean(),
  ).default(false),
  PAYMENT_DATABASE_URL: z.string().url().optional(),
  MAIN_API_URL: z.string().url().optional(),
  MAIN_CLIENT_URL: z.string().url().optional(),
  PAYMENT_INTENT_SIGNING_SECRET: z.string().min(32).optional(),
  PAYMENT_SERVICE_SECRET: z.string().min(32).optional(),
  CASHFREE_CLIENT_ID: z.string().min(1).optional(),
  CASHFREE_CLIENT_SECRET: z.string().min(1).optional(),
  CASHFREE_API_VERSION: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default("2025-01-01"),
  CASHFREE_BASE_URL: z.literal("https://sandbox.cashfree.com/pg").default("https://sandbox.cashfree.com/pg"),
  CASHFREE_RETURN_URL: z.string().url().optional(),
  CASHFREE_WEBHOOK_URL: z.string().url().optional(),
}).superRefine((value, context) => {
  if (!value.PAYMENT_SERVICE_ENABLED) return;

  for (const key of [
    "PAYMENT_DATABASE_URL",
    "MAIN_API_URL",
    "MAIN_CLIENT_URL",
    "PAYMENT_INTENT_SIGNING_SECRET",
    "PAYMENT_SERVICE_SECRET",
    "CASHFREE_CLIENT_ID",
    "CASHFREE_CLIENT_SECRET",
    "CASHFREE_RETURN_URL",
    "CASHFREE_WEBHOOK_URL",
  ] as const) {
    if (!value[key]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is required when payment service is enabled.`,
      });
    }
  }

  if (value.PAYMENT_INTENT_SIGNING_SECRET === value.PAYMENT_SERVICE_SECRET) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["PAYMENT_SERVICE_SECRET"],
      message: "Payment signing secrets must be different.",
    });
  }
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid payment service environment", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
