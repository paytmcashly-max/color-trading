import { publishRealtimeEvent, type RealtimeEventName } from "../../sockets/socket.events.js";
import { logger } from "../../common/utils/logger.js";

export function publishGameEvent<TPayload>(name: RealtimeEventName, payload: TPayload) {
  logger.info("game_event_published", {
    eventName: name,
    ...extractEventLogContext(payload),
  });
  publishRealtimeEvent(name, payload);
}

function extractEventLogContext(payload: unknown) {
  if (!isRecord(payload)) {
    return {};
  }

  return {
    userId: typeof payload.userId === "string" ? payload.userId : undefined,
    roundId: typeof payload.roundId === "string" ? payload.roundId : extractNestedRoundId(payload),
  };
}

function extractNestedRoundId(payload: Record<string, unknown>) {
  if (isRecord(payload.round) && typeof payload.round.id === "string") {
    return payload.round.id;
  }

  if (isRecord(payload.bet) && typeof payload.bet.roundId === "string") {
    return payload.bet.roundId;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
