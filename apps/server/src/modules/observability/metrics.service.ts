import type { Prisma, PrismaClient } from "@prisma/client";

const METRIC_FLUSH_INTERVAL_MS = 5000;
const METRIC_WINDOW_MS = 60_000;

export class MetricsService {
  private readonly counters = new Map<string, number[]>();
  private readonly gauges = new Map<string, number>();
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaClient) {}

  start() {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setInterval(() => {
      void this.flushSnapshot();
    }, METRIC_FLUSH_INTERVAL_MS);
    this.flushTimer.unref();
  }

  incrementCounter(metricName: string, amount = 1) {
    const timestamps = this.counters.get(metricName) ?? [];
    const now = Date.now();

    for (let index = 0; index < amount; index += 1) {
      timestamps.push(now);
    }

    this.counters.set(metricName, pruneWindow(timestamps, now));
  }

  setGauge(metricName: string, value: number) {
    this.gauges.set(metricName, value);
  }

  getPerMinute(metricName: string) {
    const now = Date.now();
    const timestamps = pruneWindow(this.counters.get(metricName) ?? [], now);
    this.counters.set(metricName, timestamps);
    return timestamps.length;
  }

  getGauge(metricName: string) {
    return this.gauges.get(metricName) ?? 0;
  }

  getSnapshot() {
    return {
      activeSockets: this.getGauge("active_sockets"),
      activeUsers: this.getGauge("active_users"),
      currentRoundId: this.gauges.has("current_round_numeric_id")
        ? String(this.getGauge("current_round_numeric_id"))
        : null,
      betsPerMinute: this.getPerMinute("bets"),
      walletTransactionsPerMinute: this.getPerMinute("wallet_transactions"),
      errorRatePerMinute: this.getPerMinute("http_errors"),
      averageHttpLatencyMs: this.getGauge("average_http_latency_ms"),
      timestamp: new Date().toISOString(),
    };
  }

  async flushSnapshot() {
    const snapshot = this.getSnapshot();
    const rows = [
      ["active_sockets", snapshot.activeSockets],
      ["active_users", snapshot.activeUsers],
      ["bets_per_minute", snapshot.betsPerMinute],
      ["wallet_transactions_per_minute", snapshot.walletTransactionsPerMinute],
      ["error_rate_per_minute", snapshot.errorRatePerMinute],
      ["average_http_latency_ms", snapshot.averageHttpLatencyMs],
    ].map(([metricName, value]) => ({
      metricName: String(metricName),
      value: Number(value),
      metadata: snapshot as unknown as Prisma.InputJsonObject,
    }));

    try {
      await this.prisma.systemMetric.createMany({ data: rows });
    } catch (error) {
      console.warn("observability_metric_flush_failed", error);
    }
  }
}

function pruneWindow(timestamps: number[], now: number) {
  return timestamps.filter((timestamp) => now - timestamp <= METRIC_WINDOW_MS);
}
