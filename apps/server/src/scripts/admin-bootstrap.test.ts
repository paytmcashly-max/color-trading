import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const seedAdminScript = fileURLToPath(new URL("../../scripts/seed-admin.mjs", import.meta.url));

test("admin bootstrap rejects weak passwords before database access", () => {
  const result = runSeedAdmin({
    ADMIN_BOOTSTRAP_PASSWORD: "weak",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ADMIN_BOOTSTRAP_PASSWORD/);
});

test("admin bootstrap requires token in production before database access", () => {
  const result = runSeedAdmin({
    NODE_ENV: "production",
    ADMIN_BOOTSTRAP_PASSWORD: "Aa1!aa",
    ADMIN_BOOTSTRAP_TOKEN: "",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ADMIN_BOOTSTRAP_TOKEN/);
});

function runSeedAdmin(overrides: Record<string, string>) {
  return spawnSync(process.execPath, [seedAdminScript], {
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/color_trading",
      ADMIN_BOOTSTRAP_EMAIL: "admin@example.com",
      ADMIN_BOOTSTRAP_PASSWORD: "Aa1!aa",
      JWT_ACCESS_SECRET: "access-secret-for-tests-at-least-thirty-two-chars",
      JWT_REFRESH_SECRET: "refresh-secret-for-tests-at-least-thirty-two-chars",
      ...overrides,
    },
  });
}
