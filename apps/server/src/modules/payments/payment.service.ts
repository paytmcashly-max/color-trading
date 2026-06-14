import crypto from "node:crypto";

import { PaymentIntentStatus, Prisma, type PrismaClient } from "@prisma/client";
import { createSignedToken } from "@color-trading/shared/payment-signing";

import { HttpError } from "../../common/errors/http-error.js";
import {
  createdAtIdDescWhere,
  encodeCreatedAtIdCursor,
  pageInfo,
  type PaginationInput,
} from "../../common/utils/pagination.js";
import type { CreatePaymentIntentInput, VerifiedPaymentEventInput } from "./payment.dto.js";

const PAYMENT_INTENT_TTL_MS = 15 * 60 * 1000;

export class PaymentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: {
      paymentAppUrl?: string;
      intentSigningSecret?: string;
    },
  ) {}

  async createIntent(userId: string, input: CreatePaymentIntentInput, headerIdempotencyKey?: string) {
    this.assertConfigured();
    const idempotencyKey = input.idempotencyKey ?? headerIdempotencyKey ?? crypto.randomUUID();
    const existing = await this.prisma.paymentIntent.findUnique({ where: { idempotencyKey } });

    if (existing) {
      this.assertIntentReplay(existing, userId, input.amountPaise, input.purpose);
      return serializeIntent(existing, this.paymentUrl(existing, userId));
    }

    let intent;
    try {
      intent = await this.prisma.paymentIntent.create({
        data: {
          userId,
          amountPaise: BigInt(input.amountPaise),
          purpose: input.purpose,
          idempotencyKey,
          expiresAt: new Date(Date.now() + PAYMENT_INTENT_TTL_MS),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const replay = await this.prisma.paymentIntent.findUnique({ where: { idempotencyKey } });
        if (replay) {
          this.assertIntentReplay(replay, userId, input.amountPaise, input.purpose);
          return serializeIntent(replay, this.paymentUrl(replay, userId));
        }
      }
      throw error;
    }

    return serializeIntent(intent, this.paymentUrl(intent, userId));
  }

  async getIntent(userId: string, intentId: string) {
    const intent = await this.prisma.paymentIntent.findFirst({
      where: { id: intentId, userId },
    });
    if (!intent) {
      throw new HttpError(404, "PAYMENT_INTENT_NOT_FOUND", "Payment intent was not found.");
    }

    if (intent.expiresAt <= new Date() && intent.status === PaymentIntentStatus.CREATED) {
      const expired = await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: PaymentIntentStatus.EXPIRED },
      });
      return serializeIntent(expired);
    }

    return serializeIntent(intent);
  }

  async getPremiumWallet(userId: string) {
    const wallet = await this.prisma.premiumCreditWallet.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });

    return serializePremiumWallet(wallet);
  }

  async getPremiumLedger(userId: string, pagination: PaginationInput = { limit: 50 }) {
    const entries = await this.prisma.premiumCreditLedgerEntry.findMany({
      where: {
        userId,
        ...createdAtIdDescWhere(pagination.cursor),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pagination.limit + 1,
    });
    const page = pageInfo(entries, pagination.limit, (entry) =>
      encodeCreatedAtIdCursor(entry.createdAt, entry.id),
    );

    return {
      entries: page.items.map((entry) => ({
        id: entry.id,
        credits: entry.credits.toString(),
        balanceBefore: entry.balanceBefore.toString(),
        balanceAfter: entry.balanceAfter.toString(),
        paymentIntentId: entry.paymentIntentId,
        createdAt: entry.createdAt.toISOString(),
      })),
      pageInfo: page.pageInfo,
    };
  }

  async processVerifiedEvent(event: VerifiedPaymentEventInput, payloadHash: string) {
    return this.prisma.$transaction(async (tx) => {
      const processed = await tx.processedPaymentEvent.findUnique({
        where: { eventId: event.eventId },
      });
      if (processed) {
        if (processed.payloadHash !== payloadHash) {
          throw new HttpError(409, "PAYMENT_EVENT_REPLAY_MISMATCH", "Payment event replay did not match.");
        }
        return { idempotent: true };
      }

      const intent = await tx.paymentIntent.findUnique({ where: { id: event.intentId } });
      if (!intent) {
        throw new HttpError(404, "PAYMENT_INTENT_NOT_FOUND", "Payment intent was not found.");
      }
      if (
        intent.userId !== event.userId ||
        intent.amountPaise.toString() !== event.amountPaise ||
        intent.purpose !== event.purpose
      ) {
        throw new HttpError(409, "PAYMENT_INTENT_MISMATCH", "Verified payment did not match the intent.");
      }
      if (intent.status === PaymentIntentStatus.CREDITED) {
        if (intent.providerTxnId !== event.providerTxnId) {
          throw new HttpError(409, "PAYMENT_INTENT_ALREADY_CREDITED", "Payment intent was already credited.");
        }
        await tx.processedPaymentEvent.create({
          data: {
            eventId: event.eventId,
            intentId: event.intentId,
            provider: event.provider,
            status: event.status,
            payloadHash,
          },
        });
        return { idempotent: true };
      }
      if (intent.expiresAt < new Date(event.paidAt)) {
        throw new HttpError(409, "PAYMENT_INTENT_EXPIRED", "Payment was completed after intent expiry.");
      }

      if (event.purpose === "REAL_MONEY_GAME_DEPOSIT") {
        await creditRealMoneyDeposit(tx, intent.id, event);
      } else {
        await creditPremiumWallet(tx, intent.id, event);
      }
      await tx.paymentIntent.update({
        where: { id: intent.id },
        data: {
          status: PaymentIntentStatus.CREDITED,
          provider: event.provider,
          providerTxnId: event.providerTxnId,
          paymentServiceOrderId: event.providerOrderId,
          creditedAt: new Date(event.paidAt),
        },
      });
      await tx.processedPaymentEvent.create({
        data: {
          eventId: event.eventId,
          intentId: event.intentId,
          provider: event.provider,
          status: event.status,
          payloadHash,
        },
      });

      return { idempotent: false };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 10_000,
    });
  }

  private paymentUrl(
    intent: {
      id: string;
      userId: string;
      amountPaise: bigint;
      expiresAt: Date;
      purpose: "PREMIUM_CREDITS" | "REAL_MONEY_GAME_DEPOSIT";
    },
    userId: string,
  ) {
    const token = createSignedToken({
      secret: this.config.intentSigningSecret!,
      payload: {
        intentId: intent.id,
        userId,
        amountPaise: intent.amountPaise.toString(),
        purpose: intent.purpose,
        expiresAt: intent.expiresAt.toISOString(),
        nonce: crypto.randomUUID(),
      },
    });
    return `${this.config.paymentAppUrl}/pay?token=${encodeURIComponent(token)}`;
  }

  private assertConfigured() {
    if (!this.config.paymentAppUrl || !this.config.intentSigningSecret) {
      throw new HttpError(503, "PAYMENT_SERVICE_DISABLED", "Payment service is not configured.");
    }
  }

  private assertIntentReplay(
    existing: { userId: string; amountPaise: bigint; purpose: string },
    userId: string,
    amountPaise: number,
    purpose: string,
  ) {
    if (existing.userId !== userId || existing.amountPaise !== BigInt(amountPaise) || existing.purpose !== purpose) {
      throw new HttpError(409, "PAYMENT_INTENT_IDEMPOTENCY_MISMATCH", "Idempotency key was already used.");
    }
  }
}

