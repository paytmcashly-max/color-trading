import assert from "node:assert/strict";
import { test } from "node:test";

const { decodeCreatedAtIdCursor, encodeCreatedAtIdCursor, pageInfo, readPagination } = await import("./pagination.js");

test("createdAt+id pagination cursor round-trips", () => {
  const createdAt = new Date("2026-01-01T00:00:00.000Z");
  const cursor = encodeCreatedAtIdCursor(createdAt, "11111111-1111-4111-8111-111111111111");
  const decoded = decodeCreatedAtIdCursor(cursor);

  assert.equal(decoded?.createdAt.toISOString(), createdAt.toISOString());
  assert.equal(decoded?.id, "11111111-1111-4111-8111-111111111111");
});

test("page info reports a stable next cursor and hasMore", () => {
  const items = [
    { id: "c", createdAt: new Date("2026-01-01T00:00:00.000Z") },
    { id: "b", createdAt: new Date("2026-01-01T00:00:00.000Z") },
    { id: "a", createdAt: new Date("2026-01-01T00:00:00.000Z") },
  ];
  const page = pageInfo(items, 2, (item) => encodeCreatedAtIdCursor(item.createdAt, item.id));

  assert.deepEqual(page.items.map((item) => item.id), ["c", "b"]);
  assert.equal(page.pageInfo.hasMore, true);
  assert.equal(decodeCreatedAtIdCursor(page.pageInfo.nextCursor ?? "")?.id, "b");
});

test("invalid cursor returns a clean pagination error", () => {
  assert.throws(
    () => readPagination({ query: { cursor: "not-a-valid-cursor" } } as never),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "INVALID_PAGINATION_CURSOR",
  );
});

test("pagination limit must be between 1 and 100", () => {
  for (const limit of ["0", "-1", "101", "nope"]) {
    assert.throws(
      () => readPagination({ query: { limit } } as never),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "INVALID_PAGINATION_LIMIT",
    );
  }
});
