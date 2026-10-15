import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { getPropertyLocations } from "../../services/database/property";

/** The Explore Properties location dropdown. Public. */
export const getPropertyLocationsHandler = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    res.status(HttpStatusCode.OK).json({ data: await getPropertyLocations() });
  } catch (error) {
    logger.error(`Error getting property locations: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
