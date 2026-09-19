import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { getVerificationAgentByUserId } from "../../../authentication/services/database/agent";
import { submitAgentAssignmentReport } from "../../services/database/verification-report";
import { logger } from "../../../../../utils/logger";

export const submitAgentReport = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = (req as CustomRequest).user?.id;
    if (!userId) {
      return next(new ApiError(HttpStatusCode.UNAUTHORIZED, "Authentication required."));
    }

    const agent = await getVerificationAgentByUserId(userId);
    if (!agent) return next(new NotFoundError("Verification agent not found."));

    const result = await submitAgentAssignmentReport(agent.id, req.params.id);
    if (!result) return next(new NotFoundError("Assignment not found."));

    if (result.kind === "INCOMPLETE_CHECKLIST") {
      res.status(HttpStatusCode.CONFLICT).json({
        error: result.kind,
        progressPercent: result.progressPercent,
        remainingItems: result.remainingItems,
      });
      return;
    }

    res.status(HttpStatusCode.CREATED).json({
      id: result.id,
      reviewStatus: result.reviewStatus,
      generatedAt: result.generatedAt.toISOString(),
    });
  } catch (error) {
    logger.error(`Error submitting agent report: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default submitAgentReport;
