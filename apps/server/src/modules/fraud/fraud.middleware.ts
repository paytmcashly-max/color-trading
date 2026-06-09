import type { NextFunction, Request, Response } from "express";

import { getFraudService } from "./fraud.module.js";

export async function fraudAuthRateLimit(req: Request, _res: Response, next: NextFunction) {
  try {
    await getFraudService().enforceAuthRateLimit(req);
    next();
  } catch (error) {
    next(error);
  }
}

export async function fraudBetGuard(req: Request, _res: Response, next: NextFunction) {
  try {
    await getFraudService().enforceBettingPolicy(req.auth!.userId, req, {
      roundId: req.body.roundId,
      choice: req.body.choice,
      coinsStaked: req.body.coinsStaked,
    });
    next();
  } catch (error) {
    next(error);
  }
}
