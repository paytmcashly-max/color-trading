import rateLimit from "express-rate-limit";

export const globalApiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith("/health"),
  message: {
    error: {
      code: "GLOBAL_RATE_LIMITED",
      message: "Too many requests. Please retry shortly.",
    },
  },
});
