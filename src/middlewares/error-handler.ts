import { NextFunction, Request, Response } from "express";

import { ApiError, HttpStatusCode } from "../exceptions";
import { logger } from "../utils/logger";

export const notFoundHandler = (_req: Request, res: Response) => {
  res.status(HttpStatusCode.NOT_FOUND).json({
    status: "error",
    message: "Route not found",
  });
};

export const errorHandler = (
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (error instanceof ApiError) {
    logger.warn(error.message);
    res.status(error.statusCode).json({
      status: "error",
      message: error.message,
    });
    return;
  }

  logger.error(error.message);

  res.status(HttpStatusCode.INTERNAL_SERVER).json({
    status: "error",
    message: "Internal server error",
  });
};