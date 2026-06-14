import crypto from "node:crypto";

import { Router } from "express";
import { HttpError } from "../../common/errors/http-error.js";
import { authGuard } from "../../common/guards/auth.guard.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { readPagination } from "../../common/utils/pagination.js";
import { env } from "../../config/env.js";
import { getPrismaClient } from "../../database/prisma.client.js";
import {
  createPaymentIntentSchema,
  paymentIntentParamsSchema,
  verifiedPaymentEventSchema,
} from "./payment.dto.js";
import { PaymentService } from "./payment.service.js";
import { verifyInternalPaymentEventSignature } from "./payment.signing.js";

export const paymentRouter = Router();
export const internalPaymentEventsRouter = Router();

const service = new PaymentService(getPrismaClient(), {
  paymentAppUrl: env.PAYMENT_SERVICE_ENABLED ? env.PAYMENT_APP_URL : undefined,
  intentSigningSecret: env.PAYMENT_SERVICE_ENABLED ? env.PAYMENT_INTENT_SIGNING_SECRET : undefined,
});

paymentRouter.use(authGuard);
paymentRouter.post("/intents", asyncHandler(async (req, res) => {
  const input = createPaymentIntentSchema.parse(req.body);
  if (input.purpose !== "PREMIUM_CREDITS") {
    throw new HttpError(403, "REAL_MONEY_DEPOSIT_ROUTE_REQUIRED", "Use the compliance-gated deposit route.");
  }
  const intent = await service.createIntent(req.auth!.userId, input, req.get("idempotency-key"));
  res.status(201).json({ success: true, message: "Payment intent created.", data: { intent } });
}));
paymentRouter.get("/intents/:id/status", asyncHandler(async (req, res) => {
  const { id } = paymentIntentParamsSchema.parse(req.params);
  const intent = await service.getIntent(req.auth!.userId, id);
  res.status(200).json({ success: true, message: "Payment intent status.", data: { intent } });
}));
paymentRouter.get("/premium-wallet", asyncHandler(async (req, res) => {
  const wallet = await service.getPremiumWallet(req.auth!.userId);
  res.status(200).json({ success: true, message: "Premium credit wallet.", data: { wallet } });
}));
paymentRouter.get("/premium-wallet/ledger", asyncHandler(async (req, res) => {
  const result = await service.getPremiumLedger(req.auth!.userId, readPagination(req));
  res.status(200).json({ success: true, message: "Premium credit ledger.", data: result });
}));

internalPaymentEventsRouter.post("/", asyncHandler(async (req, res) => {
  const signature = req.get("x-payment-service-signature");
  const timestamp = req.get("x-payment-service-timestamp");
  const eventId = req.get("x-payment-service-event-id");
  const rawBody = (req as typeof req & { rawBody?: Buffer }).rawBody;

  if (!eventId || !verifyInternalPaymentEventSignature({
    rawBody,
    signature,
    timestamp,
    secret: env.PAYMENT_SERVICE_SECRET,
  })) {
    throw new HttpError(401, "MISSING_PAYMENT_SIGNATURE", "Payment event authentication failed.");
  }
  if (!rawBody) {
    throw new HttpError(401, "MISSING_PAYMENT_SIGNATURE", "Payment event authentication failed.");
  }

  const event = verifiedPaymentEventSchema.parse(req.body);
  if (event.eventId !== eventId) {
    throw new HttpError(400, "PAYMENT_EVENT_ID_MISMATCH", "Payment event ID did not match.");
  }
  const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  const result = await service.processVerifiedEvent(event, payloadHash);
  res.status(200).json({ success: true, message: "Payment event accepted.", data: result });
}));
