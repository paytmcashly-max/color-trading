"use client";

import { Wifi, WifiOff } from "lucide-react";

import { useGameStore } from "@/store/game-store";

export function ConnectionPill() {
  const connected = useGameStore((state) => state.socketConnected);
  const Icon = connected ? Wifi : WifiOff;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold ${connected ? "bg-[#dff4e8] text-[#0f5b38]" : "bg-[#e8edf2] text-[#526072]"}`}>
      <Icon size={14} aria-hidden="true" />
      {connected ? "Live" : "Sync"}
    </span>
  );
}
