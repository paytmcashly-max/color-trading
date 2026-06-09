"use client";

import { motion } from "framer-motion";
import { ChevronRight, Flame, Gamepad2, Sparkles, Trophy, Users, WalletCards } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/layout/AppShell";
import { useWallet } from "@/hooks/useWallet";
import { fetchRoundHistory } from "@/services/api-client";
import { useGameStore } from "@/store/game-store";
import { formatCoinString } from "@/utils/format-coins";
import { gameModules } from "./modules/registry";
import type { GameModule } from "./modules/types";

const activity = [
  "User*** won 500 in Color Prediction",
  "Player*** hit 3x in Crash Game",
  "K*** streaked 4 rounds in Color Prediction",
  "User*** rolled high in Dice Game",
  "Ace*** entered Roulette early access",
];

export function GameLobbyPage({ showAllGames = false }: { showAllGames?: boolean }) {
  const { wallet, isLoading } = useWallet();
  const liveActivity = useGameStore((state) => state.liveActivity);
  const roundsQuery = useQuery({
    queryKey: ["round-history", "lobby"],
    queryFn: fetchRoundHistory,
    refetchInterval: 20_000,
  });
  const latestResult = roundsQuery.data?.rounds[0]?.result ?? null;
  const games = showAllGames ? gameModules : gameModules.slice(0, 4);
  const onlinePlayers = games.reduce((total, game) => total + game.activePlayers, 0);
  const activityItems = liveActivity.length > 0 ? [...liveActivity, ...activity].slice(0, 10) : activity;

  return (
    <AppShell title={showAllGames ? "Games" : "Game Lobby"}>
      <section className="grid gap-4">
        <div className="grid gap-3 rounded-3xl border border-line bg-white p-4 text-ink shadow-[0_18px_48px_rgba(23,32,26,0.10)]">
          <div>
            <p className="text-xs font-black uppercase text-muted">Lobby</p>
            <h1 className="mt-1 text-2xl font-black">Choose your game</h1>
            <p className="mt-1 text-sm font-semibold leading-6 text-muted">
              Live virtual coin games and upcoming modules in one place.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/wallet"
              className="min-w-0 rounded-2xl border border-line bg-[#f8faf7] p-4 active:scale-[0.98]"
            >
              <span className="flex items-center gap-2 text-xs font-black uppercase text-muted">
                <WalletCards size={16} aria-hidden="true" />
                Wallet
              </span>
              <strong className="mt-2 block truncate text-xl font-black sm:text-2xl">
                {isLoading && !wallet ? "..." : formatCoinString(wallet?.totalBalance)}
              </strong>
            </Link>
            <div className="min-w-0 rounded-2xl border border-line bg-[#f8faf7] p-4">
              <span className="flex items-center gap-2 text-xs font-black uppercase text-muted">
                <Users size={16} aria-hidden="true" />
                Online
              </span>
              <strong className="mt-2 block truncate text-xl font-black sm:text-2xl">{onlinePlayers.toLocaleString()}</strong>
            </div>
          </div>
        </div>

        <section id="games" className="grid gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase text-muted">Featured</p>
              <h2 className="text-xl font-black text-ink">Games</h2>
            </div>
            {!showAllGames ? (
              <Link href="/games" className="text-xs font-black uppercase text-[#16874f]">
                View all
              </Link>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {games.map((game, index) => (
              <GameCard key={game.id} game={game} index={index} latestResult={game.id === "color-prediction" ? latestResult : null} />
            ))}
          </div>
        </section>

        <section className="grid gap-3 rounded-3xl border border-line bg-white p-4 text-ink shadow-[0_14px_34px_rgba(23,32,26,0.08)]">
          <div className="flex items-center gap-2">
            <Flame size={18} className="text-[#ffc857]" aria-hidden="true" />
            <h2 className="font-black">Live activity</h2>
          </div>
          <div className="max-h-36 overflow-hidden">
            <motion.div
              animate={{ y: ["0%", "-50%"] }}
              transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
              className="grid gap-2"
            >
              {[...activityItems, ...activityItems].map((item, index) => (
                <div key={`${item}-${index}`} className="flex min-h-10 items-center gap-2 rounded-2xl bg-[#f8faf7] px-3 text-sm font-bold text-muted">
                  <Sparkles size={15} className="text-[#16874f]" aria-hidden="true" />
                  {item}
                </div>
              ))}
            </motion.div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <StatTile icon={<Users size={18} />} label="Players online" value={onlinePlayers.toLocaleString()} />
          <StatTile icon={<Gamepad2 size={18} />} label="Games today" value="18.4K" />
        </section>
      </section>
    </AppShell>
  );
}

function GameCard({
  game,
  index,
  latestResult,
}: {
  game: GameModule;
  index: number;
  latestResult: string | null;
}) {
  const live = game.status === "LIVE";

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: index * 0.05 }}
      whileTap={{ scale: 0.975 }}
      className={`relative min-h-48 overflow-hidden rounded-3xl border border-line bg-gradient-to-br ${game.accent.from} ${game.accent.via} ${game.accent.to} p-4 text-ink shadow-[0_14px_34px_rgba(23,32,26,0.10)]`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.72),transparent_38%)]" />
      <div className="relative flex h-full min-h-44 flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${live ? "bg-[#dff8e9] text-[#106b3d]" : "bg-white/65 text-muted"}`}>
              {live ? "Live" : "Coming soon"}
            </span>
            <h3 className="mt-3 text-xl font-black sm:text-2xl">{game.name}</h3>
            <p className="mt-1 line-clamp-2 text-xs font-bold leading-5 text-[#4f5f56]">{game.tagline}</p>
          </div>
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-white/55 bg-white/65 text-ink">
            <Trophy size={22} aria-hidden="true" />
          </span>
        </div>

        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2 text-xs font-black text-muted">
            <div className="min-w-0 rounded-2xl bg-white/65 p-3">
              <span className="block uppercase">Players</span>
              <strong className="mt-1 block truncate text-base text-ink">{game.activePlayers.toLocaleString()}</strong>
            </div>
            <div className="min-w-0 rounded-2xl bg-white/65 p-3">
              <span className="block uppercase">Last result</span>
              <strong className="mt-1 block truncate text-base text-ink">{latestResult ?? "--"}</strong>
            </div>
          </div>

          <Link
            href={game.route}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-black transition active:scale-[0.98] ${
              live ? "bg-ink text-white" : "border border-line bg-white/75 text-muted"
            }`}
          >
            {live ? "Play Now" : "Preview"}
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </motion.article>
  );
}

function StatTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 text-ink shadow-[0_10px_24px_rgba(23,32,26,0.06)]">
      <span className="flex items-center gap-2 text-xs font-black uppercase text-muted">
        {icon}
        {label}
      </span>
      <strong className="mt-2 block text-2xl font-black">{value}</strong>
    </div>
  );
}
