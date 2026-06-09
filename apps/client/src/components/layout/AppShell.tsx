"use client";

import { Bell, Clock3, Gamepad2, Home, UserRound, WalletCards } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { ConnectionPill } from "@/components/ui/ConnectionPill";
import { useAuthStore } from "@/store/auth-store";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/games", label: "Games", icon: Gamepad2 },
  { href: "/wallet", label: "Wallet", icon: WalletCards },
  { href: "/history", label: "History", icon: Clock3 },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export function AppShell({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const userCode = user?.id ? user.id.slice(0, 8).toUpperCase() : "GUEST";
  const avatarLabel = (user?.displayName ?? user?.email ?? "P").slice(0, 1).toUpperCase();

  return (
    <div className="min-h-screen bg-[#070812] pb-28 text-white md:pb-10">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-90px] top-[-120px] size-72 rounded-full bg-[#1fd87a]/18 blur-3xl" />
        <div className="absolute right-[-90px] top-28 size-80 rounded-full bg-[#8b5cf6]/18 blur-3xl" />
      </div>

      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#070812]/86 px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.24)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#16874f] to-[#6e46b9] text-sm font-black text-white shadow-[0_10px_24px_rgba(22,135,79,0.22)]">
              {avatarLabel}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-black uppercase tracking-normal text-white/42">ID {userCode}</p>
              <h1 className="truncate text-lg font-black tracking-normal">{title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ConnectionPill />
            <button
              type="button"
              className="grid size-10 place-items-center rounded-full border border-white/10 bg-white/10 text-white shadow-sm active:scale-95"
              aria-label="Notifications"
            >
              <Bell size={18} aria-hidden="true" />
            </button>
            {action}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid max-w-5xl gap-4 px-4 py-4 md:grid-cols-[minmax(0,1fr)] md:py-6">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#090b16]/92 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
          {navItems.map((item) => {
            const active =
              pathname === item.href ||
              (pathname === "/dashboard" && item.href === "/") ||
              (pathname === "/game" && item.href === "/games") ||
              (pathname.startsWith("/game/") && item.href === "/games");
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-black transition active:scale-95 ${
                  active
                    ? "bg-white text-[#070812] shadow-[0_0_20px_rgba(255,255,255,0.15)]"
                    : "text-white/45 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon size={20} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
