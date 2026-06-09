import morgan from "morgan";

import { env } from "../../config/env.js";
import { logger } from "../utils/logger.js";

export const requestLogger = morgan(env.NODE_ENV === "production" ? "combined" : "dev", {
  stream: {
    write(message) {
      logger.info("http_request", {
        accessLog: message.trim(),
      });
    },
  },
});
