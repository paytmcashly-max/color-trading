"use client";

import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { getGameModule } from "./modules/registry";

export function GameModulePage({ gameId }: { gameId: string }) {
  const gameModule = getGameModule(gameId);

  if (!gameModule) {
    return (
      <AppShell title="Game not found">
        <section className="grid min-h-[60vh] place-items-center rounded-3xl border border-line bg-white p-6 text-center text-ink shadow-[0_14px_34px_rgba(23,32,26,0.08)]">
          <div>
            <p className="text-xs font-black uppercase text-muted">Unavailable</p>
            <h1 className="mt-2 text-3xl font-black">Game module not found</h1>
            <p className="mt-2 text-sm font-bold text-muted">Choose an available game from the lobby.</p>
            <Link
              href="/"
              className="mt-6 grid min-h-12 place-items-center rounded-2xl bg-ink px-5 text-sm font-black text-white"
            >
              Back to lobby
            </Link>
          </div>
        </section>
      </AppShell>
    );
  }

  return gameModule.renderUI();
}
