"use client";

import { Bell, Sparkles } from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import type { GameModule } from "./types";

export function PlaceholderGameModule({ game }: { game: GameModule }) {
  return (
    <AppShell title={game.name}>
      <section className={`relative min-h-[72vh] overflow-hidden rounded-[34px] border border-white/10 bg-gradient-to-br ${game.accent.from} ${game.accent.via} ${game.accent.to} p-5 text-white shadow-[0_24px_70px_rgba(0,0,0,0.42)]`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_0%,rgba(255,255,255,0.20),transparent_34%)]" />
        <div className="relative flex h-full min-h-[68vh] flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="rounded-full border border-white/15 bg-white/12 px-3 py-1 text-xs font-black uppercase backdrop-blur">
              Coming soon
            </span>
            <Bell size={22} aria-hidden="true" />
          </div>

          <div>
            <div className="grid size-20 place-items-center rounded-[28px] border border-white/15 bg-white/12 shadow-[0_0_40px_rgba(255,255,255,0.14)] backdrop-blur">
              <Sparkles size={34} aria-hidden="true" />
            </div>
            <h1 className="mt-6 text-4xl font-black">{game.name}</h1>
            <p className="mt-3 max-w-sm text-sm font-bold leading-6 text-white/68">{game.tagline}</p>
          </div>

          <Link
            href="/"
            className="grid min-h-14 place-items-center rounded-2xl bg-white text-sm font-black text-[#080a14] shadow-[0_16px_38px_rgba(255,255,255,0.18)] active:scale-[0.98]"
          >
            Back to lobby
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
