import { NextFunction, Request, Response } from "express";

import { ApiError, HttpStatusCode } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { countUnviewedVerificationReports } from "../../services/database/verification-report";
import { logger } from "../../../../../utils/logger";

export const getVerificationReportSummary = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const customReq = req as CustomRequest;
    const userId = customReq.user?.id ?? customReq.token?.id;

    if (!userId) {
      return next(
        new ApiError(HttpStatusCode.UNAUTHORIZED, "Authentication required."),
      );
    }

    const unviewedReportsCount = await countUnviewedVerificationReports(userId);

    res.status(HttpStatusCode.OK).json({ unviewedReportsCount });
  } catch (error) {
    logger.error(`Error getting verification report summary: ${error}`);
    next(
      new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."),
    );
  }
};
