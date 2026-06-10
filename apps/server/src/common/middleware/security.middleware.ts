import type { NextFunction, Request, Response } from "express";

import { HttpError } from "../errors/http-error.js";
import { API_PREFIX } from "../http/api-prefix.js";

const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_INPUT_DEPTH = 12;
const MAX_OBJECT_KEYS = 200;
const MAX_ARRAY_ITEMS = 500;
const MAX_STRING_LENGTH = 4096;
const SENSITIVE_ROUTE_PREFIXES = [`${API_PREFIX}/auth`, `${API_PREFIX}/wallet`, `${API_PREFIX}/bets`, `${API_PREFIX}/admin`];

export function securityMiddleware(req: Request, res: Response, next: NextFunction) {
  if (BODY_METHODS.has(req.method) && hasRequestBody(req) && !req.is("application/json")) {
    throw new HttpError(
      415,
      "UNSUPPORTED_CONTENT_TYPE",
      "Request content type must be application/json.",
    );
  }

  assertSafeInput(req.body);
  assertSafeInput(req.query);
  assertSafeInput(req.params);
  assertIdempotencyHeaderMatchesBody(req);

  if (isSensitiveRoute(req.path)) {
    res.setHeader("cache-control", "no-store");
    res.setHeader("pragma", "no-cache");
  }

  next();
}

export function isSensitiveRoute(path: string) {
  return SENSITIVE_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function hasRequestBody(req: Request) {
  const contentLength = Number(req.get("content-length") ?? 0);
  return contentLength > 0 || req.get("transfer-encoding") !== undefined;
}

function assertSafeInput(value: unknown, depth = 0): void {
  if (depth > MAX_INPUT_DEPTH) {
    throw unsafePayload("Request payload is nested too deeply.");
  }

  if (typeof value === "string") {
    if (value.length > MAX_STRING_LENGTH) {
      throw unsafePayload("Request payload contains a string that is too long.");
    }

    if (hasUnsafeControlCharacter(value)) {
      throw unsafePayload("Request payload contains invalid control characters.");
    }
    return;
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) {
      throw unsafePayload("Request payload contains too many array items.");
    }

    value.forEach((item) => assertSafeInput(item, depth + 1));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  if (!isPlainObject(value)) {
    throw unsafePayload("Request payload contains an unsupported object type.");
  }

  const entries = Object.entries(value);
  if (entries.length > MAX_OBJECT_KEYS) {
    throw unsafePayload("Request payload contains too many fields.");
  }

  for (const [key, nestedValue] of entries) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw unsafePayload("Request payload contains a forbidden field.");
    }
    assertSafeInput(nestedValue, depth + 1);
  }
}

function assertIdempotencyHeaderMatchesBody(req: Request) {
  const header = req.get("idempotency-key")?.trim();

  if (!header) {
    return;
  }

  if (header.length < 12 || header.length > 160 || !/^[a-zA-Z0-9._:-]+$/.test(header)) {
    throw new HttpError(400, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key header is invalid.");
  }

  if (!isPlainObject(req.body)) {
    return;
  }

  const bodyKey = req.body.idempotencyKey;

  if (bodyKey === undefined) {
    req.body.idempotencyKey = header;
    return;
  }

  if (bodyKey !== header) {
    throw new HttpError(
      409,
      "IDEMPOTENCY_KEY_MISMATCH",
      "Idempotency-Key header must match body idempotencyKey.",
    );
  }
}

function hasUnsafeControlCharacter(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if ((code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127) {
      return true;
    }
  }

  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function unsafePayload(message: string) {
  return new HttpError(400, "UNSAFE_REQUEST_PAYLOAD", message);
}
