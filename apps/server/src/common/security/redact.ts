const REDACTED = "[REDACTED]";

const SENSITIVE_KEY_PATTERN =
  /^(authorization|cookie|password|passwordHash|token|accessToken|refreshToken|refreshTokenHash|secret|jwt|idempotencyKey|seedReveal|ADMIN_PASSWORD|ADMIN_BOOTSTRAP_PASSWORD|ADMIN_BOOTSTRAP_TOKEN|JWT_SECRET|JWT_ACCESS_SECRET|JWT_REFRESH_SECRET|COOKIE_SECRET|ROUND_SEED_ENCRYPTION_KEY|DATABASE_URL|REDIS_URL)$/i;

export function redactSensitiveData<TValue>(value: TValue): TValue {
  return redactValue(value) as TValue;
}

export function isSensitiveLogKey(key: string) {
  return SENSITIVE_KEY_PATTERN.test(key);
}

function redactValue(value: unknown, key?: string): unknown {
  if (key && isSensitiveLogKey(key)) {
    return REDACTED;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([nestedKey, nestedValue]) => [
        nestedKey,
        redactValue(nestedValue, nestedKey),
      ]),
    );
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
