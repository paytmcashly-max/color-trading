import assert from "node:assert/strict";
import { test } from "node:test";

const { registerSchema } = await import("./auth.validators.js");

test("public registration rejects ADMIN role injection", () => {
  const result = registerSchema.safeParse({
    email: "user@example.com",
    password: "Aa1!aa",
    role: "ADMIN",
  });

  assert.equal(result.success, false);
});

test("public registration accepts only user-owned fields", () => {
  const result = registerSchema.safeParse({
    email: "user@example.com",
    password: "Aa1!aa",
    displayName: "User",
  });

  assert.equal(result.success, true);
});

test("public registration enforces 6-12 character complexity", () => {
  const tooLong = registerSchema.safeParse({
    email: "user@example.com",
    password: "Aa1!aa-too-long",
  });
  const missingSymbol = registerSchema.safeParse({
    email: "user@example.com",
    password: "Aa1111",
  });
  const valid = registerSchema.safeParse({
    email: "user@example.com",
    password: "Aa1!aa",
  });

  assert.equal(tooLong.success, false);
  assert.equal(missingSymbol.success, false);
  assert.equal(valid.success, true);
});
