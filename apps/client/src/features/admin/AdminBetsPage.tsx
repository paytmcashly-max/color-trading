"use client";

import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { useState } from "react";

import { AdminShell } from "@/components/admin/AdminShell";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fetchAdminBets } from "@/services/api-client";
import { useAdminToken } from "@/features/admin/useAdminToken";
import { formatCoinString } from "@/utils/format-coins";

export function AdminBetsPage() {
  const token = useAdminToken();
  const [roundId, setRoundId] = useState("");
  const [userId, setUserId] = useState("");
  const { data } = useQuery({
    queryKey: ["admin", "bets", roundId, userId],
    queryFn: () => fetchAdminBets(token, { roundId, userId }),
    enabled: Boolean(token),
    refetchInterval: 10_000,
  });

  return (
    <AdminShell title="Bets">
      <Card>
        <div className="grid gap-3 md:grid-cols-2">
          <FilterInput icon={<Search size={18} />} value={roundId} onChange={setRoundId} placeholder="Filter by round id" />
          <FilterInput icon={<Search size={18} />} value={userId} onChange={setUserId} placeholder="Filter by user id" />
        </div>
      </Card>

      {data?.suspiciousUsers.length ? (
        <Card className="mt-4 border-[#f0d08a] bg-[#fffaf0]">
          <p className="text-xs font-bold uppercase text-[#7a4a00]">Suspicious pattern watch</p>
          <div className="mt-2 grid gap-2">
            {data.suspiciousUsers.map((user) => (
              <p key={user.userId} className="text-sm">
                <b>{user.userId}</b>: {user.betCountLastHour} bets, {formatCoinString(user.coinsStakedLastHour)} staked in the last hour
              </p>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="mt-4 grid gap-3">
        {data?.bets.map((bet) => (
          <Card key={bet.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-extrabold">{bet.user?.email ?? bet.userId}</p>
                <p className="mt-1 text-xs text-muted">Round #{bet.round?.roundNumber ?? bet.roundId}</p>
              </div>
              <StatusBadge status={bet.status} />
            </div>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
              <span>Choice: <b>{bet.choice}</b></span>
              <span>Stake: <b>{formatCoinString(bet.coinsStaked)}</b></span>
              <span>Payout: <b>{formatCoinString(bet.payoutAmount)}</b></span>
              <span>{new Date(bet.createdAt).toLocaleTimeString()}</span>
            </div>
          </Card>
        ))}
      </div>
    </AdminShell>
  );
}

function FilterInput({
  icon,
  value,
  onChange,
  placeholder,
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex min-h-12 items-center gap-2 rounded-md border border-line bg-white px-3">
      {icon}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-sm outline-none"
      />
    </label>
  );
}
