import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import {
  findPropertyRequest,
  toRequestResponse,
} from "../../../../services/database/property-request";
import { userIdOf } from "../shared";

/** The purchase status screen: progress steps, updates, payment and property. */
export const getPropertyRequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const request = await findPropertyRequest({ id: req.params.id, userId: userIdOf(req) });
    if (!request) return next(new NotFoundError("Purchase request not found."));
    res.status(HttpStatusCode.OK).json(toRequestResponse(request));
  } catch (error) {
    logger.error(`Error getting property request: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
