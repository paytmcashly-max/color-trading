import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { fetchMe } from "./api-client";
import { useAuthStore } from "../store/auth-store";

const user = {
  id: "user-1",
  email: "user@example.com",
  displayName: "User",
  role: "USER" as const,
  status: "ACTIVE" as const,
  emailVerifiedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

afterEach(() => {
  useAuthStore.getState().clearSession();
});

test("API retries once with a refreshed in-memory access token after 401", async () => {
  const calls: Array<{ url: string; authorization: string | null }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, authorization: headers.get("authorization") });

    if (calls.length === 1) {
      return jsonResponse({ success: false, message: "expired", data: null }, 401);
    }
    if (url.endsWith("/auth/refresh")) {
      return jsonResponse({
        success: true,
        message: "refreshed",
        data: {
          user,
          tokens: { accessToken: "new-token", tokenType: "Bearer", expiresInSeconds: 900 },
        },
      });
    }
    return jsonResponse({ success: true, message: "ok", data: { user } });
  };

  try {
    const result = await fetchMe("expired-token");
    assert.equal(result.user.id, user.id);
    assert.deepEqual(calls.map((call) => call.authorization), [
      "Bearer expired-token",
      null,
      "Bearer new-token",
    ]);
    assert.equal(useAuthStore.getState().tokens?.accessToken, "new-token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
