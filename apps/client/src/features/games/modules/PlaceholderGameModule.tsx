"use client";

import { Bell, Sparkles } from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import type { GameModule } from "./types";

export function PlaceholderGameModule({ game }: { game: GameModule }) {
  return (
    <AppShell title={game.name}>
      <section className={`relative min-h-[72vh] overflow-hidden rounded-3xl border border-line bg-gradient-to-br ${game.accent.from} ${game.accent.via} ${game.accent.to} p-5 text-ink shadow-[0_18px_48px_rgba(23,32,26,0.10)]`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_0%,rgba(255,255,255,0.72),transparent_38%)]" />
        <div className="relative flex h-full min-h-[68vh] flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="rounded-full border border-line bg-white/70 px-3 py-1 text-xs font-black uppercase text-muted">
              Coming soon
            </span>
            <Bell size={22} aria-hidden="true" />
          </div>

          <div>
            <div className="grid size-20 place-items-center rounded-3xl border border-line bg-white/70 text-[#16874f] shadow-[0_12px_28px_rgba(23,32,26,0.08)]">
              <Sparkles size={34} aria-hidden="true" />
            </div>
            <h1 className="mt-6 text-4xl font-black">{game.name}</h1>
            <p className="mt-3 max-w-sm text-sm font-bold leading-6 text-muted">{game.tagline}</p>
          </div>

          <Link
            href="/"
            className="grid min-h-14 place-items-center rounded-2xl bg-ink text-sm font-black text-white shadow-[0_14px_34px_rgba(23,32,26,0.18)] active:scale-[0.98]"
          >
            Back to lobby
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
