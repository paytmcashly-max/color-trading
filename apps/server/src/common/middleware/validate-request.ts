import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

export function validateBody<TBody>(schema: ZodSchema<TBody>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.body = schema.parse(req.body);
    next();
  };
}
