import { z } from "zod";

const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters long.")
  .max(128, "Password must be at most 128 characters long.")
  .regex(/[a-z]/, "Password must include a lowercase letter.")
  .regex(/[A-Z]/, "Password must include an uppercase letter.")
  .regex(/[0-9]/, "Password must include a number.")
  .regex(/[^A-Za-z0-9]/, "Password must include a symbol.");

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: passwordSchema,
  displayName: z.string().trim().min(2).max(80).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().trim().min(32).max(2048),
});
