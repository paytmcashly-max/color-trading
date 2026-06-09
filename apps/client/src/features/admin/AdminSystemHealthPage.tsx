"use client";

import { Database, RadioTower, Server, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { AdminMetric } from "@/components/admin/AdminMetric";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card } from "@/components/ui/Card";
import {
  fetchAdminAuditLogs,
  fetchAdminFraudLogs,
  fetchAdminRiskProfiles,
  fetchAdminSystemHealth,
} from "@/services/api-client";
import { useAdminToken } from "@/features/admin/useAdminToken";

export function AdminSystemHealthPage() {
  const token = useAdminToken();
  const health = useQuery({
    queryKey: ["admin", "health"],
    queryFn: () => fetchAdminSystemHealth(token),
    enabled: Boolean(token),
    refetchInterval: 10_000,
  });
  const audit = useQuery({
    queryKey: ["admin", "audit-logs"],
    queryFn: () => fetchAdminAuditLogs(token),
    enabled: Boolean(token),
    refetchInterval: 20_000,
  });
  const fraud = useQuery({
    queryKey: ["admin", "fraud-logs"],
    queryFn: () => fetchAdminFraudLogs(token),
    enabled: Boolean(token),
    refetchInterval: 15_000,
  });
  const risk = useQuery({
    queryKey: ["admin", "risk-profiles"],
    queryFn: () => fetchAdminRiskProfiles(token),
    enabled: Boolean(token),
    refetchInterval: 15_000,
  });

  return (
    <AdminShell title="System Health">
      <div className="grid gap-4 md:grid-cols-4">
        <AdminMetric label="API status" value={health.data?.status ?? "--"} icon={<Server size={20} />} />
        <AdminMetric label="Active users" value={health.data?.activeUsers ?? "--"} icon={<Users size={20} />} />
        <AdminMetric label="Postgres" value={health.data?.dependencies.postgres ?? "--"} icon={<Database size={20} />} />
        <AdminMetric label="Redis" value={health.data?.dependencies.redis ?? "--"} icon={<RadioTower size={20} />} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <p className="text-xs font-bold uppercase text-muted">Realtime metrics</p>
          <div className="mt-3 grid gap-2 text-sm">
            <MetricLine label="Active sockets" value={health.data?.observability?.activeSockets ?? "--"} />
            <MetricLine label="Bets/min" value={health.data?.observability?.betsPerMinute ?? "--"} />
            <MetricLine label="Wallet tx/min" value={health.data?.observability?.walletTransactionsPerMinute ?? "--"} />
            <MetricLine label="Error rate/min" value={health.data?.observability?.errorRatePerMinute ?? "--"} />
            <MetricLine label="Avg latency" value={`${health.data?.observability?.averageHttpLatencyMs ?? "--"} ms`} />
          </div>
        </Card>

        <Card>
          <p className="text-xs font-bold uppercase text-muted">High-risk users</p>
          <div className="mt-3 grid gap-2">
            {risk.data?.riskProfiles.slice(0, 6).map((profile) => (
              <div key={profile.userId} className="rounded-md border border-line bg-[#f8fbf8] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-extrabold">{profile.user?.email ?? profile.userId}</span>
                  <span className="text-sm font-extrabold text-[#8d1f1f]">{profile.riskScore}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Blocked: {profile.isBlocked ? "yes" : "no"} | Bot: {profile.botSuspected ? "yes" : "no"}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <p className="text-xs font-bold uppercase text-muted">Recent fraud alerts</p>
          <div className="mt-3 grid gap-2">
            {fraud.data?.fraudLogs.slice(0, 6).map((log) => (
              <div key={log.id} className="rounded-md border border-line bg-[#fffaf0] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-extrabold">{log.eventType}</span>
                  <span className="text-xs font-bold">{log.severity}</span>
                </div>
                <p className="mt-1 break-all text-xs text-muted">
                  {log.userId ?? "anonymous"} | {new Date(log.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <p className="text-xs font-bold uppercase text-muted">Audit logs</p>
        <div className="mt-3 grid gap-2">
          {audit.data?.auditLogs.map((log) => (
            <div key={log.id} className="rounded-md border border-line bg-[#f8fbf8] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-extrabold">{log.actionType}</span>
                <span className="text-xs text-muted">{new Date(log.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-1 break-all text-xs text-muted">
                Admin {log.adminUserId} | {log.targetType ?? "SYSTEM"} {log.targetId ?? ""}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </AdminShell>
  );
}

function MetricLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-[#f8fbf8] px-3 py-2">
      <span className="font-bold">{label}</span>
      <span>{value}</span>
    </div>
  );
}
