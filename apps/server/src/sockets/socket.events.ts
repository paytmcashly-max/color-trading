import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import type { Redis } from "ioredis";

import { logger } from "../common/utils/logger.js";
import { getRedisClient } from "../database/redis.client.js";

export type RealtimeEventName =
  | "round:start"
  | "round:created"
  | "round:state"
  | "round:timer"
  | "round:lock"
  | "round:locked"
  | "round:result"
  | "round:completed"
  | "bet:placed"
  | "wallet:update"
  | "user:joined"
  | "user:balance_sync"
  | "system:health"
  | "system:sync"
  | "system:error"
  | "fraud:alert"
  | "fraud:high_risk_user"
  | "fraud:rate_limit_triggered"
  | "observability:alert";

export interface RealtimeEvent<TPayload = unknown> {
  id: string;
  name: RealtimeEventName;
  payload: TPayload;
  createdAt: string;
  source: string;
}

const REALTIME_CHANNEL = "realtime:events";
const EVENT_DEDUPE_LIMIT = 5000;
const realtimeEmitter = new EventEmitter();
const seenEventIds = new Set<string>();
const seenEventOrder: string[] = [];
const sourceId = crypto.randomUUID();

let subscribed = false;

export function publishRealtimeEvent<TPayload>(
  name: RealtimeEventName,
  payload: TPayload,
) {
  const event: RealtimeEvent<TPayload> = {
    id: crypto.randomUUID(),
    name,
    payload,
    createdAt: new Date().toISOString(),
    source: sourceId,
  };

  void processRealtimeEvent(event);
  void publishToRedis(event);
}

export function subscribeToRealtimeEvents(listener: (event: RealtimeEvent) => void) {
  realtimeEmitter.on("realtime-event", listener);

  return () => {
    realtimeEmitter.off("realtime-event", listener);
  };
}

export async function initializeRealtimeEventBus() {
  if (subscribed) {
    return;
  }

  const redis = getRedisClient();

  if (!redis) {
    subscribed = true;
    return;
  }

  const subscriber = redis.duplicate();
  await connectIfNeeded(subscriber);
  await subscriber.subscribe(REALTIME_CHANNEL);

  subscriber.on("message", (_channel, message) => {
    try {
      const event = JSON.parse(message) as RealtimeEvent;
      void processRealtimeEvent(event);
    } catch (error) {
      publishRealtimeEvent("system:error", {
        code: "REALTIME_EVENT_PARSE_FAILED",
        message: "Failed to parse realtime Redis event.",
      });
      logger.warn("realtime_event_parse_failed", { error });
    }
  });

  subscribed = true;
}

async function publishToRedis(event: RealtimeEvent) {
  const redis = getRedisClient();

  if (!redis) {
    return;
  }

  await connectIfNeeded(redis);
  await Promise.all([
    redis.publish(REALTIME_CHANNEL, JSON.stringify(event)),
    cacheEventState(redis, event),
  ]);

  logger.debug("realtime_event_published", {
    eventId: event.id,
    eventName: event.name,
    source: event.source,
  });
}

async function processRealtimeEvent(event: RealtimeEvent) {
  if (seenEventIds.has(event.id)) {
    return;
  }

  rememberEvent(event.id);
  realtimeEmitter.emit("realtime-event", event);
}

function rememberEvent(eventId: string) {
  seenEventIds.add(eventId);
  seenEventOrder.push(eventId);

  while (seenEventOrder.length > EVENT_DEDUPE_LIMIT) {
    const oldestId = seenEventOrder.shift();

    if (oldestId) {
      seenEventIds.delete(oldestId);
    }
  }
}

async function cacheEventState(redis: Redis, event: RealtimeEvent) {
  if (event.name.startsWith("round:")) {
    const roundId = extractRoundId(event.payload);

    if (roundId) {
      await redis.set(`round:${roundId}:state`, JSON.stringify(event.payload), "EX", 180);
    }

    if (
      event.name === "round:start" ||
      event.name === "round:created" ||
      event.name === "round:state" ||
      event.name === "round:timer"
    ) {
      await redis.set("current_round", JSON.stringify(event.payload), "EX", 180);
    }
  }

  if (event.name === "wallet:update" || event.name === "user:balance_sync") {
    const userId = extractUserId(event.payload);

    if (userId) {
      await redis.set(`user:${userId}:wallet_cache`, JSON.stringify(event.payload), "EX", 300);
    }
  }
}

function extractRoundId(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }

  if (typeof payload.roundId === "string") {
    return payload.roundId;
  }

  if (isRecord(payload.round) && typeof payload.round.id === "string") {
    return payload.round.id;
  }

  return null;
}

function extractUserId(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }

  return typeof payload.userId === "string" ? payload.userId : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function connectIfNeeded(redis: Redis) {
  if (redis.status === "ready") {
    return;
  }

  if (redis.status === "wait") {
    await redis.connect();
  }
}
