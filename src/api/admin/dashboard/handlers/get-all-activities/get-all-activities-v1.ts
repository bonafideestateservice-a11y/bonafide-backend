import { NextFunction, Request, Response } from "express";
import { ApiError, BadRequestError, HttpStatusCode } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { parsePaging } from "../../../../../utils/validations";
import { getActivities } from "../../services/database/activities";

export const getAllActivitiesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const paging = parsePaging(req.query);
  if (!paging)
    return next(new BadRequestError("page and limit must be positive integers (limit ≤ 100)."));
  try {
    res.status(HttpStatusCode.OK).json(await getActivities(paging.page, paging.limit));
  } catch (error) {
    logger.error(`Error getting admin activities: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default getAllActivitiesHandler;
