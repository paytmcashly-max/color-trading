"use client";

import { BarChart3, Clock3, Gamepad2, Home, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { ConnectionPill } from "@/components/ui/ConnectionPill";

const navItems = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/game", label: "Play", icon: Gamepad2 },
  { href: "/leaderboard", label: "Rank", icon: BarChart3 },
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

  return (
    <div className="min-h-screen bg-canvas pb-24 text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-muted">Virtual coins</p>
            <h1 className="text-xl font-extrabold tracking-normal">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <ConnectionPill />
            {action}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-4 px-4 py-4 md:grid-cols-[minmax(0,1fr)] md:py-6">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/96 px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(23,32,26,0.08)] md:hidden">
        <div className="grid grid-cols-5 gap-1">
          {navItems.map((item) => {
            const active = pathname === item.href || (pathname === "/" && item.href === "/dashboard");
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-md text-xs font-bold ${
                  active ? "bg-ink text-white" : "text-muted"
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
