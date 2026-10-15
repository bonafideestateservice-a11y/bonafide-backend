import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import {
  findPropertyRequest,
  toAdminRequestResponse,
} from "../../../../services/database/property-request";

/** One purchase or consultation request, with its client, updates and payment. */
export const getAdminPropertyRequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const request = await findPropertyRequest({ id: req.params.id });
    if (!request) return next(new NotFoundError("Property request not found."));
    res.status(HttpStatusCode.OK).json(toAdminRequestResponse(request));
  } catch (error) {
    logger.error(`Error getting property request for admin: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
