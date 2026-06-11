import type { Server as HttpServer } from "node:http";
import type {
  ClientToServerEventPayloads,
  JoinRoundAck,
  LeaveRoundAck,
  PlaceBetAck,
  ResultDeclaredEvent,
  RoundUpdateEvent,
  ServerToClientEventName,
  ServerToClientEventPayloads,
  WalletUpdateEvent,
} from "@color-trading/shared";
import { Server, type Socket } from "socket.io";

import { env } from "../config/env.js";
import { HttpError } from "../common/errors/http-error.js";
import { logger } from "../common/utils/logger.js";
import { getPrismaClient } from "../database/prisma.client.js";
import { getFraudService } from "../modules/fraud/fraud.module.js";
import { getObservability } from "../modules/observability/observability.module.js";
import { BetRepository } from "../modules/bet/repositories/bet.repository.js";
import { BetService } from "../modules/bet/services/bet.service.js";
import { serializeRound } from "../modules/game/game.serializer.js";
import { placeBetSchema } from "../modules/bet/dto/place-bet.dto.js";
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
import { authorizeSocketSession } from "./socket.session.js";

const SOCKET_RATE_LIMIT_WINDOW_MS = 10_000;
const SOCKET_RATE_LIMIT_MAX_EVENTS = 40;
const SOCKET_PING_INTERVAL_MS = 25_000;
const SOCKET_PING_TIMEOUT_MS = 20_000;
const GLOBAL_GAME_ROOM = "game:global";
const activeUserSocketCounts = new Map<string, number>();
const prisma = getPrismaClient();
const walletService = new WalletService(new WalletRepository(prisma));
const betService = new BetService(new BetRepository(prisma), walletService);

export async function createSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.SOCKET_ALLOWED_ORIGINS,
      credentials: true,
      methods: ["GET", "POST"],
    },
    maxHttpBufferSize: 256 * 1024,
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

  await initializeRedisRealtime(io);

  return io;
}

async function initializeRedisRealtime(io: Server) {
  try {
    await configureRedisAdapter(io);
    await initializeRealtimeEventBus();
  } catch (error) {
    publishRealtimeEvent("system:error", {
      code: "REALTIME_REDIS_INITIALIZATION_FAILED",
      message: "Realtime Redis dependencies failed to initialize.",
    });

    if (env.NODE_ENV === "production" || env.NODE_ENV === "staging") {
      logger.error("realtime_redis_initialization_failed", { error });
      throw error;
    }

    logger.warn("realtime_redis_local_fallback_enabled", { error });
  }
}

