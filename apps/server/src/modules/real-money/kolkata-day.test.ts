import assert from "node:assert/strict";
import test from "node:test";

import { kolkataDayBounds } from "./kolkata-day.js";

test("Kolkata daily limits reset at local midnight", () => {
  const { start, end } = kolkataDayBounds(new Date("2026-06-14T18:45:00.000Z"));
  assert.equal(start.toISOString(), "2026-06-14T18:30:00.000Z");
  assert.equal(end.toISOString(), "2026-06-15T18:30:00.000Z");
});
