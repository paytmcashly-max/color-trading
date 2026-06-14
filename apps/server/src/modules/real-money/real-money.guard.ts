import type { NextFunction, Request, Response } from "express";

import { HttpError } from "../../common/errors/http-error.js";
import { env } from "../../config/env.js";

const FLAG_NAMES = [
  "REAL_MONEY_ENABLED",
  "COMPLIANCE_APPROVED",
  "PAYMENT_PROVIDER_APPROVED",
  "KYC_ENABLED",
  "AML_CHECKS_ENABLED",
  "RESPONSIBLE_GAMING_ENABLED",
] as const;

export function closedComplianceFlags() {
  return FLAG_NAMES.filter((name) => !env[name]);
}

export function realMoneyComplianceGuard(_req: Request, _res: Response, next: NextFunction) {
  const closed = closedComplianceFlags();
  if (closed.length > 0) {
    throw new HttpError(403, "REAL_MONEY_DISABLED", "Real-money sandbox access is disabled.");
  }
  next();
}
