import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";

import { env } from "../config/env.js";
import { HttpError } from "../common/errors/http-error.js";
import { logger } from "../common/utils/logger.js";
import { getPrismaClient } from "../database/prisma.client.js";
import { getFraudService } from "../modules/fraud/fraud.module.js";
import { getObservability } from "../modules/observability/observability.module.js";
import { serializeRound } from "../modules/game/game.serializer.js";
import { placeBetSchema } from "../modules/game/dto/place-bet.dto.js";
import { GameRepository } from "../modules/game/repositories/game.repository.js";
import { BetService } from "../modules/game/services/bet.service.js";
import { WalletRepository } from "../modules/wallet/wallet.repository.js";
import { WalletService } from "../modules/wallet/wallet.service.js";
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
const GLOBAL_GAME_ROOM = "game:global";
const activeUserSocketCounts = new Map<string, number>();
const prisma = getPrismaClient();
const gameRepository = new GameRepository(prisma);
const walletService = new WalletService(new WalletRepository(prisma));
const betService = new BetService(gameRepository, walletService);

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
  socket.join(GLOBAL_GAME_ROOM);
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

  socket.on("join:room", (payload: unknown, ack?: (response: unknown) => void) => {
    void joinRequestedRoom(socket, payload, ack);
  });

  socket.on("round:join", (roundId: unknown, ack?: (response: unknown) => void) => {
    void joinRoundRoom(socket, roundId, ack, "round:join");
  });

  socket.on("join:round", (roundId: unknown, ack?: (response: unknown) => void) => {
    void joinRoundRoom(socket, roundId, ack, "join:round");
  });

  socket.on("bet:place", async (payload: unknown, ack?: (response: unknown) => void) => {
    if (!(await consumeSocketToken(socket, "bet:place"))) {
      ack?.({ ok: false, error: "RATE_LIMITED" });
      return;
    }

    const parsed = placeBetSchema.safeParse(payload);

    if (!parsed.success) {
      ack?.({
        ok: false,
        error: "INVALID_BET_PAYLOAD",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const result = await betService.placeBet(user.userId, parsed.data);
      ack?.({ ok: true, ...result });
    } catch (error) {
      const response = toSocketError(error);
      socket.emit("system:error", response);
      ack?.({ ok: false, ...response });
    }
  });

  socket.on("state:sync", async (ack?: (response: unknown) => void) => {
    if (!(await consumeSocketToken(socket, "state:sync"))) {
      ack?.({ ok: false, error: "RATE_LIMITED" });
      return;
    }

    const snapshot = await buildStateSnapshot(user.userId);
    socket.emit("system:sync", snapshot);
    emitRoundStateSnapshot(socket, snapshot);
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
  emitRoundStateSnapshot(socket, snapshot);

  if (snapshot.wallet) {
    socket.emit("user:balance_sync", {
      userId: user.userId,
      wallet: snapshot.wallet,
      syncedAt: snapshot.syncedAt,
    });
  }
}

async function joinRequestedRoom(
  socket: Socket,
  payload: unknown,
  ack?: (response: unknown) => void,
) {
  if (!(await consumeSocketToken(socket, "join:room"))) {
    ack?.({ ok: false, error: "RATE_LIMITED" });
    return;
  }

  const roomName = parseRoomName(payload);

  if (roomName !== "game" && roomName !== GLOBAL_GAME_ROOM) {
    ack?.({ ok: false, error: "ROOM_NOT_ALLOWED" });
    return;
  }

  const alreadyJoined = socket.rooms.has(GLOBAL_GAME_ROOM);
  if (!alreadyJoined) {
    socket.join(GLOBAL_GAME_ROOM);
  }

  const user = getSocketUser(socket);
  const snapshot = await buildStateSnapshot(user.userId);

  if (!alreadyJoined) {
    socket.emit("system:sync", snapshot);
    emitRoundStateSnapshot(socket, snapshot);
  }

  ack?.({
    ok: true,
    room: GLOBAL_GAME_ROOM,
    snapshot,
  });
}

async function joinRoundRoom(
  socket: Socket,
  roundId: unknown,
  ack: ((response: unknown) => void) | undefined,
  eventName: string,
) {
  if (!(await consumeSocketToken(socket, eventName))) {
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
        depositBalance: true,
        winningBalance: true,
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
          depositBalance: wallet.depositBalance.toString(),
          winningBalance: wallet.winningBalance.toString(),
          totalBalance: (wallet.depositBalance + wallet.winningBalance).toString(),
          ledgerVersion: wallet.ledgerVersion.toString(),
          status: wallet.status,
          updatedAt: wallet.updatedAt.toISOString(),
        }
      : null,
    syncedAt: new Date().toISOString(),
  };
}

function routeRealtimeEvent(io: Server, event: RealtimeEvent) {
  const userId = extractUserId(event.payload);

  if (event.name === "wallet:update" || event.name === "user:balance_sync") {
    if (userId) {
      io.to(`user:${userId}`).to("admin").emit(event.name, event.payload);
      return;
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
    io.to(GLOBAL_GAME_ROOM).to("admin").emit(event.name, event.payload);
    return;
  }

  if (event.name.startsWith("round:")) {
    io.to(GLOBAL_GAME_ROOM).to("admin").emit(event.name, event.payload);
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

function parseRoomName(payload: unknown) {
  if (typeof payload === "string") {
    return payload;
  }

  if (isRecord(payload) && typeof payload.room === "string") {
    return payload.room;
  }

  return null;
}

function emitRoundStateSnapshot(
  socket: Socket,
  snapshot: Awaited<ReturnType<typeof buildStateSnapshot>>,
) {
  socket.emit("round:state", {
    round: snapshot.currentRound,
    remainingSeconds: snapshot.currentRound ? calculateRemainingSeconds(snapshot.currentRound) : 0,
    syncedAt: snapshot.syncedAt,
  });
}

function toSocketError(error: unknown) {
  if (error instanceof HttpError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  logger.error("socket_event_failed", { error });
  return {
    code: "SOCKET_EVENT_FAILED",
    message: "Realtime request failed.",
  };
}

function calculateRemainingSeconds(round: { status: string; lockTime: string; endTime: string }) {
  const target = round.status === "OPEN" ? round.lockTime : round.endTime;
  return Math.max(0, Math.ceil((new Date(target).getTime() - Date.now()) / 1000));
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
