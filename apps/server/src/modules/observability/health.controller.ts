import type { Request, Response } from "express";

import { getPostgresPool } from "../../database/postgres.client.js";
import { getRedisClient } from "../../database/redis.client.js";
import { getObservability } from "./observability.module.js";

export class HealthController {
  root = async (_req: Request, res: Response) => {
    const [db, redis] = await Promise.all([this.dbHealth(), this.redisHealth()]);

    res.status(db.status === "healthy" && redis.status === "healthy" ? 200 : 503).json({
      status: db.status === "healthy" && redis.status === "healthy" ? "healthy" : "unhealthy",
      service: "color-trading-server",
      dependencies: {
        db,
        redis,
        socket: this.socketHealth(),
      },
      metrics: getObservability().metrics.getSnapshot(),
      timestamp: new Date().toISOString(),
    });
  };

  db = async (_req: Request, res: Response) => {
    const health = await this.dbHealth();
    res.status(health.status === "healthy" ? 200 : 503).json(health);
  };

  redis = async (_req: Request, res: Response) => {
    const health = await this.redisHealth();
    res.status(health.status === "healthy" ? 200 : 503).json(health);
  };

  socket = async (_req: Request, res: Response) => {
    res.status(200).json(this.socketHealth());
  };

  metrics = async (_req: Request, res: Response) => {
    res.status(200).json(getObservability().metrics.getSnapshot());
  };

  private async dbHealth() {
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

  private async redisHealth() {
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

  private socketHealth() {
    return {
      status: "healthy",
      connection: "ready",
      activeSockets: getObservability().metrics.getGauge("active_sockets"),
      latencyMs: 0,
    };
  }
}
