import { verifyPayloadSignature } from "@color-trading/shared/payment-signing";

export function verifyInternalPaymentEventSignature(input: {
  rawBody: Buffer | undefined;
  signature: string | undefined;
  timestamp: string | undefined;
  secret: string | undefined;
  now?: number;
}) {
  if (!input.rawBody || !input.signature || !input.timestamp || !input.secret) {
    return false;
  }

  const timestampNumber = Number(input.timestamp);
  if (
    !Number.isFinite(timestampNumber) ||
    Math.abs((input.now ?? Date.now()) - timestampNumber) > 5 * 60 * 1000
  ) {
    return false;
  }

  return verifyPayloadSignature(
    `${input.timestamp}.${input.rawBody.toString("utf8")}`,
    input.signature,
    input.secret,
  );
}
