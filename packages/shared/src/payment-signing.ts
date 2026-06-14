import crypto from "node:crypto";

export function signPayload(payload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyPayloadSignature(payload: string, signature: string, secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) {
    return false;
  }

  const expected = Buffer.from(signPayload(payload, secret), "hex");
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

export function createSignedToken(input: {
  payload: Record<string, unknown>;
  secret: string;
}) {
  const body = Buffer.from(canonicalJson(input.payload)).toString("base64url");
  return `${body}.${signPayload(body, input.secret)}`;
}

export function verifySignedToken<T>(token: string, secret: string): T {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra || !verifyPayloadSignature(body, signature, secret)) {
    throw new Error("INVALID_SIGNED_TOKEN");
  }

  return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }

  return value;
}
