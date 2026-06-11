import http from "node:http";

import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./common/utils/logger.js";
import { startGameEngine } from "./modules/game/game.bootstrap.js";
import { flushObservability, startObservability } from "./modules/observability/observability.module.js";
import { createSocketServer } from "./sockets/socket.server.js";

async function bootstrap() {
  const app = createApp();
  const httpServer = http.createServer(app);

  startObservability();
  await createSocketServer(httpServer);
  startGameEngine();

  httpServer.listen(env.PORT, () => {
    logger.info("server_listening", {
      port: env.PORT,
      apiVersion: env.API_VERSION,
      releaseVersion: env.RELEASE_VERSION,
      socketCorsOrigin: env.SOCKET_CORS_ORIGIN,
      gameEngineEnabled: env.GAME_ENGINE_ENABLED,
    });
  });

  const shutdown = (signal: string) => {
    logger.warn("server_shutdown_requested", { signal });
    httpServer.close(() => {
      flushObservability()
        .catch((error: unknown) => {
          logger.error("observability_flush_failed_on_shutdown", { error });
        })
        .finally(() => {
          process.exit(0);
        });
    });
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

bootstrap().catch((error: unknown) => {
  logger.error("server_bootstrap_failed", { error });
  process.exit(1);
});
