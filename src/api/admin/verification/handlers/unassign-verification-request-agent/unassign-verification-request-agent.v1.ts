import { NextFunction, Request, Response } from "express";
import { ApiError, ConflictError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { logger } from "../../../../../utils/logger";
import { unassignAgentFromVerificationRequest } from "../../services/database/agent-assignment";

export const unassignVerificationRequestAgent = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await unassignAgentFromVerificationRequest(req.params.id);
    if (result === "NOT_ASSIGNED") {
      return next(new NotFoundError("Verification request has no assigned agent."));
    }
    if (result === "REPORT_SUBMITTED") {
      return next(new ConflictError("The agent has already submitted the report."));
    }
    res.status(HttpStatusCode.OK).json({ verificationRequestId: req.params.id, status: "PENDING" });
  } catch (error) {
    logger.error(`Error unassigning agent: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
