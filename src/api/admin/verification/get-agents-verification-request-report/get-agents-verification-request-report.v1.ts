import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../exceptions";
import { CustomRequest } from "../../../../middlewares/check-jwt";
import { getVerificationAgentByUserId } from "../../authentication/services/database/agent";
import { getAgentVerificationRequestReport } from "../services/database/verification-report";
import { logger } from "../../../../utils/logger";

export const getAgentsVerificationRequestReport = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = (req as CustomRequest).user?.id;
    if (!userId) return next(new ApiError(HttpStatusCode.UNAUTHORIZED, "Authentication required."));
    const agent = await getVerificationAgentByUserId(userId);
    if (!agent) return next(new NotFoundError("Verification agent not found."));
    const report = await getAgentVerificationRequestReport(agent.id, req.params.id);
    if (!report) return next(new NotFoundError("Verification report not found."));
    res.status(HttpStatusCode.OK).json(report);
  } catch (error) {
    logger.error(`Error getting verification request report: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default getAgentsVerificationRequestReport;
