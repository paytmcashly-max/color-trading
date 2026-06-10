import type { Prisma, PrismaClient } from "@prisma/client";

const METRIC_FLUSH_INTERVAL_MS = 5000;
const METRIC_WINDOW_MS = 60_000;

interface Measurement {
  value: number;
  timestamp: number;
}

export class MetricsService {
  private readonly counters = new Map<string, number[]>();
  private readonly gauges = new Map<string, number>();
  private readonly measurements = new Map<string, Measurement[]>();
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

  recordMeasurement(metricName: string, value: number) {
    const now = Date.now();
    const measurements = this.measurements.get(metricName) ?? [];
    measurements.push({ value, timestamp: now });
    this.measurements.set(metricName, pruneMeasurements(measurements, now));
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

  getMeasurementAverage(metricName: string) {
    const measurements = this.getMeasurements(metricName);
    if (measurements.length === 0) {
      return 0;
    }

    return Math.round(
      measurements.reduce((total, measurement) => total + measurement.value, 0) /
        measurements.length,
    );
  }

  getMeasurementPercentile(metricName: string, percentile: number) {
    const values = this.getMeasurements(metricName)
      .map((measurement) => measurement.value)
      .sort((left, right) => left - right);

    if (values.length === 0) {
      return 0;
    }

    const index = Math.min(values.length - 1, Math.ceil(values.length * percentile) - 1);
    return Math.round(values[index] ?? 0);
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
      requestsPerMinute: this.getPerMinute("http_requests"),
      clientErrorsPerMinute: this.getPerMinute("http_4xx"),
      serverErrorsPerMinute: this.getPerMinute("http_5xx"),
      errorRatePerMinute: this.getPerMinute("http_errors"),
      averageHttpLatencyMs: this.getMeasurementAverage("http_latency_ms"),
      p95HttpLatencyMs: this.getMeasurementPercentile("http_latency_ms", 0.95),
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
      ["requests_per_minute", snapshot.requestsPerMinute],
      ["http_4xx_per_minute", snapshot.clientErrorsPerMinute],
      ["http_5xx_per_minute", snapshot.serverErrorsPerMinute],
      ["error_rate_per_minute", snapshot.errorRatePerMinute],
      ["average_http_latency_ms", snapshot.averageHttpLatencyMs],
      ["p95_http_latency_ms", snapshot.p95HttpLatencyMs],
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

  private getMeasurements(metricName: string) {
    const now = Date.now();
    const measurements = pruneMeasurements(this.measurements.get(metricName) ?? [], now);
    this.measurements.set(metricName, measurements);
    return measurements;
  }
}

function pruneWindow(timestamps: number[], now: number) {
  return timestamps.filter((timestamp) => now - timestamp <= METRIC_WINDOW_MS);
}

function pruneMeasurements(measurements: Measurement[], now: number) {
  return measurements.filter((measurement) => now - measurement.timestamp <= METRIC_WINDOW_MS);
}
