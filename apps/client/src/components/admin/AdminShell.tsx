"use client";

import {
  Activity,
  ClipboardList,
  Gauge,
  LayoutDashboard,
  Shield,
  Users,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminRealtimeBridge } from "@/components/admin/AdminRealtimeBridge";
import { ConnectionPill } from "@/components/ui/ConnectionPill";

const navItems = [
  { href: "/admin-dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin-dashboard/users", label: "Users", icon: Users },
  { href: "/admin-dashboard/rounds", label: "Rounds", icon: Activity },
  { href: "/admin-dashboard/wallets", label: "Wallets", icon: WalletCards },
  { href: "/admin-dashboard/bets", label: "Bets", icon: ClipboardList },
  { href: "/admin-dashboard/system-health", label: "Health", icon: Gauge },
];

export function AdminShell({ title, children }: { title: string; children: ReactNode }) {
  const pathname = usePathname();

  return (
    <AdminGuard>
      <AdminRealtimeBridge />
      <div className="min-h-screen bg-[#f5f7f6] pb-24 text-ink md:pb-0">
        <header className="sticky top-0 z-20 border-b border-line bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-md bg-ink text-white">
                <Shield size={20} aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-normal text-muted">Control center</p>
                <h1 className="text-xl font-extrabold">{title}</h1>
              </div>
            </div>
            <ConnectionPill />
          </div>
        </header>

        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 md:grid-cols-[220px_minmax(0,1fr)] md:py-6">
          <aside className="hidden md:block">
            <nav className="sticky top-24 grid gap-1">
              {navItems.map((item) => renderNavItem(item, pathname))}
            </nav>
          </aside>
          <main className="min-w-0">{children}</main>
        </div>

        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/96 px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(23,32,26,0.08)] md:hidden">
          <div className="grid grid-cols-6 gap-1">
            {navItems.map((item) => renderNavItem(item, pathname, true))}
          </div>
        </nav>
      </div>
    </AdminGuard>
  );
}

function renderNavItem(
  item: (typeof navItems)[number],
  pathname: string,
  compact = false,
) {
  const Icon = item.icon;
  const active = pathname === item.href;

  return (
    <Link
      key={item.href}
      href={item.href}
      className={`flex min-h-12 items-center justify-center gap-2 rounded-md px-2 text-xs font-extrabold md:justify-start md:px-3 ${
        active ? "bg-ink text-white" : "text-muted hover:bg-white"
      }`}
    >
      <Icon size={compact ? 18 : 20} aria-hidden="true" />
      <span className={compact ? "sr-only" : ""}>{item.label}</span>
    </Link>
  );
}
