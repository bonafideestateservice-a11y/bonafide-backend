import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { getAllActivities } from "../../services/database/activities";

export const getAllActivitiesHandler = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const activities = await getAllActivities();
    res.status(HttpStatusCode.OK).json({ activities });
  } catch (error) {
    logger.error(`Error getting admin activities: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default getAllActivitiesHandler;
