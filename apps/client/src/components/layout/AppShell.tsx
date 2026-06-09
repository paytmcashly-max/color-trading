"use client";

import { Bell, Clock3, Home, UserRound, WalletCards } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { ConnectionPill } from "@/components/ui/ConnectionPill";
import { useAuthStore } from "@/store/auth-store";

const navItems = [
  { href: "/", label: "Home", icon: Home },
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
    <div className="min-h-screen bg-canvas pb-28 text-ink md:pb-10">
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 px-4 py-3 shadow-[0_10px_28px_rgba(23,32,26,0.08)] backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#16874f] text-sm font-black text-white shadow-[0_10px_24px_rgba(22,135,79,0.18)]">
              {avatarLabel}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-black uppercase tracking-normal text-muted">ID {userCode}</p>
              <h1 className="truncate text-lg font-black tracking-normal">{title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ConnectionPill />
            <button
              type="button"
              className="grid size-10 place-items-center rounded-full border border-line bg-white text-ink shadow-sm active:scale-95"
              aria-label="Notifications"
            >
              <Bell size={18} aria-hidden="true" />
            </button>
            {action}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)] md:py-5">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/96 px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(23,32,26,0.10)] backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
          {navItems.map((item) => {
            const active =
              pathname === item.href ||
              (pathname === "/dashboard" && item.href === "/");
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-black transition active:scale-95 ${
                  active
                    ? "bg-[#e9f8ef] text-[#16874f] shadow-[0_8px_20px_rgba(22,135,79,0.12)]"
                    : "text-muted hover:bg-[#eef3ee] hover:text-ink"
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
