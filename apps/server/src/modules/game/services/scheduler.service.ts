import { env } from "../../../config/env.js";
import { logger } from "../../../common/utils/logger.js";
import { getObservability } from "../../observability/observability.module.js";
import {
  ROUND_LOCK_TTL_MS,
  ROUND_SCHEDULER_TICK_MS,
} from "../game.constants.js";
import type { RoundService } from "./round.service.js";
import type { RedisLockService } from "./redis-lock.service.js";

export class SchedulerService {
  private interval: NodeJS.Timeout | null = null;
  private running = false;
  private lastReportedFailure = "";
  private lastReportedFailureAt = 0;

  constructor(
    private readonly roundService: RoundService,
    private readonly redisLockService: RedisLockService,
  ) {}

  start() {
    if (!env.GAME_ENGINE_ENABLED || this.interval) {
      return;
    }

    this.interval = setInterval(() => {
      this.tick().catch((error: unknown) => {
        this.reportFailure("ROUND_ENGINE_FAILURE", "round_engine_tick_failed", error);
      });
    }, ROUND_SCHEDULER_TICK_MS);

    this.tick().catch((error: unknown) => {
      this.reportFailure("ROUND_ENGINE_INITIAL_FAILURE", "round_engine_initial_tick_failed", error);
    });
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async tick() {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      const result = await this.redisLockService.withLock(
        "game:round-engine:lock",
        ROUND_LOCK_TTL_MS,
        () => this.roundService.ensureLifecycle(),
      );

      if (result === null) {
        return;
      }
    } finally {
      this.running = false;
    }
  }

  private reportFailure(type: string, message: string, error: unknown) {
    const signature = `${type}:${String(error)}`;
    const now = Date.now();

    if (signature === this.lastReportedFailure && now - this.lastReportedFailureAt < 60_000) {
      return;
    }

    this.lastReportedFailure = signature;
    this.lastReportedFailureAt = now;
    logger.error(message, { error });
    getObservability().alerts.send({
      type,
      severity: "HIGH",
      message: "Game scheduler tick failed.",
      metadata: { error: String(error) },
    });
  }
}
