import assert from "node:assert/strict";
import { test } from "node:test";

const { decodeCreatedAtIdCursor, encodeCreatedAtIdCursor } = await import("./pagination.js");

test("createdAt+id pagination cursor round-trips", () => {
  const createdAt = new Date("2026-01-01T00:00:00.000Z");
  const cursor = encodeCreatedAtIdCursor(createdAt, "11111111-1111-4111-8111-111111111111");
  const decoded = decodeCreatedAtIdCursor(cursor);

  assert.equal(decoded?.createdAt.toISOString(), createdAt.toISOString());
  assert.equal(decoded?.id, "11111111-1111-4111-8111-111111111111");
});
