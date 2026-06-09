import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";

import { env } from "../config/env.js";
import { logger } from "../common/utils/logger.js";
import { getPrismaClient } from "../database/prisma.client.js";
import { getFraudService } from "../modules/fraud/fraud.module.js";
import { getObservability } from "../modules/observability/observability.module.js";
import { serializeRound } from "../modules/game/game.serializer.js";
import { configureRedisAdapter } from "./redis.adapter.js";
import { authenticateSocket, type SocketUserContext } from "./socket.auth.js";
import {
  initializeRealtimeEventBus,
  publishRealtimeEvent,
  subscribeToRealtimeEvents,
  type RealtimeEvent,
} from "./socket.events.js";

const SOCKET_RATE_LIMIT_WINDOW_MS = 10_000;
const SOCKET_RATE_LIMIT_MAX_EVENTS = 40;
const SOCKET_PING_INTERVAL_MS = 25_000;
const SOCKET_PING_TIMEOUT_MS = 20_000;
const activeUserSocketCounts = new Map<string, number>();

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.SOCKET_CORS_ORIGIN,
      credentials: true,
    },
    pingInterval: SOCKET_PING_INTERVAL_MS,
    pingTimeout: SOCKET_PING_TIMEOUT_MS,
    connectionStateRecovery: {
      maxDisconnectionDuration: 120_000,
      skipMiddlewares: false,
    },
    transports: ["websocket", "polling"],
  });

  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    void handleConnection(socket);
  });

  subscribeToRealtimeEvents((event) => {
    routeRealtimeEvent(io, event);
  });

  configureRedisAdapter(io).catch((error: unknown) => {
    publishRealtimeEvent("system:error", {
      code: "SOCKET_REDIS_ADAPTER_FAILED",
      message: "Socket.io Redis adapter failed to initialize.",
    });
    logger.warn("socket_redis_adapter_disabled", { error });
  });

  initializeRealtimeEventBus().catch((error: unknown) => {
    publishRealtimeEvent("system:error", {
      code: "REALTIME_EVENT_BUS_FAILED",
      message: "Realtime Redis event bus failed to initialize.",
    });
    logger.warn("realtime_event_bus_failed", { error });
  });

  return io;
}

async function handleConnection(socket: Socket) {
  installRateLimit(socket);

  const user = getSocketUser(socket);
  socket.join(`user:${user.userId}`);
  socket.join("system");

  if (user.role === "ADMIN") {
    socket.join("admin");
  }

  logger.info("socket_connected", {
    socketId: socket.id,
    userId: user.userId,
    recovered: socket.recovered,
  });
  incrementSocketGauge(1);
  incrementActiveUserGauge(user.userId, 1);

  socket.on("disconnect", (reason) => {
    logger.info("socket_disconnected", {
      socketId: socket.id,
      userId: user.userId,
      reason,
    });
    incrementSocketGauge(-1);
    incrementActiveUserGauge(user.userId, -1);
  });

  publishRealtimeEvent("user:joined", {
    socketId: socket.id,
    userId: user.userId,
  });

  await syncLatestState(socket);

  socket.on("round:join", async (roundId: unknown, ack?: (response: unknown) => void) => {
    if (!(await consumeSocketToken(socket, "round:join"))) {
      ack?.({ ok: false, error: "RATE_LIMITED" });
      return;
    }

    if (typeof roundId !== "string") {
      ack?.({ ok: false, error: "INVALID_ROUND_ID" });
      return;
    }

    const roundExists = await getPrismaClient().gameRound.findUnique({
      where: { id: roundId },
      select: { id: true },
    });

    if (!roundExists) {
      ack?.({ ok: false, error: "ROUND_NOT_FOUND" });
      return;
    }

    socket.join(`round:${roundId}`);
    ack?.({ ok: true, room: `round:${roundId}` });
  });

  socket.on("state:sync", async (ack?: (response: unknown) => void) => {
    if (!(await consumeSocketToken(socket, "state:sync"))) {
      ack?.({ ok: false, error: "RATE_LIMITED" });
      return;
    }

    const snapshot = await buildStateSnapshot(user.userId);
    socket.emit("system:sync", snapshot);
    ack?.({ ok: true, snapshot });
  });

  socket.emit("system:health", {
    status: "ok",
    socketId: socket.id,
    userId: user.userId,
    timestamp: new Date().toISOString(),
  });
}

async function syncLatestState(socket: Socket) {
  const user = getSocketUser(socket);
  const snapshot = await buildStateSnapshot(user.userId);

  if (snapshot.currentRound?.id) {
    socket.join(`round:${snapshot.currentRound.id}`);
  }

  socket.emit("system:sync", snapshot);

  if (snapshot.wallet) {
    socket.emit("user:balance_sync", {
      userId: user.userId,
      wallet: snapshot.wallet,
      syncedAt: snapshot.syncedAt,
    });
  }
}

