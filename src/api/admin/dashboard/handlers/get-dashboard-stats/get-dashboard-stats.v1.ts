import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { getDashboardStats } from "../../services/database/dashboard";

export const getDashboardStatsHandler = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const stats = await getDashboardStats();
    res.status(HttpStatusCode.OK).json(stats);
  } catch (error) {
    logger.error(`Error getting dashboard stats: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default getDashboardStatsHandler;
