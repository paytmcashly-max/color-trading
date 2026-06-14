export type PaymentIntentStatus =
  | "CREATED"
  | "PAYMENT_STARTED"
  | "PAID_VERIFIED"
  | "CREDITED"
  | "FAILED"
  | "EXPIRED";

export type PaymentIntentPurpose = "PREMIUM_CREDITS" | "REAL_MONEY_GAME_DEPOSIT";

export interface SignedPaymentIntent {
  intentId: string;
  userId: string;
  amountPaise: string;
  purpose: PaymentIntentPurpose;
  expiresAt: string;
  nonce: string;
}

export interface VerifiedPaymentEvent {
  eventId: string;
  intentId: string;
  userId: string;
  amountPaise: string;
  purpose: PaymentIntentPurpose;
  provider: "cashfree";
  providerOrderId: string;
  providerTxnId: string;
  status: "PAID_VERIFIED";
  paidAt: string;
}

export interface PaymentIntentDto {
  id: string;
  amountPaise: string;
  credits: string;
  purpose: PaymentIntentPurpose;
  status: PaymentIntentStatus;
  paymentUrl?: string;
  expiresAt: string;
  creditedAt: string | null;
  updatedAt: string;
}

export interface PremiumCreditWalletDto {
  balanceCredits: string;
  ledgerVersion: string;
  updatedAt: string;
}

export interface PremiumCreditLedgerDto {
  id: string;
  credits: string;
  balanceBefore: string;
  balanceAfter: string;
  paymentIntentId: string;
  createdAt: string;
}
