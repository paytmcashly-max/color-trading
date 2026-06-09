"use client";

import { motion } from "framer-motion";
import { Flame, Gamepad2, Sparkles, Users, WalletCards } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { useWallet } from "@/hooks/useWallet";
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {games.map((game, index) => (
              <GameCard key={game.id} game={game} index={index} />
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
}: {
  game: GameModule;
  index: number;
}) {
  const live = game.status === "LIVE";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: index * 0.05 }}
      whileTap={{ scale: 0.975 }}
      className="min-w-0"
    >
      <Link
        href={game.route}
        className={`relative block min-h-36 overflow-hidden rounded-2xl border border-line bg-gradient-to-br ${game.accent.from} ${game.accent.via} ${game.accent.to} p-3 text-ink shadow-[0_10px_24px_rgba(23,32,26,0.08)] active:scale-[0.98]`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(255,255,255,0.78),transparent_42%)]" />
        <div className="relative grid min-h-30 content-between gap-3">
          <div className="flex items-start justify-between gap-2">
            <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/70 bg-white/75 shadow-sm">
              <Image
                src={game.imageSrc}
                alt=""
                width={64}
                height={64}
                className="size-full object-cover"
              />
            </span>
            <span className="inline-flex max-w-[72px] shrink-0 items-center justify-end gap-1 rounded-full bg-white/75 px-2 py-1 text-[10px] font-black text-[#4f5f56]">
              <Users size={11} aria-hidden="true" />
              <span className="truncate">{compactPlayers(game.activePlayers)}</span>
            </span>
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-black leading-5 text-ink">{game.name}</h3>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="truncate text-[11px] font-extrabold text-muted">{game.category}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${live ? "bg-[#dff8e9] text-[#106b3d]" : "bg-white/70 text-muted"}`}>
                {live ? "Live" : "Soon"}
              </span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function compactPlayers(players: number) {
  if (players >= 1000) {
    return `${(players / 1000).toFixed(players >= 10_000 ? 0 : 1)}K`;
  }

  return players.toLocaleString();
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
