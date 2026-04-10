import type { NextFunction, Request, RequestHandler, Response } from "express";
import { logger } from "../lib/logger";
import { HttpError } from "../lib/http-errors";

export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
    });
    return;
  }

  logger.error({ err }, "Unhandled API error");
  res.status(500).json({
    error: "Internal server error",
  });
}