async function buildStateSnapshot(userId: string) {
  const prisma = getPrismaClient();
  const [currentRound, wallet] = await Promise.all([
    prisma.gameRound.findFirst({
      where: {
        status: {
          in: ["INIT", "OPEN", "LOCKED", "RESOLVING"],
        },
      },
      orderBy: { startTime: "desc" },
    }),
    prisma.wallet.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        balanceCoins: true,
        ledgerVersion: true,
        status: true,
        updatedAt: true,
      },
    }),
  ]);

  return {
    currentRound: currentRound ? serializeRound(currentRound) : null,
    wallet: wallet
      ? {
          id: wallet.id,
          userId: wallet.userId,
          balanceCoins: wallet.balanceCoins.toString(),
          ledgerVersion: wallet.ledgerVersion.toString(),
          status: wallet.status,
          updatedAt: wallet.updatedAt.toISOString(),
        }
      : null,
    syncedAt: new Date().toISOString(),
  };
}

function routeRealtimeEvent(io: Server, event: RealtimeEvent) {
  const roundId = extractRoundId(event.payload);
  const userId = extractUserId(event.payload);

  if (event.name === "wallet:update" || event.name === "user:balance_sync") {
    if (userId) {
      io.to(`user:${userId}`).emit(event.name, event.payload);
    }
    io.to("admin").emit(event.name, event.payload);
    return;
  }

  if (event.name === "user:joined") {
    if (userId) {
      io.to(`user:${userId}`).emit(event.name, event.payload);
    }
    return;
  }

  if (event.name.startsWith("fraud:")) {
    io.to("admin").emit(event.name, event.payload);
    return;
  }

  if (event.name.startsWith("observability:")) {
    io.to("admin").emit(event.name, event.payload);
    return;
  }

  if (event.name === "bet:placed") {
    if (roundId) {
      io.to(`round:${roundId}`).emit(event.name, event.payload);
    }
    io.to("admin").emit(event.name, event.payload);
    return;
  }

  if (event.name.startsWith("round:")) {
    if (roundId) {
      io.to(`round:${roundId}`).emit(event.name, event.payload);
    }

    if (event.name === "round:created" || event.name === "round:completed") {
      io.emit(event.name, event.payload);
    } else {
      io.to("admin").emit(event.name, event.payload);
    }
    return;
  }

  io.emit(event.name, event.payload);
}

function installRateLimit(socket: Socket) {
  socket.data.rateLimit = {
    windowStartedAt: Date.now(),
    tokens: SOCKET_RATE_LIMIT_MAX_EVENTS,
  };
}

async function consumeSocketToken(socket: Socket, eventName: string) {
  const user = getSocketUser(socket);
  const redisAllowed = await getFraudService().enforceSocketEventLimit(user.userId, {
    socketId: socket.id,
    eventName,
  });

  if (!redisAllowed) {
    socket.emit("system:error", {
      code: "SOCKET_RATE_LIMITED",
      message: "Too many socket events.",
    });
    return false;
  }

  const now = Date.now();
  const state = socket.data.rateLimit as
    | { windowStartedAt: number; tokens: number }
    | undefined;

  if (!state || now - state.windowStartedAt > SOCKET_RATE_LIMIT_WINDOW_MS) {
    socket.data.rateLimit = {
      windowStartedAt: now,
      tokens: SOCKET_RATE_LIMIT_MAX_EVENTS - 1,
    };
    return true;
  }

  if (state.tokens <= 0) {
    socket.emit("system:error", {
      code: "SOCKET_RATE_LIMITED",
      message: "Too many socket events.",
    });
    void getFraudService().recordSocketRateLimit(user.userId, {
      socketId: socket.id,
      eventName,
      limiter: "in_memory_socket_guard",
    });
    return false;
  }

  state.tokens -= 1;
  return true;
}

function getSocketUser(socket: Socket) {
  return socket.data.user as SocketUserContext;
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

  if (isRecord(payload.bet) && typeof payload.bet.roundId === "string") {
    return payload.bet.roundId;
  }

  return null;
}

function extractUserId(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }

  if (typeof payload.userId === "string") {
    return payload.userId;
  }

  if (isRecord(payload.bet) && typeof payload.bet.userId === "string") {
    return payload.bet.userId;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function incrementSocketGauge(delta: number) {
  const metrics = getObservability().metrics;
  const current = metrics.getGauge("active_sockets");
  const next = Math.max(0, current + delta);
  metrics.setGauge("active_sockets", next);

  if (next > 10_000) {
    getObservability().alerts.send({
      type: "SOCKET_SPIKE",
      severity: "HIGH",
      message: "Active socket count exceeded MVP threshold.",
      metadata: { activeSockets: next },
    });
  }
}

function incrementActiveUserGauge(userId: string, delta: number) {
  const current = activeUserSocketCounts.get(userId) ?? 0;
  const next = Math.max(0, current + delta);

  if (next === 0) {
    activeUserSocketCounts.delete(userId);
  } else {
    activeUserSocketCounts.set(userId, next);
  }

  getObservability().metrics.setGauge("active_users", activeUserSocketCounts.size);
}
