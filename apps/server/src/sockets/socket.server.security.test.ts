import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(new URL("./socket.server.ts", import.meta.url), "utf8");

test("initial sync and sensitive socket handlers require live-session authorization", () => {
  for (const functionName of [
    "syncLatestState",
    "joinRequestedRoom",
    "joinRoundRoom",
    "leaveRoundRoom",
    "handlePlaceBet",
  ]) {
    const functionBody = readFunctionBody(source, functionName);
    assert.match(
      functionBody,
      /authorizeSensitiveSocketEvent\(socket/,
      `${functionName} must revalidate the socket session`,
    );
  }

  for (const eventName of [
    "state:sync",
    "join:room",
    "round:join",
    "join:round",
    "join_round",
    "leave_round",
    "bet:place",
    "place_bet",
  ]) {
    assert.equal(source.includes(`"${eventName}"`), true, `${eventName} handler must remain registered`);
  }
});

function readFunctionBody(file: string, functionName: string) {
  const start = file.indexOf(`async function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} must exist`);
  const nextFunction = file.indexOf("\nasync function ", start + 1);
  return file.slice(start, nextFunction === -1 ? file.length : nextFunction);
}
