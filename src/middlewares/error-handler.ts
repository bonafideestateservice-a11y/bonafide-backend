import { NextFunction, Request, Response } from "express";
import { MulterError } from "multer";

import { ApiError, HttpStatusCode } from "../exceptions";
import { logger } from "../utils/logger";

export const notFoundHandler = (_req: Request, res: Response) => {
  res.status(HttpStatusCode.NOT_FOUND).json({
    status: "error",
    message: "Route not found",
  });
};

/** A JSON body express.json couldn't parse (e.g. a trailing comma). */
const isMalformedJson = (error: Error) =>
  error instanceof SyntaxError &&
  (error as SyntaxError & { type?: string }).type === "entity.parse.failed";

export const errorHandler = (error: Error, _req: Request, res: Response, _next: NextFunction) => {
  const send = (statusCode: number, message: string) =>
    res.status(statusCode).json({ status: "error", message });

  // Log lines are tagged with the request's method and path by the request context.
  if (error instanceof ApiError) {
    logger.warn(`${error.statusCode} ${error.message}`);
    return send(error.statusCode, error.message);
  }
  if (isMalformedJson(error)) {
    logger.warn(`400 Request body is not valid JSON: ${error.message}`);
    return send(HttpStatusCode.BAD_REQUEST, "Request body is not valid JSON.");
  }
  if (error instanceof MulterError) {
    logger.warn(`400 Upload rejected: ${error.message} (field: ${error.field ?? "unknown"})`);
    return send(HttpStatusCode.BAD_REQUEST, `${error.message}.`);
  }

  logger.error(`500 Unhandled error: ${error.stack ?? error.message}`);
  return send(HttpStatusCode.INTERNAL_SERVER, "Internal server error");
};