async function handleConnection(socket: Socket) {
  installRateLimit(socket);

  const user = getSocketUser(socket);

  if (!(await authorizeSensitiveSocketEvent(socket))) {
    return;
  }

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

  socket.on(
    "join_round",
    (payload: ClientToServerEventPayloads["join_round"], ack?: (response: JoinRoundAck) => void) => {
      void joinRoundRoom(socket, payload, asUnknownAck(ack), "join_round");
    },
  );

  socket.on(
    "leave_round",
    (payload: ClientToServerEventPayloads["leave_round"], ack?: (response: LeaveRoundAck) => void) => {
      void leaveRoundRoom(socket, payload, ack);
    },
  );

  socket.on("bet:place", async (payload: unknown, ack?: (response: unknown) => void) => {
    await handlePlaceBet(socket, payload, ack, "bet:place");
  });

  socket.on(
    "place_bet",
    async (
      payload: ClientToServerEventPayloads["place_bet"],
      ack?: (response: PlaceBetAck) => void,
    ) => {
      await handlePlaceBet(socket, payload, asUnknownAck(ack), "place_bet");
    },
  );

  socket.on("state:sync", async (ack?: (response: unknown) => void) => {
    if (!(await authorizeSensitiveSocketEvent(socket, ack))) {
      return;
    }

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
  if (!(await authorizeSensitiveSocketEvent(socket))) {
    return;
  }

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
    emitContractEvent(socket, "wallet_update", {
      userId: user.userId,
      wallet: snapshot.wallet,
    });
  }
}

async function joinRequestedRoom(
  socket: Socket,
  payload: unknown,
  ack?: (response: unknown) => void,
) {
  if (!(await authorizeSensitiveSocketEvent(socket, ack))) {
    return;
  }

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
  if (!(await authorizeSensitiveSocketEvent(socket, ack))) {
    return;
  }

  if (!(await consumeSocketToken(socket, eventName))) {
    ack?.({ ok: false, error: "RATE_LIMITED" });
    return;
  }

  const parsedRoundId = parseRoundId(roundId);

  if (!parsedRoundId) {
    ack?.({ ok: false, error: "INVALID_ROUND_ID" });
    return;
  }

  const roundExists = await getPrismaClient().gameRound.findUnique({
    where: { id: parsedRoundId },
    select: { id: true },
  });

  if (!roundExists) {
    ack?.({ ok: false, error: "ROUND_NOT_FOUND" });
    return;
  }

  const room = `round:${parsedRoundId}`;
  socket.join(room);
  const snapshot = await buildStateSnapshot(getSocketUser(socket).userId);
  const roundSnapshot = buildRoundUpdatePayload(snapshot);
  emitContractEvent(socket, "round_update", roundSnapshot);
  ack?.({ ok: true, data: { room, snapshot: roundSnapshot }, room, snapshot: roundSnapshot });
}

async function leaveRoundRoom(
  socket: Socket,
  payload: unknown,
  ack?: (response: LeaveRoundAck) => void,
) {
  if (!(await authorizeSensitiveSocketEvent(socket, asUnknownAck(ack)))) {
    return;
  }

  if (!(await consumeSocketToken(socket, "leave_round"))) {
    ack?.({ ok: false, error: "RATE_LIMITED" });
    return;
  }

  const roundId = parseRoundId(payload);

  if (!roundId) {
    ack?.({ ok: false, error: "INVALID_ROUND_ID" });
    return;
  }

  const room = `round:${roundId}`;
  await socket.leave(room);
  ack?.({ ok: true, data: { room } });
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
          availableBalance: (wallet.depositBalance + wallet.winningBalance).toString(),
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
      emitContractEvent(
        io.to(`user:${userId}`),
        "wallet_update",
        event.payload as WalletUpdateEvent,
      );
      return;
    }
    io.to("admin").emit(event.name, event.payload);
    return;
  }

  if (event.name === "user:suspended") {
    if (userId) {
      io.to(`user:${userId}`).emit(event.name, event.payload);
      io.in(`user:${userId}`).disconnectSockets(true);
      io.to("admin").emit(event.name, event.payload);
    }
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

  if (event.name === "bet:settled") {
    if (userId) {
      io.to(`user:${userId}`).to("admin").emit(event.name, event.payload);
    }
    return;
  }

  if (event.name.startsWith("bet:")) {
    io.to(GLOBAL_GAME_ROOM).to("admin").emit(event.name, event.payload);
    return;
  }

  if (event.name.startsWith("round:")) {
    io.to(GLOBAL_GAME_ROOM).to("admin").emit(event.name, event.payload);

    if (event.name === "round:update") {
      emitContractEvent(
        io.to(GLOBAL_GAME_ROOM),
        "round_update",
        event.payload as RoundUpdateEvent,
      );
    }

    if (event.name === "round:result") {
      emitContractEvent(
        io.to(GLOBAL_GAME_ROOM),
        "result_declared",
        event.payload as ResultDeclaredEvent,
      );
    }

    if (event.name === "round:cancelled") {
      io.to(GLOBAL_GAME_ROOM).emit("round_cancelled", event.payload);
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

function parseRoundId(payload: unknown) {
  if (typeof payload === "string") {
    return payload;
  }

  if (isRecord(payload) && typeof payload.roundId === "string") {
    return payload.roundId;
  }

  return null;
}

function emitRoundStateSnapshot(
  socket: Socket,
  snapshot: Awaited<ReturnType<typeof buildStateSnapshot>>,
) {
  const payload = buildRoundUpdatePayload(snapshot);

  socket.emit("round:update", payload);
  socket.emit("round:state", payload);
  emitContractEvent(socket, "round_update", payload);
}

function buildRoundUpdatePayload(snapshot: Awaited<ReturnType<typeof buildStateSnapshot>>) {
  return {
    round: snapshot.currentRound,
    remainingSeconds: snapshot.currentRound ? calculateRemainingSeconds(snapshot.currentRound) : 0,
    syncedAt: snapshot.syncedAt,
  };
}

async function handlePlaceBet(
  socket: Socket,
  payload: unknown,
  ack: ((response: unknown) => void) | undefined,
  eventName: string,
) {
  if (!(await authorizeSensitiveSocketEvent(socket, ack))) {
    return;
  }

  if (!(await consumeSocketToken(socket, eventName))) {
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
    const user = getSocketUser(socket);
    const result = await betService.placeBet(user.userId, parsed.data);
    ack?.({ ok: true, data: result, ...result });
  } catch (error) {
    const response = toSocketError(error);
    socket.emit("system:error", response);
    ack?.({ ok: false, error: response.code, message: response.message });
  }
}

async function authorizeSensitiveSocketEvent(
  socket: Socket,
  ack?: (response: unknown) => void,
) {
  const active = await authorizeSocketSession(
    prisma,
    getSocketUser(socket),
    () => {
      const response = {
        code: "SESSION_REVOKED",
        message: "Socket session is no longer active.",
      };
      socket.emit("system:error", response);
      ack?.({ ok: false, error: response.code, message: response.message });
    },
    () => {
      socket.disconnect(true);
    },
  );

  return active;
}

function emitContractEvent<TEventName extends ServerToClientEventName>(
  target: Pick<Socket | ReturnType<Server["to"]>, "emit">,
  eventName: TEventName,
  payload: ServerToClientEventPayloads[TEventName],
) {
  target.emit(eventName, payload);
}

function asUnknownAck<TResponse>(
  ack: ((response: TResponse) => void) | undefined,
): ((response: unknown) => void) | undefined {
  return ack as ((response: unknown) => void) | undefined;
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

function calculateRemainingSeconds(round: { status: string; phase?: string; lockTime: string; endTime: string }) {
  const isOpen = round.status === "OPEN" || round.status === "BETTING_OPEN" || round.phase === "BETTING_OPEN";
  const target = isOpen ? round.lockTime : round.endTime;
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
