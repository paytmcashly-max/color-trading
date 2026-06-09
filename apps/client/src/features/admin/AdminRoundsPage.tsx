"use client";

import { OctagonAlert, Play } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fetchAdminRounds, forceStartRound, forceStopRound } from "@/services/api-client";
import { useAdminToken } from "@/features/admin/useAdminToken";

export function AdminRoundsPage() {
  const token = useAdminToken();
  const queryClient = useQueryClient();
  const [stopReason, setStopReason] = useState("");
  const [startReason, setStartReason] = useState("");
  const { data } = useQuery({
    queryKey: ["admin", "rounds"],
    queryFn: () => fetchAdminRounds(token),
    enabled: Boolean(token),
    refetchInterval: 10_000,
  });
  const startMutation = useMutation({
    mutationFn: () => forceStartRound(token, startReason || "Admin force start requested"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "rounds"] }),
  });
  const stopMutation = useMutation({
    mutationFn: () => forceStopRound(token, stopReason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "rounds"] }),
  });

  return (
    <AdminShell title="Rounds">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="text-xs font-bold uppercase text-muted">Force start</p>
          <input
            value={startReason}
            onChange={(event) => setStartReason(event.target.value)}
            placeholder="Reason"
            className="mt-3 min-h-12 w-full rounded-md border border-line px-3 text-sm outline-none"
          />
          <Button className="mt-3 w-full" onClick={() => startMutation.mutate()}>
            <Play size={16} /> Start new round
          </Button>
        </Card>
        <Card className="border-[#f1c1c1]">
          <p className="text-xs font-bold uppercase text-[#8d1f1f]">Emergency stop</p>
          <input
            value={stopReason}
            onChange={(event) => setStopReason(event.target.value)}
            placeholder="Required reason, min 8 characters"
            className="mt-3 min-h-12 w-full rounded-md border border-line px-3 text-sm outline-none"
          />
          <Button
            variant="danger"
            className="mt-3 w-full"
            disabled={stopReason.trim().length < 8}
            onClick={() => {
              if (window.confirm("Type STOP ROUND confirmation is sent automatically. Stop the active round now?")) {
                stopMutation.mutate();
              }
            }}
          >
            <OctagonAlert size={16} /> Force stop active round
          </Button>
        </Card>
      </div>

      <div className="mt-4 grid gap-3">
        {data?.rounds.length === 0 ? (
          <Card>
            <p className="font-black">No rounds yet</p>
            <p className="mt-1 text-sm text-muted">The scheduler will create rounds when the engine is running.</p>
          </Card>
        ) : null}
        {data?.rounds.map((round) => (
          <Card key={round.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-extrabold">Round #{round.roundNumber}</p>
                <p className="mt-1 text-xs text-muted">{round.id}</p>
              </div>
              <StatusBadge status={round.status} />
            </div>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <span>Bets: <b>{round.betCount}</b></span>
              <span>Result: <b>{round.result ?? "Pending"}</b></span>
              <span>Ends: <b>{new Date(round.endTime).toLocaleTimeString()}</b></span>
            </div>
          </Card>
        ))}
      </div>
    </AdminShell>
  );
}
