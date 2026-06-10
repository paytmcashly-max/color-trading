import assert from "node:assert/strict";
import { test } from "node:test";

const { registerSchema } = await import("./auth.validators.js");

test("public registration rejects ADMIN role injection", () => {
  const result = registerSchema.safeParse({
    email: "user@example.com",
    password: "StrongPass1!",
    role: "ADMIN",
  });

  assert.equal(result.success, false);
});

test("public registration accepts only user-owned fields", () => {
  const result = registerSchema.safeParse({
    email: "user@example.com",
    password: "StrongPass1!",
    displayName: "User",
  });

  assert.equal(result.success, true);
});

test("public registration enforces 12-72 character complexity", () => {
  const tooShort = registerSchema.safeParse({
    email: "user@example.com",
    password: "Aa1!short",
  });
  const tooLong = registerSchema.safeParse({
    email: "user@example.com",
    password: `Aa1!${"a".repeat(69)}`,
  });
  const missingSymbol = registerSchema.safeParse({
    email: "user@example.com",
    password: "StrongPass123",
  });
  const valid = registerSchema.safeParse({
    email: "user@example.com",
    password: "StrongPass1!",
  });

  assert.equal(tooShort.success, false);
  assert.equal(tooLong.success, false);
  assert.equal(missingSymbol.success, false);
  assert.equal(valid.success, true);
});
