"use client";

import { Ban, Search, ShieldCheck } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { banAdminUser, fetchAdminUsers, unbanAdminUser } from "@/services/api-client";
import { useAdminToken } from "@/features/admin/useAdminToken";
import { formatCoinString } from "@/utils/format-coins";

export function AdminUsersPage() {
  const token = useAdminToken();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "users", query],
    queryFn: () => fetchAdminUsers(token, query),
    enabled: Boolean(token),
  });
  const banMutation = useMutation({
    mutationFn: (userId: string) => banAdminUser(token, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
  const unbanMutation = useMutation({
    mutationFn: (userId: string) => unbanAdminUser(token, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  return (
    <AdminShell title="Users">
      <Card>
        <label className="flex min-h-12 items-center gap-2 rounded-md border border-line bg-white px-3">
          <Search size={18} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by email or user id"
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>
      </Card>

      <div className="mt-4 grid gap-3">
        {isLoading ? <Card>Loading users...</Card> : null}
        {data?.users.map((user) => (
          <Card key={user.id}>
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-extrabold">{user.email}</p>
                  <span className="rounded-full bg-[#eef3ee] px-2 py-1 text-xs font-bold">{user.role}</span>
                  <span className="rounded-full bg-[#e8edf2] px-2 py-1 text-xs font-bold">{user.status}</span>
                </div>
                <p className="mt-1 text-xs text-muted">{user.id}</p>
                <p className="mt-2 text-sm text-muted">
                  Wallet: <span className="font-bold text-ink">{formatCoinString(user.wallet?.balanceCoins)}</span>
                  {" "} | Bets: {user.counts?.bets ?? 0}
                </p>
              </div>
              {user.status === "SUSPENDED" ? (
                <Button variant="success" onClick={() => unbanMutation.mutate(user.id)}>
                  <ShieldCheck size={16} /> Unban
                </Button>
              ) : (
                <Button variant="danger" onClick={() => banMutation.mutate(user.id)} disabled={user.role === "ADMIN"}>
                  <Ban size={16} /> Ban
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </AdminShell>
  );
}
