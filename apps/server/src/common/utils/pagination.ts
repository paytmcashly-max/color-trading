import type { Request } from "express";

export interface PaginationInput {
  limit: number;
  cursor?: string;
}

export interface PageInfo {
  limit: number;
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export function readPagination(req: Request, defaultLimit = DEFAULT_LIMIT): PaginationInput {
  const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const rawCursor = Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor;
  const parsedLimit = typeof rawLimit === "string" ? Number(rawLimit) : defaultLimit;
  const limit = Number.isSafeInteger(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), MAX_LIMIT)
    : defaultLimit;

  return {
    limit,
    cursor: typeof rawCursor === "string" && rawCursor.trim() ? rawCursor.trim() : undefined,
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
    },
  };
}