async function creditPremiumWallet(
  tx: Prisma.TransactionClient,
  intentId: string,
  event: VerifiedPaymentEventInput,
) {
  await tx.premiumCreditWallet.upsert({
    where: { userId: event.userId },
    update: {},
    create: { userId: event.userId },
  });
  const wallets = await tx.$queryRaw<Array<{ id: string; balanceCredits: bigint }>>`
    SELECT id, balance_credits AS "balanceCredits"
    FROM premium_credit_wallets
    WHERE user_id = CAST(${event.userId} AS uuid)
    FOR UPDATE
  `;
  const wallet = wallets[0];
  if (!wallet) throw new Error("Premium credit wallet could not be locked.");
  const credits = BigInt(event.amountPaise) / 100n;
  const after = wallet.balanceCredits + credits;
  await tx.premiumCreditLedgerEntry.create({
    data: {
      walletId: wallet.id,
      userId: event.userId,
      credits,
      balanceBefore: wallet.balanceCredits,
      balanceAfter: after,
      paymentIntentId: intentId,
      idempotencyKey: `premium-credit:${event.eventId}`,
      metadata: {
        provider: event.provider,
        providerOrderId: event.providerOrderId,
        providerTxnId: event.providerTxnId,
      },
    },
  });
  await tx.premiumCreditWallet.update({
    where: { id: wallet.id },
    data: { balanceCredits: after, ledgerVersion: { increment: 1 } },
  });
}

