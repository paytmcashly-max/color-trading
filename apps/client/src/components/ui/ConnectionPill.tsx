"use client";

import { Wifi, WifiOff } from "lucide-react";

import { playerConnectionCopy } from "@/lib/player-copy";
import { useGameStore } from "@/store/game-store";

export function ConnectionPill() {
  const connected = useGameStore((state) => state.socketConnected);
  const Icon = connected ? Wifi : WifiOff;

  return (
    <span
      title={connected ? playerConnectionCopy.connected : playerConnectionCopy.disconnected}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold ${connected ? "bg-[#dff8e9] text-[#106b3d]" : "bg-[#eef1ef] text-muted"}`}
    >
      <Icon size={14} aria-hidden="true" />
      {connected ? playerConnectionCopy.connected : "Reconnecting..."}
    </span>
  );
}
