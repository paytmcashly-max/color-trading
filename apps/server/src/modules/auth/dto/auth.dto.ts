import { z } from "zod";

import { loginSchema, registerSchema } from "./validators/auth.validators.js";

export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
