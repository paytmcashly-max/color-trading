import { Router } from "express";

import { authGuard } from "../../common/guards/auth.guard.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { validateBody } from "../../common/middleware/validate-request.js";
import { readPagination } from "../../common/utils/pagination.js";
import { env } from "../../config/env.js";
import { getPrismaClient } from "../../database/prisma.client.js";
import { PaymentService } from "../payments/payment.service.js";
import { realMoneyBetSchema, realMoneyDepositIntentSchema, realMoneyWithdrawalSchema } from "./real-money.dto.js";
import { realMoneyComplianceGuard } from "./real-money.guard.js";
import { RealMoneyService } from "./real-money.service.js";

export const realMoneyRouter = Router();
const service = new RealMoneyService(
  getPrismaClient(),
  new PaymentService(getPrismaClient(), {
    paymentAppUrl: env.PAYMENT_SERVICE_ENABLED ? env.PAYMENT_APP_URL : undefined,
    intentSigningSecret: env.PAYMENT_SERVICE_ENABLED ? env.PAYMENT_INTENT_SIGNING_SECRET : undefined,
  }),
);

realMoneyRouter.use(authGuard);
realMoneyRouter.get("/eligibility", asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.eligibility(req.auth!.userId) });
}));
realMoneyRouter.use(realMoneyComplianceGuard);
realMoneyRouter.get("/wallet", asyncHandler(async (req, res) => {
  res.json({ success: true, data: { wallet: await service.wallet(req.auth!.userId) } });
}));
realMoneyRouter.get("/ledger", asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.ledger(req.auth!.userId, readPagination(req)) });
}));
realMoneyRouter.get("/deposits", asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.deposits(req.auth!.userId, readPagination(req)) });
}));
realMoneyRouter.post("/deposits/intents", validateBody(realMoneyDepositIntentSchema), asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: { intent: await service.createDepositIntent(req.auth!.userId, req.body) } });
}));
realMoneyRouter.get("/bets", asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.bets(req.auth!.userId, readPagination(req)) });
}));
realMoneyRouter.post("/bets", validateBody(realMoneyBetSchema), asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: { bet: await service.placeBet(req.auth!.userId, req.body) } });
}));
realMoneyRouter.get("/withdrawals", asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.withdrawals(req.auth!.userId, readPagination(req)) });
}));
realMoneyRouter.post("/withdrawals", validateBody(realMoneyWithdrawalSchema), asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: { withdrawal: await service.requestWithdrawal(req.auth!.userId, req.body) } });
}));
