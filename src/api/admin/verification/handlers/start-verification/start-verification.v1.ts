import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { getVerificationAgentByUserId } from "../../../authentication/services/database/agent";
import { startAgentAssignment as startAssignment } from "../../services/database/agent-assignment";
import { logger } from "../../../../../utils/logger";

export const startVerification = async (
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

    const assignment = await startAssignment(agent.id, req.params.id);
    if (!assignment) return next(new NotFoundError("Assignment not found."));

    res.status(HttpStatusCode.OK).json(assignment);
  } catch (error) {
    logger.error(`Error starting verification assignment: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default startVerification;
