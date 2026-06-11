import type { Request } from "express";

import { HttpError } from "../errors/http-error.js";

export interface PaginationInput {
  limit: number;
  cursor?: string;
}

export interface PageInfo {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export function readPagination(req: Request, defaultLimit = DEFAULT_LIMIT): PaginationInput {
  const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const rawCursor = Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor;
  const parsedLimit = typeof rawLimit === "string" ? Number(rawLimit) : defaultLimit;
  const cursor = typeof rawCursor === "string" && rawCursor.trim() ? rawCursor.trim() : undefined;

  if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_LIMIT) {
    throw new HttpError(400, "INVALID_PAGINATION_LIMIT", `limit must be an integer between 1 and ${MAX_LIMIT}.`);
  }

  if (cursor && !decodeCreatedAtIdCursor(cursor)) {
    throw new HttpError(400, "INVALID_PAGINATION_CURSOR", "Pagination cursor is invalid.");
  }

  return {
    limit: parsedLimit,
    cursor,
  };
}

export function pageInfo<TItem>(
  items: TItem[],
  limit: number,
  cursorOf: (item: TItem) => string,
) {
  const visibleItems = items.slice(0, limit);
  const lastVisibleItem = visibleItems.at(-1);

  return {
    items: visibleItems,
    pageInfo: {
      limit,
      nextCursor: items.length > limit && lastVisibleItem ? cursorOf(lastVisibleItem) : null,
      hasMore: items.length > limit,
    },
  };
}

export function encodeCreatedAtIdCursor(createdAt: Date, id: string) {
  return Buffer.from(
    JSON.stringify({
      createdAt: createdAt.toISOString(),
      id,
    }),
    "utf8",
  ).toString("base64url");
}

export function decodeCreatedAtIdCursor(cursor: string | undefined) {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      createdAt?: unknown;
      id?: unknown;
    };

    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") {
      return null;
    }

    const createdAt = new Date(parsed.createdAt);

    if (Number.isNaN(createdAt.getTime())) {
      return null;
    }

    return {
      createdAt,
      id: parsed.id,
    };
  } catch {
    return null;
  }
}

export function createdAtIdDescWhere(cursor: string | undefined) {
  const decoded = decodeCreatedAtIdCursor(cursor);

  if (!decoded) {
    return {};
  }

  return {
    OR: [
      {
        createdAt: {
          lt: decoded.createdAt,
        },
      },
      {
        createdAt: decoded.createdAt,
        id: {
          lt: decoded.id,
        },
      },
    ],
  };
}
