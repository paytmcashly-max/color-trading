"use client";

import { Activity, CircleDollarSign, ClipboardList, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { AdminMetric } from "@/components/admin/AdminMetric";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fetchAdminSystemHealth } from "@/services/api-client";
import { useAdminToken } from "@/features/admin/useAdminToken";

export function AdminDashboardPage() {
  const token = useAdminToken();
  const { data } = useQuery({
    queryKey: ["admin", "health"],
    queryFn: () => fetchAdminSystemHealth(token),
    enabled: Boolean(token),
    refetchInterval: 15_000,
  });

  return (
    <AdminShell title="Dashboard">
      <div className="grid gap-4 md:grid-cols-4">
        <AdminMetric label="Active users" value={data?.activeUsers ?? "--"} icon={<Users size={20} />} />
        <AdminMetric label="Rounds" value={data?.totals.rounds ?? "--"} icon={<Activity size={20} />} />
        <AdminMetric label="Bets" value={data?.totals.bets ?? "--"} icon={<ClipboardList size={20} />} />
        <AdminMetric label="Ledger rows" value={data?.totals.ledgerEntries ?? "--"} icon={<CircleDollarSign size={20} />} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-muted">Current round</p>
              <h2 className="mt-1 text-lg font-extrabold">#{data?.currentRound?.roundNumber ?? "--"}</h2>
            </div>
            {data?.currentRound ? <StatusBadge status={data.currentRound.status} /> : <StatusBadge status="IDLE" />}
          </div>
          <p className="mt-3 text-sm text-muted">
            Result: <span className="font-bold text-ink">{data?.currentRound?.result ?? "Pending"}</span>
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Link href="/admin-dashboard/rounds" className="rounded-md border border-line bg-[#f8fbf8] p-3 text-sm font-bold">Round controls</Link>
            <Link href="/admin-dashboard/bets" className="rounded-md border border-line bg-[#f8fbf8] p-3 text-sm font-bold">Bet monitor</Link>
            <Link href="/admin-dashboard/wallets" className="rounded-md border border-line bg-[#f8fbf8] p-3 text-sm font-bold">Wallet audit</Link>
          </div>
        </Card>

        <Card>
          <p className="text-xs font-bold uppercase text-muted">System health</p>
          <div className="mt-3 grid gap-2 text-sm">
            <HealthLine label="API" value={data?.status ?? "loading"} />
            <HealthLine label="Postgres" value={data?.dependencies.postgres ?? "loading"} />
            <HealthLine label="Redis" value={data?.dependencies.redis ?? "loading"} />
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}

function HealthLine({ label, value }: { label: string; value: string }) {
  const ok = value === "ok" || value === "configured";
  return (
    <div className="flex items-center justify-between rounded-md bg-[#f8fbf8] px-3 py-2">
      <span className="font-bold">{label}</span>
      <span className={ok ? "text-[#126b40]" : "text-[#a15c00]"}>{value}</span>
    </div>
  );
}
