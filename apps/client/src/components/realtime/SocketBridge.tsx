"use client";

import { useEffect } from "react";

import { createSocket } from "@/services/socket";
import { useAuthStore } from "@/store/auth-store";
import { useGameStore } from "@/store/game-store";

export function SocketBridge() {
  const accessToken = useAuthStore((state) => state.tokens?.accessToken);
  const setConnected = useGameStore((state) => state.setSocketConnected);
  const applyRealtimeEvent = useGameStore((state) => state.applyRealtimeEvent);

  useEffect(() => {
    if (!accessToken) {
      setConnected(false);
      return;
    }

    const socket = createSocket(accessToken);

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("state:sync");
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("system:sync", (payload) => applyRealtimeEvent("system:sync", payload));
    socket.on("round:created", (payload) => applyRealtimeEvent("round:created", payload));
    socket.on("round:timer", (payload) => applyRealtimeEvent("round:timer", payload));
    socket.on("round:locked", (payload) => applyRealtimeEvent("round:locked", payload));
    socket.on("round:result", (payload) => applyRealtimeEvent("round:result", payload));
    socket.on("round:completed", (payload) => applyRealtimeEvent("round:completed", payload));
    socket.on("bet:placed", (payload) => applyRealtimeEvent("bet:placed", payload));
    socket.on("wallet:update", (payload) => applyRealtimeEvent("wallet:update", payload));
    socket.on("user:balance_sync", (payload) => applyRealtimeEvent("user:balance_sync", payload));
    socket.on("system:error", (payload) => applyRealtimeEvent("system:error", payload));

    return () => {
      socket.disconnect();
      setConnected(false);
    };
  }, [accessToken, applyRealtimeEvent, setConnected]);

  return null;
}
