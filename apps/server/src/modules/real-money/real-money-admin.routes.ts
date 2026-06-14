import { UserRole } from "@prisma/client";
import { Router } from "express";

import { authGuard } from "../../common/guards/auth.guard.js";
import { roleGuard } from "../../common/guards/role.guard.js";
import { verifiedEmailGuard } from "../../common/guards/verified-email.guard.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { validateBody } from "../../common/middleware/validate-request.js";
import { readPagination } from "../../common/utils/pagination.js";
import { getPrismaClient } from "../../database/prisma.client.js";
import { kycReviewSchema, responsibleGamingLimitSchema, riskControlSchema, walletStatusSchema, withdrawalDecisionSchema } from "./real-money.dto.js";
import { realMoneyComplianceGuard } from "./real-money.guard.js";
import { RealMoneyAdminService } from "./real-money-admin.service.js";

export const realMoneyAdminRouter = Router();
const service = new RealMoneyAdminService(getPrismaClient());

realMoneyAdminRouter.use(authGuard, roleGuard(UserRole.ADMIN), verifiedEmailGuard);
realMoneyAdminRouter.get("/withdrawals", asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.listWithdrawals(readPagination(req)) });
}));
realMoneyAdminRouter.get("/deposits", asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.listDeposits(readPagination(req)) });
}));
realMoneyAdminRouter.get("/wallet/:userId", asyncHandler(async (req, res) => {
  res.json({ success: true, data: { wallet: await service.wallet(param(req.params.userId)) } });
}));
realMoneyAdminRouter.get("/ledger/:userId", asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.ledger(param(req.params.userId), readPagination(req)) });
}));
realMoneyAdminRouter.get("/settlement-alerts", asyncHandler(async (_req, res) => {
  res.json({ success: true, data: { alerts: await service.settlementAlerts() } });
}));
realMoneyAdminRouter.use(realMoneyComplianceGuard);
realMoneyAdminRouter.post("/kyc/:userId/review", validateBody(kycReviewSchema), asyncHandler(async (req, res) => {
  res.json({ success: true, data: { profile: await service.reviewKyc(req.auth!.userId, param(req.params.userId), req.body) } });
}));
realMoneyAdminRouter.post("/risk/:userId", validateBody(riskControlSchema), asyncHandler(async (req, res) => {
  res.json({ success: true, data: { profile: await service.setRiskControls(req.auth!.userId, param(req.params.userId), req.body) } });
}));
realMoneyAdminRouter.post("/limits/:userId", validateBody(responsibleGamingLimitSchema), asyncHandler(async (req, res) => {
  res.json({ success: true, data: { limits: await service.setResponsibleLimits(req.auth!.userId, param(req.params.userId), req.body) } });
}));
realMoneyAdminRouter.post("/wallet/:userId/freeze", validateBody(walletStatusSchema), asyncHandler(async (req, res) => {
  res.json({ success: true, data: { wallet: await service.setWalletFrozen(req.auth!.userId, param(req.params.userId), req.body) } });
}));
realMoneyAdminRouter.post("/withdrawals/:id/decision", validateBody(withdrawalDecisionSchema), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.decideWithdrawal(req.auth!.userId, param(req.params.id), req.body) });
}));

function param(value: string | string[] | undefined) {
  if (typeof value !== "string") throw new Error("Route parameter is required.");
  return value;
}
