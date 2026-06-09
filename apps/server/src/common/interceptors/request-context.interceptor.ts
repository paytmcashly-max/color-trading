import type { NextFunction, Request, Response } from "express";

export function requestContextInterceptor(req: Request, _res: Response, next: NextFunction) {
  req.headers["x-request-started-at"] = new Date().toISOString();
  next();
}
