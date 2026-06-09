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
      success: false,
      message: error.message,
      data: {
        code: error.code,
      },
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: "Invalid request payload",
      data: {
        code: "VALIDATION_ERROR",
        details: error.flatten().fieldErrors,
      },
    });
    return;
  }

  if (isHttpParserError(error)) {
    res.status(error.statusCode).json({
      success: false,
      message: "Request body must be valid JSON.",
      data: {
        code: "INVALID_JSON",
      },
    });
    return;
  }

  captureRequestError(error, req);
  logger.error("unhandled_request_error", { error });
  res.status(500).json({
    success: false,
    message: "Unexpected server error",
    data: {
      code: "INTERNAL_SERVER_ERROR",
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
