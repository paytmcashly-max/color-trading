import assert from "node:assert/strict";
import test from "node:test";

import { HttpError } from "../../common/errors/http-error.js";

process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = "test-access-secret-that-is-at-least-32-characters";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-that-is-at-least-32-characters";

const { closedComplianceFlags, realMoneyComplianceGuard } = await import("./real-money.guard.js");

test("real-money routes remain disabled unless every compliance flag is open", () => {
  assert.ok(closedComplianceFlags().length > 0);
  assert.throws(
    () => realMoneyComplianceGuard({} as never, {} as never, (() => undefined) as never),
    (error: unknown) => error instanceof HttpError && error.code === "REAL_MONEY_DISABLED",
  );
});
