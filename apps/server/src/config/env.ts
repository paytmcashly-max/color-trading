import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_URL: z.string().url().optional(),
  CLIENT_ORIGIN: z.string().url().optional(),
  SOCKET_CORS_ORIGIN: z.string().url().optional(),
  API_VERSION: z.string().trim().min(1).default("v1"),
  RELEASE_VERSION: z.string().trim().min(1).default("0.1.0"),
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(32).optional(),
  JWT_ACCESS_SECRET: z.string().min(32).optional(),
  JWT_REFRESH_SECRET: z.string().min(32).optional(),
  JWT_ACCESS_TOKEN_TTL: z.string().default("15m"),
  JWT_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TOKEN_TTL: z.string().default("7d"),
  JWT_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  JWT_ISSUER: z.string().default("color-trading-api"),
  JWT_AUDIENCE: z.string().default("color-trading-client"),
  GAME_ROUND_DURATION_SECONDS: z.coerce.number().int().min(10).max(3600).default(60),
  GAME_BETTING_DURATION_SECONDS: z.coerce.number().int().min(1).max(3599).default(45),
  GAME_SCHEDULER_TICK_MS: z.coerce.number().int().min(250).max(10_000).default(1000),
  GAME_ROUND_LOCK_TTL_MS: z.coerce.number().int().min(1000).max(60_000).default(5000),
  GAME_ENGINE_ENABLED: z
    .preprocess((value) => {
      if (typeof value === "string") {
        return value.toLowerCase() === "true";
      }

      return value;
    }, z.boolean())
    .default(true),
});

const envSchema = rawEnvSchema
  .transform((value) => {
    const clientOrigin = value.CLIENT_ORIGIN ?? value.CLIENT_URL ?? "http://localhost:3000";

    return {
      ...value,
      CLIENT_ORIGIN: clientOrigin,
      SOCKET_CORS_ORIGIN: value.SOCKET_CORS_ORIGIN ?? clientOrigin,
      JWT_ACCESS_SECRET: value.JWT_ACCESS_SECRET ?? value.JWT_SECRET,
      JWT_REFRESH_SECRET: value.JWT_REFRESH_SECRET ?? value.JWT_SECRET,
    };
  })
  .pipe(
    z.object({
      NODE_ENV: z.enum(["development", "test", "staging", "production"]),
      PORT: z.number().int().positive(),
      CLIENT_URL: z.string().url().optional(),
      CLIENT_ORIGIN: z.string().url(),
      SOCKET_CORS_ORIGIN: z.string().url(),
      API_VERSION: z.string(),
      RELEASE_VERSION: z.string(),
      DATABASE_URL: z.string().url().optional(),
      REDIS_URL: z.string().url().optional(),
      JWT_SECRET: z.string().min(32).optional(),
      JWT_ACCESS_SECRET: z.string().min(32),
      JWT_REFRESH_SECRET: z.string().min(32),
      JWT_ACCESS_TOKEN_TTL: z.string(),
      JWT_ACCESS_TOKEN_TTL_SECONDS: z.number().int().positive(),
      JWT_REFRESH_TOKEN_TTL: z.string(),
      JWT_REFRESH_TOKEN_TTL_DAYS: z.number().int().positive(),
      JWT_ISSUER: z.string(),
      JWT_AUDIENCE: z.string(),
      GAME_ROUND_DURATION_SECONDS: z.number().int(),
      GAME_BETTING_DURATION_SECONDS: z.number().int(),
      GAME_SCHEDULER_TICK_MS: z.number().int(),
      GAME_ROUND_LOCK_TTL_MS: z.number().int(),
      GAME_ENGINE_ENABLED: z.boolean(),
    }),
  )
  .refine(
    (value) => value.GAME_BETTING_DURATION_SECONDS < value.GAME_ROUND_DURATION_SECONDS,
    {
      message: "GAME_BETTING_DURATION_SECONDS must be less than GAME_ROUND_DURATION_SECONDS.",
      path: ["GAME_BETTING_DURATION_SECONDS"],
    },
  );

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid server environment", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
