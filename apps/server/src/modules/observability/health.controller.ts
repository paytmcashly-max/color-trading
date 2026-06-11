import type { Request, Response } from "express";

import { env } from "../../config/env.js";
import { getPostgresPool } from "../../database/postgres.client.js";
import { getRedisClient } from "../../database/redis.client.js";
import { getObservability } from "./observability.module.js";

export class HealthController {
  root = async (_req: Request, res: Response) => {
    const [db, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    const healthy = db.status === "healthy" && redis.status === "healthy";

    res.status(healthy ? 200 : 503).json({
      status: healthy ? "healthy" : "unhealthy",
      service: "color-trading-server",
      releaseVersion: env.RELEASE_VERSION,
      dependencies: {
        db,
        redis,
        socket: this.socketHealth(),
      },
      metrics: getObservability().metrics.getSnapshot(),
      timestamp: new Date().toISOString(),
    });
  };

  liveness = async (_req: Request, res: Response) => {
    res.status(200).json({
      status: "alive",
      service: "color-trading-server",
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  };

  readiness = async (_req: Request, res: Response) => {
    const [db, redis, migrations] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkMigrations(),
    ]);
    const readiness = evaluateReadiness({
      dbHealthy: db.status === "healthy",
      redisHealthy: redis.status === "healthy",
      migrationsReady: migrations.status === "healthy",
      gameEngineEnabled: env.GAME_ENGINE_ENABLED,
    });

    res.status(readiness.ready ? 200 : 503).json({
      status: readiness.ready ? "ready" : "not_ready",
      service: "color-trading-server",
      releaseVersion: env.RELEASE_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
      dependencies: {
        db,
        redis,
        migrations,
        gameEngine: readiness.gameEngine,
      },
      timestamp: new Date().toISOString(),
    });
  };

  db = async (_req: Request, res: Response) => {
    const health = await this.checkDatabase();
    res.status(health.status === "healthy" ? 200 : 503).json(health);
  };

  redis = async (_req: Request, res: Response) => {
    const health = await this.checkRedis();
    res.status(health.status === "healthy" ? 200 : 503).json(health);
  };

  socket = async (_req: Request, res: Response) => {
    res.status(200).json(this.socketHealth());
  };

  metrics = async (_req: Request, res: Response) => {
    res.status(200).json(getObservability().metrics.getSnapshot());
  };

  private async checkDatabase() {
    const pool = getPostgresPool();

    if (!pool) {
      return {
        status: "unhealthy",
        connection: "not_configured",
        latencyMs: null,
      };
    }

    const startedAt = Date.now();

    try {
      await pool.query("SELECT 1");
      return {
        status: "healthy",
        connection: "ready",
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      getObservability().alerts.send({
        type: "DB_CONNECTION_FAILED",
        severity: "HIGH",
        message: "PostgreSQL health check failed.",
        metadata: { error: String(error) },
      });
      return {
        status: "unhealthy",
        connection: "failed",
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  private async checkRedis() {
    const redis = getRedisClient();

    if (!redis) {
      return {
        status: "unhealthy",
        connection: "not_configured",
        latencyMs: null,
      };
    }

    const startedAt = Date.now();

    try {
      if (redis.status === "wait") {
        await redis.connect();
      }

      await redis.ping();
      return {
        status: "healthy",
        connection: redis.status,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      getObservability().alerts.send({
        type: "REDIS_CONNECTION_FAILED",
        severity: "HIGH",
        message: "Redis health check failed.",
        metadata: { error: String(error) },
      });
      return {
        status: "unhealthy",
        connection: "failed",
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  private async checkMigrations() {
    const pool = getPostgresPool();

    if (!pool) {
      return {
        status: "unhealthy",
        applied: false,
      };
    }

    try {
      const result = await pool.query<{ migrations: string | null }>(
        "SELECT to_regclass('public.schema_migrations')::text AS migrations",
      );

      return {
        status: result.rows[0]?.migrations ? "healthy" : "unhealthy",
        applied: Boolean(result.rows[0]?.migrations),
      };
    } catch {
      return {
        status: "unhealthy",
        applied: false,
      };
    }
  }

  private socketHealth() {
    return {
      status: "healthy",
      connection: "ready",
      activeSockets: getObservability().metrics.getGauge("active_sockets"),
      latencyMs: 0,
    };
  }
}

export function evaluateReadiness(input: {
  dbHealthy: boolean;
  redisHealthy: boolean;
  migrationsReady: boolean;
  gameEngineEnabled: boolean;
}) {
  const dependenciesReady = input.dbHealthy && input.redisHealthy && input.migrationsReady;

  return {
    ready: dependenciesReady,
    gameEngine: {
      enabled: input.gameEngineEnabled,
      dependenciesReady,
      status: input.gameEngineEnabled
        ? dependenciesReady ? "ready" : "blocked"
        : "disabled",
    },
  };
}
