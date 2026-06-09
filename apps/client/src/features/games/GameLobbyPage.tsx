"use client";

import { motion } from "framer-motion";
import { Bell, ChevronRight, Flame, Gamepad2, Sparkles, Trophy, Users, WalletCards } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/layout/AppShell";
import { ConnectionPill } from "@/components/ui/ConnectionPill";
import { useWallet } from "@/hooks/useWallet";
import { fetchRoundHistory } from "@/services/api-client";
import { useAuthStore } from "@/store/auth-store";
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
  const user = useAuthStore((state) => state.user);
  const { wallet, isLoading } = useWallet();
  const roundsQuery = useQuery({
    queryKey: ["round-history", "lobby"],
    queryFn: fetchRoundHistory,
    refetchInterval: 20_000,
  });
  const latestResult = roundsQuery.data?.rounds[0]?.result ?? null;
  const games = showAllGames ? gameModules : gameModules.slice(0, 4);
  const onlinePlayers = games.reduce((total, game) => total + game.activePlayers, 0);

  return (
    <AppShell title={showAllGames ? "Games" : "Game Lobby"}>
      <section className="grid gap-4">
        <div className="grid gap-3 rounded-[30px] border border-white/10 bg-white/[0.07] p-4 text-white shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-13 shrink-0 place-items-center rounded-3xl bg-gradient-to-br from-[#1fd87a] to-[#8b5cf6] text-lg font-black text-white shadow-[0_0_32px_rgba(31,216,122,0.25)]">
                {(user?.displayName ?? user?.email ?? "P").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-black uppercase text-white/42">Welcome back</p>
                <h1 className="truncate text-2xl font-black">{user?.displayName ?? "Player"}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ConnectionPill />
              <button
                type="button"
                className="grid size-11 place-items-center rounded-2xl border border-white/10 bg-white/10 active:scale-95"
                aria-label="Notifications"
              >
                <Bell size={19} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-[1.2fr_0.8fr] gap-3">
            <Link
              href="/wallet"
              className="rounded-[24px] border border-white/10 bg-black/24 p-4 active:scale-[0.98]"
            >
              <span className="flex items-center gap-2 text-xs font-black uppercase text-white/45">
                <WalletCards size={16} aria-hidden="true" />
                Wallet
              </span>
              <strong className="mt-2 block text-2xl font-black">
                {isLoading && !wallet ? "..." : formatCoinString(wallet?.totalBalance)}
              </strong>
            </Link>
            <div className="rounded-[24px] border border-white/10 bg-black/24 p-4">
              <span className="flex items-center gap-2 text-xs font-black uppercase text-white/45">
                <Users size={16} aria-hidden="true" />
                Online
              </span>
              <strong className="mt-2 block text-2xl font-black">{onlinePlayers.toLocaleString()}</strong>
            </div>
          </div>
        </div>

        <section id="games" className="grid gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase text-white/38">Featured</p>
              <h2 className="text-xl font-black text-white">Games</h2>
            </div>
            {!showAllGames ? (
              <Link href="/games" className="text-xs font-black uppercase text-[#76ffb8]">
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

        <section className="grid gap-3 rounded-[28px] border border-white/10 bg-white/[0.07] p-4 text-white shadow-[0_18px_48px_rgba(0,0,0,0.26)] backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <Flame size={18} className="text-[#ffc857]" aria-hidden="true" />
            <h2 className="font-black">Live activity</h2>
          </div>
          <div className="max-h-36 overflow-hidden">
            <motion.div
              animate={{ y: [0, -96, 0] }}
              transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
              className="grid gap-2"
            >
              {[...activity, ...activity].map((item, index) => (
                <div key={`${item}-${index}`} className="flex min-h-10 items-center gap-2 rounded-2xl bg-black/24 px-3 text-sm font-bold text-white/70">
                  <Sparkles size={15} className="text-[#76ffb8]" aria-hidden="true" />
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
      className={`relative min-h-52 overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br ${game.accent.from} ${game.accent.via} ${game.accent.to} p-4 text-white ${game.accent.glow}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.22),transparent_32%)]" />
      <div className="relative flex h-full min-h-44 flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${live ? "bg-[#1fd87a]/20 text-[#9dffd0]" : "bg-white/14 text-white/62"}`}>
              {live ? "Live" : "Coming soon"}
            </span>
            <h3 className="mt-3 text-2xl font-black">{game.name}</h3>
            <p className="mt-1 line-clamp-2 text-xs font-bold leading-5 text-white/58">{game.tagline}</p>
          </div>
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/12">
            <Trophy size={22} aria-hidden="true" />
          </span>
        </div>

        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2 text-xs font-black text-white/58">
            <div className="rounded-2xl bg-black/20 p-3">
              <span className="block uppercase">Players</span>
              <strong className="mt-1 block text-base text-white">{game.activePlayers.toLocaleString()}</strong>
            </div>
            <div className="rounded-2xl bg-black/20 p-3">
              <span className="block uppercase">Last result</span>
              <strong className="mt-1 block text-base text-white">{latestResult ?? "--"}</strong>
            </div>
          </div>

          <Link
            href={game.route}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-black transition active:scale-[0.98] ${
              live ? "bg-white text-[#080a14]" : "border border-white/12 bg-white/10 text-white/65"
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
    <div className="rounded-[24px] border border-white/10 bg-white/[0.07] p-4 text-white backdrop-blur-xl">
      <span className="flex items-center gap-2 text-xs font-black uppercase text-white/42">
        {icon}
        {label}
      </span>
      <strong className="mt-2 block text-2xl font-black">{value}</strong>
    </div>
  );
}