async function creditRealMoneyDeposit(
  tx: Prisma.TransactionClient,
  intentId: string,
  event: VerifiedPaymentEventInput,
) {
  await tx.realMoneyGameWallet.upsert({
    where: { userId: event.userId },
    update: {},
    create: { userId: event.userId },
  });
  const wallets = await tx.$queryRaw<Array<{ id: string; availablePaise: bigint; lockedPaise: bigint }>>`
    SELECT id, available_paise AS "availablePaise", locked_paise AS "lockedPaise"
    FROM real_money_game_wallets
    WHERE user_id = CAST(${event.userId} AS uuid)
    FOR UPDATE
  `;
  const wallet = wallets[0];
  if (!wallet) throw new Error("Real-money wallet could not be locked.");
  const amount = BigInt(event.amountPaise);
  const after = wallet.availablePaise + amount;
  await tx.realMoneyGameLedgerEntry.create({
    data: {
      walletId: wallet.id,
      userId: event.userId,
      type: "DEPOSIT_APPROVED",
      amountPaise: amount,
      availableBeforePaise: wallet.availablePaise,
      availableAfterPaise: after,
      lockedBeforePaise: wallet.lockedPaise,
      lockedAfterPaise: wallet.lockedPaise,
      idempotencyKey: `real-money-deposit:${event.eventId}`,
      referenceType: "DEPOSIT",
      referenceId: intentId,
      metadata: { provider: event.provider, providerTxnId: event.providerTxnId },
    },
  });
  await tx.realMoneyGameWallet.update({
    where: { id: wallet.id },
    data: { availablePaise: after, ledgerVersion: { increment: 1 } },
  });
  await tx.realMoneyDeposit.upsert({
    where: { paymentIntentId: intentId },
    update: {
      status: "CREDITED",
      providerTxnId: event.providerTxnId,
      creditedAt: new Date(event.paidAt),
    },
    create: {
      userId: event.userId,
      paymentIntentId: intentId,
      amountPaise: amount,
      status: "CREDITED",
      providerTxnId: event.providerTxnId,
      creditedAt: new Date(event.paidAt),
    },
  });
}

export function serializeIntent(intent: {
  id: string;
  amountPaise: bigint;
  status: PaymentIntentStatus;
  expiresAt: Date;
  creditedAt: Date | null;
  updatedAt: Date;
  purpose?: "PREMIUM_CREDITS" | "REAL_MONEY_GAME_DEPOSIT";
}, paymentUrl?: string) {
  return {
    id: intent.id,
    amountPaise: intent.amountPaise.toString(),
    credits: (intent.amountPaise / 100n).toString(),
    purpose: intent.purpose ?? "PREMIUM_CREDITS",
    status: intent.status,
    ...(paymentUrl ? { paymentUrl } : {}),
    expiresAt: intent.expiresAt.toISOString(),
    creditedAt: intent.creditedAt?.toISOString() ?? null,
    updatedAt: intent.updatedAt.toISOString(),
  };
}

function serializePremiumWallet(wallet: {
  balanceCredits: bigint;
  ledgerVersion: bigint;
  updatedAt: Date;
}) {
  return {
    balanceCredits: wallet.balanceCredits.toString(),
    ledgerVersion: wallet.ledgerVersion.toString(),
    updatedAt: wallet.updatedAt.toISOString(),
  };
}
