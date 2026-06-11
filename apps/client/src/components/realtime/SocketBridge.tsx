"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { refreshSession } from "@/services/api-client";
import {
  createSocket,
  disposeSocket,
  joinGameRoomOverSocket,
  joinRoundOverSocket,
  reconnectSocketWithToken,
} from "@/services/socket";
import { useAuthStore } from "@/store/auth-store";
import { useGameStore } from "@/store/game-store";

const ROUND_RESYNC_INTERVAL_MS = 15_000;

export function SocketBridge() {
  const authenticated = useAuthStore((state) => Boolean(state.tokens?.accessToken));
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);
  const setConnected = useGameStore((state) => state.setSocketConnected);
  const applyRealtimeEvent = useGameStore((state) => state.applyRealtimeEvent);
  const queryClient = useQueryClient();

  useEffect(() => {
    const accessToken = useAuthStore.getState().tokens?.accessToken;

    if (!authenticated || !accessToken) {
      setConnected(false);
      return;
    }

    const socket = createSocket(accessToken);
    let refreshInFlight = false;

    socket.on("connect", () => {
      setConnected(true);
      joinGameRoomOverSocket();
      socket.emit("state:sync");
    });
    socket.on("connect_error", (error) => {
      if (!isSocketAuthError(error) || refreshInFlight) {
        return;
      }

      refreshInFlight = true;
      refreshSession()
        .then((session) => {
          setSession(session.user, session.tokens);
          reconnectSocketWithToken(socket, session.tokens.accessToken);
        })
        .catch(() => {
          clearSession();
          disposeSocket(socket);
        })
        .finally(() => {
          refreshInFlight = false;
        });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("system:sync", (payload) => {
      applyRealtimeEvent("system:sync", payload);
      joinPayloadRound(payload);
    });
    socket.on("round:created", (payload) => {
      applyRealtimeEvent("round:created", payload);
      joinPayloadRound(payload);
    });
    socket.on("round:update", (payload) => applyRealtimeEvent("round:update", payload));
    socket.on("round:state", (payload) => applyRealtimeEvent("round:state", payload));
    socket.on("round:timer", (payload) => applyRealtimeEvent("round:timer", payload));
    socket.on("round:lock", (payload) => applyRealtimeEvent("round:lock", payload));
    socket.on("round:locked", (payload) => applyRealtimeEvent("round:locked", payload));
    socket.on("round:result", (payload) => applyRealtimeEvent("round:result", payload));
    socket.on("round:completed", (payload) => applyRealtimeEvent("round:completed", payload));
    socket.on("round:cancelled", (payload) => {
      applyRealtimeEvent("round:cancelled", payload);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["wallet"] }),
        queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["my-bet-history"] }),
        queryClient.invalidateQueries({ queryKey: ["round-history"] }),
      ]);
    });
    socket.on("bet:placed", (payload) => applyRealtimeEvent("bet:placed", payload));
    socket.on("bet:settled", (payload) => {
      const betId = readBetId(payload);
      if (betId && wasSettlementShown(betId)) {
        useGameStore.getState().markSettlementShown(betId);
      }
      applyRealtimeEvent("bet:settled", payload);
      if (betId) {
        rememberSettlementShown(betId);
      }
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-bet-history"] }),
        queryClient.invalidateQueries({ queryKey: ["wallet"] }),
        queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] }),
      ]);
    });
    socket.on("wallet:update", (payload) => {
      applyRealtimeEvent("wallet:update", payload);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["wallet"] }),
        queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] }),
      ]);
    });
    socket.on("user:balance_sync", (payload) => applyRealtimeEvent("user:balance_sync", payload));
    socket.on("system:health", (payload) => applyRealtimeEvent("system:health", payload));
    socket.on("system:error", (payload) => applyRealtimeEvent("system:error", payload));

    const resync = () => {
      if (socket.connected) {
        socket.emit("state:sync");
      }
    };
    const intervalId = window.setInterval(resync, ROUND_RESYNC_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        resync();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      disposeSocket(socket);
      setConnected(false);
    };
  }, [authenticated, applyRealtimeEvent, clearSession, queryClient, setConnected, setSession]);

  return null;
}

function joinPayloadRound(payload: unknown) {
  if (!isRecord(payload)) {
    return;
  }

  const round = isRecord(payload.round) ? payload.round : payload.currentRound;

  if (isRecord(round) && typeof round.id === "string") {
    joinRoundOverSocket(round.id);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSocketAuthError(error: Error) {
  const message = error.message.toLowerCase();
  return message.includes("auth") || message.includes("session") || message.includes("token");
}

const SETTLEMENT_SESSION_KEY = "shown-settled-bet-ids";

function readBetId(payload: unknown) {
  if (!isRecord(payload)) return null;
  if (typeof payload.betId === "string") return payload.betId;
  if (typeof payload.id === "string") return payload.id;
  return isRecord(payload.bet) && typeof payload.bet.id === "string" ? payload.bet.id : null;
}

function wasSettlementShown(betId: string) {
  return readShownSettlementIds().includes(betId);
}

function rememberSettlementShown(betId: string) {
  try {
    const ids = [betId, ...readShownSettlementIds().filter((id) => id !== betId)].slice(0, 100);
    window.sessionStorage.setItem(SETTLEMENT_SESSION_KEY, JSON.stringify(ids));
  } catch {
    // Session storage is optional; in-memory dedupe remains active.
  }
}

function readShownSettlementIds(): string[] {
  try {
    const value = window.sessionStorage.getItem(SETTLEMENT_SESSION_KEY);
    const parsed: unknown = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}
