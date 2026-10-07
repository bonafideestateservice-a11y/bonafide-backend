import { NextFunction, Request, Response } from "express";
import { ApiError, BadRequestError, HttpStatusCode } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import {
  AnalyticsRange,
  analyticsRanges,
  getDashboardAnalytics,
} from "../../services/database/dashboard";

export const getDashboardAnalyticsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const range = (req.query.range ?? "this_week") as AnalyticsRange;
  if (!analyticsRanges.includes(range)) {
    return next(new BadRequestError(`range must be one of: ${analyticsRanges.join(", ")}.`));
  }
  try {
    res.status(HttpStatusCode.OK).json(await getDashboardAnalytics(range));
  } catch (error) {
    logger.error(`Error getting dashboard analytics: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
