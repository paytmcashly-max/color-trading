import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import { HttpError } from "../errors/http-error.js";
import { logger } from "../utils/logger.js";
import { captureRequestError } from "../../modules/observability/error.handler.js";

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  void _next;

  if (error instanceof HttpError) {
    if (error.statusCode >= 500) {
      captureRequestError(error, req);
    }
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request payload",
        details: error.flatten().fieldErrors,
      },
    });
    return;
  }

  if (isHttpParserError(error)) {
    res.status(error.statusCode).json({
      error: {
        code: "INVALID_JSON",
        message: "Request body must be valid JSON.",
      },
    });
    return;
  }

  captureRequestError(error, req);
  logger.error("unhandled_request_error", { error });
  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Unexpected server error",
    },
  });
}

function isHttpParserError(error: unknown): error is { statusCode: number; type?: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof (error as { statusCode?: unknown }).statusCode === "number" &&
    (error as { statusCode: number }).statusCode >= 400 &&
    (error as { statusCode: number }).statusCode < 500
  );
}
