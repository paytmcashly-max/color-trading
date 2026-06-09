"use client";

import { Wifi, WifiOff } from "lucide-react";

import { useGameStore } from "@/store/game-store";

export function ConnectionPill() {
  const connected = useGameStore((state) => state.socketConnected);
  const lastHealthAt = useGameStore((state) => state.lastSocketHealthAt);
  const Icon = connected ? Wifi : WifiOff;

  return (
    <span
      title={lastHealthAt ? `Last socket health: ${new Date(lastHealthAt).toLocaleTimeString()}` : undefined}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold ${connected ? "bg-[#dff8e9] text-[#106b3d]" : "bg-[#eef1ef] text-muted"}`}
    >
      <Icon size={14} aria-hidden="true" />
      {connected ? "Live" : "Sync"}
    </span>
  );
}
