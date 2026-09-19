import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  HttpStatusCode,
  NotFoundError,
} from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { getVerificationAgentByUserId } from "../../../authentication/services/database/agent";
import { updateAgentAssignmentNotes } from "../../services/database/agent-assignment";
import { logger } from "../../../../../utils/logger";

export const updateAgentAssignment = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = (req as CustomRequest).user?.id;
    if (!userId) {
      return next(new ApiError(HttpStatusCode.UNAUTHORIZED, "Authentication required."));
    }
    if (typeof req.body.additionalNotes !== "string") {
      return next(new BadRequestError("additionalNotes must be a string."));
    }

    const agent = await getVerificationAgentByUserId(userId);
    if (!agent) return next(new NotFoundError("Verification agent not found."));

    const updated = await updateAgentAssignmentNotes(
      agent.id,
      req.params.id,
      req.body.additionalNotes,
    );
    if (!updated) return next(new NotFoundError("Assignment not found."));

    res.status(HttpStatusCode.OK).json({
      id: req.params.id,
      additionalNotes: req.body.additionalNotes,
    });
  } catch (error) {
    logger.error(`Error updating agent assignment notes: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default updateAgentAssignment;
