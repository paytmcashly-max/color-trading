import assert from "node:assert/strict";
import { test } from "node:test";

import { reconnectSocketWithToken } from "./socket";

test("socket token refresh disconnects before reconnecting with the new token", () => {
  const calls: string[] = [];
  const socket = {
    auth: { token: "old-token" },
    io: { opts: { reconnection: true } },
    disconnect() {
      calls.push("disconnect");
      return this;
    },
    connect() {
      calls.push(`connect:${(this.auth as { token: string }).token}`);
      return this;
    },
  };

  reconnectSocketWithToken(socket as never, "new-token");

  assert.deepEqual(calls, ["disconnect", "connect:new-token"]);
  assert.deepEqual(socket.auth, { token: "new-token" });
  assert.equal(socket.io.opts.reconnection, true);
});
