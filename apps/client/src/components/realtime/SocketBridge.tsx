"use client";

import { useEffect } from "react";

import { refreshSession } from "@/services/api-client";
import { clearActiveSocket, createSocket, joinGameRoomOverSocket, joinRoundOverSocket } from "@/services/socket";
import { useAuthStore } from "@/store/auth-store";
import { useGameStore } from "@/store/game-store";

const ROUND_RESYNC_INTERVAL_MS = 15_000;

export function SocketBridge() {
  const accessToken = useAuthStore((state) => state.tokens?.accessToken);
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);
  const setConnected = useGameStore((state) => state.setSocketConnected);
  const applyRealtimeEvent = useGameStore((state) => state.applyRealtimeEvent);

  useEffect(() => {
    if (!accessToken) {
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
          socket.disconnect();
        })
        .catch(() => {
          clearSession();
          socket.disconnect();
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
    socket.on("bet:placed", (payload) => applyRealtimeEvent("bet:placed", payload));
    socket.on("bet:settled", (payload) => applyRealtimeEvent("bet:settled", payload));
    socket.on("wallet:update", (payload) => applyRealtimeEvent("wallet:update", payload));
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
      clearActiveSocket(socket);
      socket.disconnect();
      setConnected(false);
    };
  }, [accessToken, applyRealtimeEvent, clearSession, setConnected, setSession]);

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
