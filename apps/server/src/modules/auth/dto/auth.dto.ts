import { z } from "zod";

import { loginSchema, refreshTokenSchema, registerSchema } from "./validators/auth.validators.js";

export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;
